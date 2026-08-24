# M2 Pointer Field and Magnetic — Technical Design

## Problem statement

The renderer needs a reusable continuous pointer authority, but the only current implementation is an Edge Glow-specific compatibility adapter embedded in a large presentation surface. Magnetic is the first real consumer and must not reintroduce React pointer state, compete with shell morph transforms, or move the native BrowserWindow.

## Decision summary

- Use viewport-local Motion values as the sole continuous pointer authority.
- Keep the authority local to the Main Window presentation surface; do not create context or global infrastructure.
- Implement Magnetic as a separate consumer module and enable it only for full mode with normal motion.
- Compose Magnetic on one outer renderer layer around the existing shadow + shell pair.
- Keep the shell's existing morph recipe and Motion completion callback unchanged on the inner shell node.
- Reset the Pointer Field to the stable viewport center on semantic pointer leave; do not add an `active` boolean that duplicates lifecycle pointer truth.
- Remove Edge Glow and its compatibility utilities entirely.
- Make no Electron Main, preload bridge, Native Surface, Download Feature, or lifecycle-reducer change.

## Target composition

```text
Stable BrowserWindow viewport (native surface never follows the pointer)
  -> stable presentation root (Pointer Field coordinate space)
     -> Magnetic visual wrapper (renderer-only x/y)
        -> shadow morph node (existing geometry x/y/size/radius/scale)
        -> shell morph node (existing geometry x/y/size/radius/scale + epoch completion)
           -> content / compact icon / discrete drag glow
```

The Magnetic wrapper and shell morph nodes own transforms on different DOM nodes. No transform value is merged, mirrored, or written by two owners.

## Planned module boundaries

### Pointer Field

Replace the temporary Edge Glow `motionRuntime.ts` boundary with a focused module (planned name: `pointerField.ts`). It owns:

- the `x` and `y` Motion values;
- creation of the field for one Main Window presentation instance;
- a pure/stable writer from client coordinates plus the stable root rectangle;
- centering/reset behavior and finite/clamp validation.

It does not own:

- React application state or lifecycle pointer-inside truth;
- event listeners, DOM refs, Magnetic strength, springs, shell geometry, native coordinates, or screen/window position;
- provider/context/global registration or future-consumer routing.

The coordinate contract is viewport-local pixels. The field origin is the stable presentation root's top-left. This remains useful to later visual consumers without pre-designing them.

### Magnetic consumer

Add a focused consumer module (planned name: `magnetic.ts`). It owns:

- pure conversion from Pointer Field point + viewport center into a bounded two-dimensional displacement;
- the small Magnetic strength/range and spring response constants;
- MotionValue derivation/smoothing for the outer visual wrapper;
- policy input that resolves displacement to zero outside full mode and under reduced motion.

It does not import or dispatch lifecycle events, native/desktop runtime APIs, Electron, Download Feature state, or shell geometry mutation. It has no completion callback.

Use a simple bounded radial response. The exact tuning is intentionally local and small; the implementation should prefer one maximum-displacement constant and one spring recipe over a configurable framework.

### MainWindowPresentationSurface

The surface remains the DOM wiring boundary:

- hold a ref to the stable viewport root;
- write pointer coordinates from root-relative client points;
- reset the field through the centralized semantic pointer-fact handler on leave;
- request Magnetic derived values using the current visual mode and reduced-motion preference;
- render the one outer Magnetic wrapper around the existing shadow and shell nodes.

It must not contain Magnetic math/spring constants or a second motion lifecycle. Existing manual drag, drop, hotspot, pointer-boundary, geometry, recipe, and completion paths remain in place.

## Data flows

### Continuous visual path

```text
pointer move bubbles through stable presentation root
  -> client point normalized against stable root rect
  -> Pointer Field x/y MotionValues
  -> Magnetic bounded target transform
  -> optional spring smoothing
  -> outer renderer wrapper x/y
```

There is no React `setState`, reducer event, desktop bridge call, or native window movement in this path.

### Discrete semantic pointer path

```text
DOM enter/leave, native pointer-boundary fact, compact hotspot, drop fact
  -> existing centralized pointer/drop handlers
  -> existing presentation lifecycle events / locks
  -> existing projections/effects/native policies
```

This path remains authoritative for lifecycle and interaction semantics. Pointer Field coordinates never decide full/compact state.

