# M2 Pointer Field and Magnetic

## Goal

Create one renderer-local authority for continuous Main Window pointer coordinates and prove the boundary with a full-mode Magnetic interaction. The effect must enrich the existing Main Window presentation without changing application facts, presentation lifecycle ownership, or the stable native BrowserWindow surface.

## Background

- M0/M1 established `src/presentation/main-window/lifecycle.ts` as the only writable full/compact/transition authority and kept normal shell morphs inside the renderer.
- The current `motionRuntime.ts` is explicitly a temporary Edge Glow adapter. It already avoids React pointer state, but its API and retained screen-point ref are consumer-specific rather than a reusable Pointer Field boundary.
- `MainWindowPresentationSurface.tsx` currently hosts the stable viewport, shell/shadow morph nodes, pointer/drop/drag wiring, native pointer-boundary and compact-hotspot inputs, Motion completion, and Edge Glow choreography.
- Manual window dragging legitimately calls the semantic native position API. Magnetic must remain a separate visual transform and must never reuse that native drag path.

## Requirements

### R1 — Pointer Field authority

- Main Window continuous pointer coordinates must have one renderer-local runtime authority backed by Motion values or an equivalent non-React continuous mechanism.
- Coordinates must be viewport-relative to the stable, untransformed presentation root so Magnetic movement cannot feed back into its own pointer measurement.
- High-frequency pointer movement must not enter React application state, the lifecycle reducer, Download Feature state, Electron Main, or the Native Surface.
- Do not introduce mirrored pointer state/refs, a provider, context, global store, animation bus, or speculative multi-consumer framework.

### R2 — Magnetic reference effect

- Magnetic is a Renderer Presentation/Motion consumer of Pointer Field data.
- The first version is full-mode only. Compact mode resolves to zero Magnetic displacement and retains the existing passthrough, hotspot, pointer-boundary, and reachability behavior.
- Magnetic must not call or cause `BrowserWindow.setPosition`, `setBounds`, `animateBounds`, compact reachability, or any per-frame renderer-to-main IPC.
- Magnetic completion is visually irrelevant to lifecycle state and must not dispatch lifecycle completion or native-policy effects.

### R3 — Transform ownership

- A dedicated outer visual layer owns Magnetic `x/y` displacement.
- Existing inner shell and shadow nodes retain the current geometry/morph transforms (`x/y`, size, radius, clip path, scale) and the shell retains the epoch-matched lifecycle completion callback.
- Content remains inside the shell, so the visible shell, shadow, and content move together without two owners writing the same transform source on the same node.

### R4 — Lifecycle and native boundaries

- `lifecycle.ts`, its phase vocabulary, and its completion/epoch rules remain the only writable presentation lifecycle authority.
- The M0/M1 native surface contract remains unchanged: stable BrowserWindow viewport, semantic compact reachability, passthrough only after matching renderer collapse completion, and native position updates only for existing manual window drag / OS placement work.
- Pointer Field and Magnetic must not add application/domain state or modify P0–P6 feature/runtime architecture.

### R5 — Edge Glow removal

- Remove the pointer-following Edge Glow layer, reveal/suppression timers, opacity/background transforms, compatibility runtime names, screen-to-panel correction helper, and their obsolete tests.
- Keep the separate drag/drop glow because it is discrete drop feedback, not the deprecated pointer-following presentation consumer.
- No Edge Glow and Magnetic dual presentation path may remain.

### R6 — Reduced motion

- Under reduced motion, Magnetic displacement is immediately zero and no spring/tween availability is required for pointer, lifecycle, passthrough, hotspot, drag, or native reachability correctness.
- Pointer Field ownership remains valid and may continue receiving pointer coordinates; disabling the visual consumer must not disable semantic pointer facts.
- Existing reduced-motion shell/icon recipes and native compact reachability snap behavior remain unchanged.

### R7 — Surface responsibility and scope control

- New continuous-runtime and Magnetic derivation logic live in focused presentation/motion modules. `MainWindowPresentationSurface` only wires the stable pointer event source and composes the visual layers.
- Do not perform an unrelated rewrite of existing drag/drop/hotspot code. Edge Glow deletion should offset the small amount of new surface wiring.
- Do not introduce GSAP, XState, Zustand, a Motion framework/DSL, WebGL, or new dependencies.

### R8 — Compatibility

- Preserve full/compact transitions, collapse interruption and epoch rejection, Windows compact passthrough/hotspot, native pointer-boundary fallback, drag threshold/capture/position behavior, compact reachability, UI Lab forcing, drop locks, and existing application content behavior.
- The accepted compact Cat collapse minor flicker is not a blocker unless the new composition naturally removes it.

## Acceptance Criteria

- [ ] Pointer coordinates are written to one renderer-local continuous runtime and no high-frequency pointer `setState`, application state, lifecycle event payload, or IPC path is introduced.
- [ ] Pointer measurement uses the stable presentation viewport, not the Magnetic-transformed shell bounds.
- [ ] Full mode visibly derives Magnetic displacement from Pointer Field values; compact and reduced-motion policies resolve to zero displacement.
- [ ] Magnetic and shell morphs render on separate nested transform layers; the existing shell node remains the only source of morph completion acknowledgement.
- [ ] Magnetic code has no native desktop/window dependency and normal pointer movement produces no native position or bounds call.
- [ ] `lifecycle.ts`, lifecycle projections/effect contracts, compact acknowledgement semantics, and the M0/M1 native API remain behaviorally unchanged.
- [ ] All Edge Glow code, legacy identifiers, pointer-following overlay markup, and obsolete Edge Glow position/runtime tests are removed; drag glow remains.
- [ ] `MainWindowPresentationSurface` gains only event/layer composition wiring and does not absorb Magnetic math, spring recipes, or a second lifecycle.
- [ ] Focused semantic tests cover Pointer Field writes, stable coordinates, Magnetic full-only/reduced-motion policy, bounded/centered displacement, transform/native boundary guards, and Edge Glow removal.
- [ ] Existing lifecycle, completion, projection, shell recipe, pointer boundary, hotspot, native surface policy, drag interaction, and preload/renderer bridge tests pass.
- [ ] Full `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, and `git diff --check` pass before implementation review.
- [ ] Windows manual checks cover full-mode Magnetic, reduced motion, rapid full/compact reversal, drag, drop, passthrough/hotspot, and edge reachability; macOS behavior is reported accurately as verified or not verified.

## Out of Scope

- Compact Cat Magnetic movement or any expansion of compact native interaction architecture.
- M3 Download Intake Motion, Noise Reveal, Impact, Wave, or a formal InteractionOrigin contract.
- Download Feature, Main Window lifecycle, Native Surface, P0–P6 architecture, or product visual redesign.
- New global animation infrastructure, animation DSLs, state libraries, or rendering engines.

## Documentation Scope

The public docs site contains no current user guide for Edge Glow or pointer-following Main Window decoration. Historical release notes remain historical and are not rewritten. This task updates the repository frontend architecture specs that currently describe the temporary Edge Glow runtime.

## Blocking Open Questions

None. The requested scope and repository evidence support a full-only Magnetic MVP without a product decision from the user.
