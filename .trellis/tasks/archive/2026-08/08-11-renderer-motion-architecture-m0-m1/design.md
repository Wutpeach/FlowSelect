# Design — Main Window Renderer Presentation M0 + M1

## Outcome

Replace App-level presentation ownership with a feature-scoped module whose pure lifecycle is the only writable full/compact/transition authority. Everything rendered or sent to Electron is projected from that lifecycle and current external inputs.

This is a boundary reconstruction, not an extraction of the current App functions into a larger hook.

```text
Application facts and intent
        |
        v
  lifecycle reducer  <------------------------------+
        | state + effects                            |
        +----------------+----------------+           |
        v                v                v           |
   projections      effect contract   epoch-checked  |
        |                |             Motion complete|
        |          effect executor          ----------+
        |                |
        v                +--> native surface policy
 thin React adapter      +--> collapse timer/focus
        |
        +--> geometry + Motion recipes + local Motion values
        |
        v
 Main Window presentation surface + App-owned content
```

## Architectural Invariants

1. The lifecycle reducer is the only writable presentation authority.
2. Projections are pure functions; they never synchronize state back into the lifecycle.
3. Effects are declarations emitted by lifecycle transitions. Execution is injected and independently testable.
4. The React adapter does not contain transition rules or native sequencing.
5. Renderer Motion completion is the compact lifecycle acknowledgement.
6. Native placement correction is independent OS work; it cannot complete or block the lifecycle.
7. Passthrough has one commit path: matching collapse completion transitions the lifecycle to compact and emits one edge-triggered native interaction effect; the pure interaction projection independently reports the resulting compact-passthrough state.
8. Geometry, Motion recipes, continuous values, and BrowserWindow policy do not import or own each other.

## Proposed Presentation Module

Use a feature directory such as `src/presentation/main-window/`. Exact names may follow existing naming conventions, but these responsibilities remain separately testable.

| Responsibility | Proposed module | Contract |
|---|---|---|
| Lifecycle state and reduction | `lifecycle.ts` | Pure state, events, transitions, epoch allocation; no React, Motion, geometry, timers, or desktop runtime |
| Derived presentation views | `projections.ts` | Pure visual/native/interaction selectors from lifecycle + immutable environment inputs |
| Side-effect vocabulary | `effectContracts.ts` | Discriminated effect types only; no execution |
| Effect execution | `effectExecutor.ts` | Executes timer, focus, native policy, and cancellation effects through injected dependencies |
| React binding | `reactAdapter.ts` | Thin `useReducer`/state-ref adapter that dispatches and hands emitted effects to the executor |
| Spatial policy | `geometry.ts` | Pure full/compact viewport, shell, shadow, reachable-frame, and hotspot geometry |
| Renderer choreography | `motionRecipes.ts` | Motion values/transitions for current lifecycle projection and reduced-motion input |
| Continuous renderer runtime | `motionRuntime.ts` | Feature-local Motion values for current Edge Glow pointer data |
| DOM/Motion host | `MainWindowPresentationSurface.tsx` | Outer shell, compact icon, pointer/drop/drag/hotspot wiring, Motion completion, application-content slot |

This is the smallest separation that makes every requested boundary explicit. Do not add interfaces/factories beyond the concrete lifecycle and injected effect dependency object.

## Authoritative Lifecycle

### State

```ts
type MainWindowPhase =
  | { kind: "compact"; settleEpoch: number }
  | { kind: "expanding"; epoch: number; recipe: "animated" | "instant" }
  | { kind: "full" }
  | { kind: "collapsePending"; timerEpoch: number }
  | { kind: "collapsing"; epoch: number };

type MainWindowPresentationState = {
  phase: MainWindowPhase;
  pointerInside: boolean;
  locks: Record<MainWindowPresentationLock, boolean>;
  nextEpoch: number;
};
```

`settleEpoch` only keys the existing post-collapse compact icon pulse. It is not native-settled state.

There is no independently writable:

- `isMinimized` or `visualIsMinimized`;
- `shellPhase` mirror;
- `panelTransitionMode`;
- `compactNativeSettled`;
- pending compact lifecycle token separate from the lifecycle epoch.

A ref may point at the latest complete `MainWindowPresentationState` so async callbacks can dispatch against current truth. Individual fields are not mirrored into independently writable refs.

### Events

The reducer accepts semantic events:

- pointer/native-boundary enter and leave;
- drop enter/leave;
- lock set/release for drag, context menu, task, drop, startup, center outcome, UI Lab, and updater/runtime work;
- startup settle;
- explicit full intent with reason and animated/instant recipe;
- collapse timer fired with its timer epoch;
- visual transition completed with transition epoch and target.

Programmatic full intent never changes `pointerInside`.

### Preserved transition behavior