### Manual window drag path

```text
pointer down + threshold + capture
  -> existing drag lock
  -> screen delta
  -> rAF-batched desktopCurrentWindow.setPosition
```

This is the only pointer-driven native position path and is not Magnetic. Magnetic should resolve toward zero while the lifecycle drag lock is active so visual displacement does not interfere with manual window dragging.

## Full-only and compact policy

- `full` / `collapsePending`: Magnetic may respond when the drag lock is inactive and reduced motion is off.
- `expanding`: Magnetic may remain zero until the visual projection is full and interaction is stable; implementation should avoid introducing a separate transition phase.
- `collapsing` / `compact`: Magnetic is zero.
- Compact hotspot mousemove continues to serve only compact wake semantics. It does not need to update the M2 field for a disabled consumer.

This intentionally avoids changing passthrough, hotspot, native pointer-boundary, or compact reachability architecture for a few pixels of movement.

## Reduced-motion policy

- The rendered Magnetic wrapper uses immediate numeric zero displacement when reduced motion is enabled; it does not wait for a spring to settle.
- Pointer Field Motion values may continue to update because they are runtime data, not an animation or business fact.
- Existing lifecycle events, completion epochs, passthrough, focus, drag, hotspot, and native compact reachability continue unchanged.
- Existing shell/icon reduced-motion recipes remain owned by `motionRecipes.ts`; Magnetic does not alter them.

## Edge Glow removal

Delete:

- Edge Glow imports, constants, Motion templates/transforms, React visibility state, reveal timers, screen-point ref/correction, lifecycle choreography, and overlay DOM;
- `mainWindowEdgeGlowPosition` helper/tests;
- temporary compatibility names and tests in `motionRuntime`.

Retain:

- the discrete drag/drop glow and its theme-driven appearance;
- ordinary local hover state needed by application content;
- centralized semantic pointer facts used by lifecycle.

Update frontend specs that describe `motionRuntime.ts` as a temporary adapter or document the removed pointer-following border pattern as the Main Window contract.

## Semantic test design

Prefer pure and boundary tests:

1. Pointer Field writer tests: stable root-relative coordinates, clamping/finite input, center reset, and writes through MotionValue setters.
2. Magnetic target tests: center is zero, direction is symmetric, displacement is bounded, compact/drag/reduced policy is zero, and full normal policy responds.
3. Module boundary guard: Pointer Field/Magnetic modules cannot import desktop/Electron/native/lifecycle effect execution and cannot contain native position/bounds calls.
4. Removal guard or repository scan: no Edge Glow identifiers, obsolete helper, overlay, or compatibility tests remain.
5. Existing M0/M1 suites remain the authority for lifecycle epochs, passthrough timing, shell recipes, compact hotspot, native pointer boundary, reachability, and reduced-motion native behavior.

Avoid tests that assert exact DOM nesting beyond the semantic requirement of separate Magnetic and morph owners, or exact spring constants beyond a bounded/zero policy.

## Compatibility and migration

- This is an internal renderer refactor with one new visual effect; there is no persisted state or protocol migration.
- No public desktop bridge or Electron handler changes are planned.
- The public docs site has no current behavioral guide for the removed decoration, so only architecture specs require updates.
- Historical release notes are not rewritten.

## Risks and stop conditions

- If pointer coordinates are measured from the moving shell, stop and move the measurement source to the stable root before tuning Magnetic.
- If implementation needs native position/bounds calls, new IPC, or compact passthrough changes, stop and return to architecture review.
- If Magnetic and shell morph must write the same node's `x/y`, stop and restore the outer/inner composition.
- If reduced motion needs animation completion for correctness, stop; correctness must be independent of visual animation.
- If a second pointer source/ref/state is introduced for convenience, stop and converge it into the Pointer Field writer.
- If integrating the wrapper breaks drag/drop/pointer capture, preserve existing interaction behavior before polishing the effect.

## Rollback shape

The change is renderer-local and should remain one coherent diff. Rolling back the new Pointer Field/Magnetic modules and wrapper while restoring the old Edge Glow is technically possible, but implementation review should prefer fixing a boundary defect before reintroducing the temporary dual-purpose adapter. Native and lifecycle modules remain untouched, minimizing rollback risk.