- `compact + enter` → `expanding` immediately.
- `full + leave + unlocked` → `collapsePending` and one 80 ms timer.
- re-entry invalidates the timer and returns to/stays full.
- leave during expanding records pointer-outside but does not interrupt the current expand; matching expand completion starts normal collapse pending.
- enter during collapsing reverses to a new expanding epoch; the old collapse completion is ignored.
- an active lock cancels pending collapse; releasing the final lock outside starts normal collapse pending.
- explicit full intent from task, runtime gate, shortcut, or UI Lab preserves pointer truth.

## Projection Layer

`projections.ts` is the only place that maps lifecycle state to consumer-facing presentation facts.

### Visual projection

Derive:

- target visual mode (`full` or `compact`);
- transition kind and epoch;
- whether full application content is visible/interactive;
- whether the compact icon is visible;
- whether the post-compact icon pulse runs;
- geometry input mode;
- Motion recipe input.

### Interaction projection

Derive:

- `interactive` for full, pending, expanding, and collapsing;
- `compact-passthrough` only for settled compact on supported Windows behavior;
- whether compact hotspot evaluation is active;
- whether native pointer-boundary listening is active.

No interaction-mode flip occurs during collapse.

### Native projection

Derive native-facing desired facts only:

- the BrowserWindow viewport remains stable across normal full/compact presentation;
- whether compact reachability policy applies to the current lifecycle;
- the desired interaction policy and current lifecycle epoch;
- whether drag/hotspot/native-boundary capabilities are active.

The projection never emits commands, arbitrary bounds, or renderer frame values. Edge-triggered native work—begin/cancel compact correction, change interaction mode, and synchronize placement—is declared by lifecycle effects and executed by the effect executor.

## Effect Contract and Execution

### Effect declarations

Effects are a discriminated union emitted by lifecycle transitions, for example:

```ts
type MainWindowPresentationEffect =
  | { type: "collapseTimer.start"; epoch: number; delayMs: 80 }
  | { type: "collapseTimer.cancel" }
  | { type: "native.prepareCompactReachability"; epoch: number }
  | { type: "native.cancelCompactReachability"; epoch: number }
  | { type: "native.setInteraction"; mode: "interactive" | "compact-passthrough"; epoch: number }
  | { type: "focus.request"; reason: MainWindowFullIntentReason };
```

Do not add a visual animation effect executor. React/Motion consumes the visual projection declaratively and reports completion back with its epoch.

### Executor

`effectExecutor.ts` receives concrete dependencies:

- timer scheduler/canceller;
- narrow native surface API;
- focus callback;
- current lifecycle epoch reader for stale asynchronous native-result guards.

The executor contains side-effect mechanics, not transition rules. Fake dependencies make the full effect sequence testable without rendering App.

## Compact Completion Contract

Repository behavior supports one lifecycle acknowledgement:

1. Collapse starts:
   - lifecycle enters `collapsing(epoch)`;
   - visual projection targets compact;
   - native placement correction starts independently;
   - interaction remains interactive.
2. Renderer Motion reports `visualTransitionCompleted({ target: "compact", epoch })`.
3. If the epoch still matches, lifecycle enters `compact` and emits exactly one `native.setInteraction(compact-passthrough)` effect.
4. The pure interaction projection becomes `compact-passthrough`, while the executor applies the emitted edge-triggered effect exactly once.

Native placement completion:

- may finish before or after visual completion;
- may be canceled by a newer expand/full epoch;
- may update native-owned/corrected position data;
- never dispatches lifecycle completion;
- never gates passthrough.

Therefore `compactNativeSettledRef` is deleted. If a focused test or live platform reproduction later proves passthrough must wait for placement, implementation stops and returns to planning to define a two-acknowledgement barrier. M0 + M1 does not speculate one.

## Pointer Boundary Contract

- Electron reports only factual `{ inside }` changes.
- IPC payloads do not receive presentation transition tokens.
- The React adapter/effect owner keeps a subscription generation and ignores emissions from a disposed/replaced listener.
- The lifecycle reducer gates the fact against its current phase and pointer truth.
- The docs screenshot path's injected `{ inside: true }` fact uses the same event path.

Only a reproducible failure after lifecycle consolidation may justify new synchronization. That failure must first become a focused test.

## Application and React Boundary

`App.tsx` continues to own:

- download/transcode/runtime/update/center-overlay/output-path facts;
- business commands and unrelated event subscriptions;
- callbacks for drop processing, context menu, output-folder actions, and foreground outcomes;
- full application content passed to the presentation surface.

`App.tsx` may:

- pass presentation lock facts;
- issue intent-level `requestFull(reason)` before foreground content becomes visible;
- pass business callbacks into the surface.

`App.tsx` must not:

- inspect/write lifecycle phase to decide full/compact;
- own collapse timers, transition completion, native policy sequencing, or hotspot state;
- assemble shell geometry or Motion transitions;
- store pointer coordinates.

The React adapter is intentionally thin: reducer state, one latest-state ref, dispatch, effect forwarding, and cleanup. Transition behavior belongs to lifecycle; side-effect behavior belongs to the executor.

## Geometry

Geometry output is spatial only:

```ts
type MainWindowGeometry = {
  mode: "full" | "compact";
  viewportSize: number;
  visualShell: FrameWithRadiusAndClip;
  shadowShell: FrameWithRadiusAndClip;
  compactReachableFrame: Frame;
  hotspot: HotspotFrame;
};
```

Remove:

- Motion transition objects and timing;
- native animation timing/easing;
- reduced-motion branches;
- lifecycle/native epochs;
- monitor lookup and absolute native bounds.

Preserve current platform metrics and visible endpoints.

## Motion Recipes and Continuous Runtime

`motionRecipes.ts` preserves current initial, compact, full spring/elastic, instant synchronization, compact icon handoff/pulse, and reduced-motion behavior. It imports neither the desktop runtime nor native policy types.

`motionRuntime.ts` is a deliberately temporary, minimal adapter that replaces App's pointer-coordinate state with local Motion values consumed only by the existing Edge Glow compatibility path. It exposes only values already required by current behavior and is not a feature-local pointer architecture. Formal Pointer Field ownership, API, MotionValue model, and Magnetic integration are deferred to M2; M0 + M1 adds no provider, magnetic/origin/noise API, or speculative state.

## Native Surface Policy

### Stable window

- Electron creates the Main Window with the full stable viewport required for the visible 200 px panel, shadow gutter, and overshoot.
- Normal full/compact lifecycle never changes native width/height.
- Remove the dormant compact startup argument, preload getter, icon-sized BrowserWindow branch, renderer normalization effect, and tests that only justify that dead branch.
- Preserve actual production full startup and actual plain-web compact presentation initialization directly from the real environment.

### Narrow API

Remove renderer-facing arbitrary `animateBounds(bounds, options)`.

Replace active placement behavior with a semantic operation such as:

```ts
ensureMainWindowCompactReachable(options: {
  reachableFrameSize: number;
  edgePadding: number;
  reducedMotion: boolean;
  requestEpoch: number;
}): Promise<{ requestEpoch: number; position: AmeowPoint }>;
```

Electron main owns monitor selection, clamping, and any private position-only interpolation. Renderer inputs cannot set width/height, arbitrary target x/y, easing, or duration.

Keep the existing narrow OS capabilities that current behavior needs:

- outer position and rAF-batched drag position writes;
- focus/show/hide/close;
- interaction mode;
- native pointer-boundary facts;
- platform taskbar/focusability correction.

Returning to interactive mode cancels any active compact placement correction so a stale correction cannot move a newly expanded surface.

## UI Lab

- Scenario activation sends a `uiLab` lock plus explicit full intent into the lifecycle.
- Scenario reset/close releases the lock and lets pointer truth drive the normal collapse path.
- Remove `visualIsMinimized` preview override and the early return that ignores Motion completion.
- Scenario data remains application/runtime test data and is not added to lifecycle state.
- Docs screenshot pointer injection enters through the normal boundary event path.

## Dead Code Removal

Remove once the new boundary is connected and tests prove no caller remains:

- `compactNativeSettledRef`;
- App-owned minimized/phase/transition mirrors and pending native lifecycle refs;
- superseded `mainWindowMode` collapse predicates and their self-only tests;
- dormant native compact-startup argument/parser/size normalization path;
- generic renderer bounds animation and obsolete orchestrator/token helpers after semantic placement replaces all callers.

Do not delete active startup deferral, runtime bootstrap, window visibility, shortcut placement, or unrelated native helpers.

## Migration and Rollback

1. Characterize current lifecycle/effect behavior and native-call absence for normal morphs.
2. Build lifecycle, projections, and effect contracts/executor as disconnected pure/testable modules.
3. Split geometry and Motion recipes and create the local continuous runtime.
4. Build the thin React adapter and presentation surface while the old runtime remains the only connected owner.
5. Cut App over atomically and delete old competing presentation owners in the same checkpoint.
6. Narrow the native bridge and remove dormant/dead paths.
7. Reconcile specs and run the full validation matrix.

No checkpoint may ship with both old and new lifecycle owners connected. Rollback reverts the entire App cutover or native-contract checkpoint, not selected booleans/helpers.

## Required Spec Reconciliation

Update:

- `.trellis/spec/frontend/directory-structure.md`;
- `.trellis/spec/frontend/motion-guidelines.md`;
- `.trellis/spec/frontend/state-management.md`;
- `.trellis/spec/frontend/type-safety/07-electron-preload-bridge-contract-for-renderer-migration.md`;
- `.trellis/spec/backend/electron-runtime-contracts/08-electron-proxy-resolution-contract-part-02.md`;
- `.trellis/spec/backend/electron-runtime-contracts/08-electron-proxy-resolution-contract-part-04.md`.

Remove stale App-owned lifecycle, native 80 px ↔ full morph, `windowResized`, dead native-settled, and generic renderer `animateBounds` guidance.
