# Implementation Plan — Main Window Renderer Presentation M0 + M1

## Execution Gate

This task remains in Trellis Phase 1. Do not run `task.py start` or edit product code until the user explicitly approves the latest planning summary. Material design changes discovered during implementation return the task to planning.

Keep M0 + M1 in one task: the lifecycle, App cutover, and native contract are tightly coupled, and independently starting partial child tasks would create the parallel authorities this reconstruction is intended to remove.

Execute inside the intentionally isolated `.cindy-worktrees/auto-o3p8cr` worktree. Do not switch back to the main working directory.

## M0 — Establish the Architecture Baseline

### 1. Freeze current behavior with focused characterization tests

Extend/port tests before connecting new runtime code:

- full and compact presentation initialization from actual environments;
- compact enter and immediate interactive policy;
- full leave → one 80 ms timer → collapsing;
- re-entry cancellation and stale timer rejection;
- leave during expand and expand-complete handoff;
- enter/reversal during collapse and stale collapse-complete rejection;
- every existing lock and final-lock release inside/outside behavior;
- programmatic full intent without pointer fabrication;
- foreground task acquisition before overlay visibility;
- passthrough only after matching visual collapse completion;
- no interaction flip during collapse;
- normal expand/collapse emits no native size/bounds-animation request;
- UI Lab activation/reset using lifecycle intent rather than visual override.

Preserve the existing hotspot, pointer-boundary, compact visibility, drag helper, center-overlay, reduced-motion, shortcut, UI Lab scenario, window visibility/routing, and startup deferral tests.

Rollback point: tests only.

### 2. Add the disconnected pure presentation core

Create feature-scoped modules for:

- `lifecycle.ts`: state, events, reducer, epoch allocation;
- `projections.ts`: visual/native/interaction projections;
- `effectContracts.ts`: effect discriminated union;
- `effectExecutor.ts`: injected timer/native/focus execution.

Required tests:

- lifecycle transition table;
- projection invariants for every phase;
- fake-timer effect sequences;
- fake native dependency assertions;
- stale effect/result guards using the current lifecycle epoch.

Do not import React, Motion, geometry, or the desktop runtime into lifecycle/projections/contracts.

Rollback point: disconnected pure modules.

### 3. Formalize compact completion

Add focused tests proving the single-acknowledgement contract:

1. collapse enters `collapsing(epoch)`, starts native compact reachability, and remains interactive;
2. native placement may remain pending or finish without changing lifecycle phase;
3. matching Renderer Motion completion enters `compact` and emits the sole passthrough effect;
4. stale visual completion after reversal is ignored;
5. expand/full intent cancels compact correction and restores interactive policy;
6. no `nativeSettled` state/event exists.

If any current platform behavior cannot satisfy this test model, stop and return to planning before adding another acknowledgement.

### 4. Split spatial geometry and renderer motion

- Move spatial output into `geometry.ts`.
- Move renderer transition/variant selection into `motionRecipes.ts`.
- Preserve current sizes, gutters, endpoints, springs, tweens, icon handoff/pulse, and reduced-motion values.
- Remove native bounds, monitor, timing, reduced-motion, and epoch fields from geometry.
- Ensure Motion recipes import no desktop/native modules.
- Add boundary tests that fail if timing returns to geometry or native behavior enters recipes.

Rollback point: disconnected geometry/recipe modules.

### 5. Move continuous pointer values to Motion runtime

- Add only the minimal temporary `motionRuntime.ts` adapter needed by the existing Edge Glow compatibility consumer.
- Replace render-driving pointer coordinates with local Motion values.
- Test coordinate/opacity transformation as pure or Motion-value behavior where practical.
- Do not treat this adapter as the new pointer architecture. Defer Pointer Field ownership, API, MotionValue model, and Magnetic integration to M2.
- Do not add a provider, global store, pointer field, interaction origin, magnetic state, or noise API.

Rollback point: disconnected runtime or Edge Glow-only adapter.

## M1 — Reconstruct Main Window Presentation Ownership

### 6. Build the thin React adapter and presentation surface

Create:

- a thin React adapter containing reducer binding, one latest-state ref, dispatch/effect forwarding, subscription generation, and teardown;
- `MainWindowPresentationSurface.tsx` containing the shadow/panel Motion host, compact icon, existing Edge Glow/drag glow, pointer/drop/drag/hotspot wiring, and Motion completion callback.

Move together:

- pointer enter/leave and native pointer-boundary subscription;
- compact hotspot rAF/hysteresis;
- manual drag threshold, pointer capture, rAF position writes, and drag lock;
- collapse timer execution through the effect executor;
- interaction policy effects;
- presentation focus handoff;
- compact icon presence and post-settle pulse.

Keep application callbacks injected from App. Do not move download/runtime/center-overlay business state into presentation.

The adapter must not grow transition switches, native IPC details, geometry calculations, or Motion recipes.

Rollback point: disconnected React adapter/surface.

### 7. Cut App over atomically

Connect the new presentation module and remove the old runtime owner in the same checkpoint.

Remove from App:

- `isMinimized`, `visualIsMinimized`, `shellPhase`, `panelTransitionMode`, and their mirrors;
- shell reducer/effect runner and collapse timer;
- pending native lifecycle/bounds refs;
- write-only `compactNativeSettledRef`;
- inline completion handoff;
- compact hotspot and pointer-boundary lifecycle code;
- manual drag presentation state/handlers;
- inline shell geometry/Motion recipe construction;
- pointer coordinate React state.

Change application integrations:

- task/outcome/runtime/shortcut flows issue explicit full intent and lock facts;
- center-overlay selector no longer owns the compact icon/minimized branch;
- UI Lab uses `uiLab` lock + explicit full intent;
- docs screenshot injected pointer fact enters the normal boundary event path.

Delete superseded `mainWindowMode` collapse helpers and self-only tests after FFF confirms no active callers.

Rollback point: revert the complete App cutover. Never reconnect selected old flags beside the new lifecycle.

### 8. Narrow native surface policy

Create/test a native Main Window surface policy that owns:

- compact reachable-frame correction;
- monitor/work-area lookup;
- private position-only interpolation when reduced motion is off;
- cancellation when the surface returns interactive/full;
- existing focusability, passthrough, pointer-boundary polling, taskbar, and platform correction semantics.

Bridge changes:

- remove arbitrary renderer `animateBounds` from types, preload, runtime, and main IPC;
- add one semantic compact-reachability operation;
- retain current narrow position/focus/visibility/interaction/pointer-boundary operations;
- prohibit renderer-provided width/height, arbitrary target bounds, easing, and duration.

Startup simplification:

- create the Main Window with the stable full viewport;
- remove the always-full startup-mode resolver's dead parameters and the compact startup argument/parser/getter path;
- remove renderer native-compact detection and instant size-normalization effect;
- preserve real production full startup and real plain-web compact presentation initialization directly.

Remove obsolete native bounds orchestrator/transition token modules only after the semantic placement path replaces every active caller.

Rollback point: native contract and matching renderer adapter revert together.

### 9. Reconcile UI Lab and specs

- Verify every UI Lab scenario on the real Main Window.
- Verify reset and window close restore live state and release the presentation lock.
- Verify docs screenshot scenario setup still gets full presentation through the normal lifecycle.
- Update the spec leaves listed in `design.md` after implementation behavior is proven.
- Do not update public docs because user-facing behavior is intentionally unchanged.

### 10. Remove dead code and audit authority

Use FFF to prove no runtime references remain to:

- old minimized/phase/transition owners;
- `compactNativeSettledRef`;
- superseded collapse predicates;
- dormant compact native startup;
- generic renderer bounds animation.

Review imports and state writes to prove:

- one lifecycle reducer instance exists;
- projections are read-only;
- effects execute only through the executor;
- React adapter is thin;
- geometry owns no timing;
- Motion owns no BrowserWindow behavior;
- pointer coordinates are absent from React application state.

## Focused Automated Validation

Use final filenames if implementation naming changes, preserving equivalent coverage:

```powershell
npm test -- src/presentation/main-window/lifecycle.test.ts
npm test -- src/presentation/main-window/projections.test.ts
npm test -- src/presentation/main-window/effectExecutor.test.ts
npm test -- src/presentation/main-window/geometry.test.ts src/presentation/main-window/motionRecipes.test.ts
npm test -- src/presentation/main-window/presentationCompletion.test.ts
npm test -- electron/mainWindowSurfacePolicy.test.mts electron/mainWindowPointerBoundary.test.mts
npm test -- src/utils/compactPointerHotspot.test.ts src/utils/mainPanelInteractions.test.ts
npm test -- src/utils/centerOverlayState.test.ts electron/uiLabScenarios.test.mts
npm test -- electron/windowVisibility.test.mts electron/windowRouting.test.mts src/utils/startupWindowState.test.ts
```

Do not add a pointer-boundary transition-token test unless a failing lifecycle/subscription-generation test or live reproduction first demonstrates the need.

## Full Quality Gates

```powershell
npm run type-check
npm run lint
npm test
npm run build
```

## Manual Verification Matrix

| Scenario | Expected result |
|---|---|
| Electron startup | Current full first paint, shadow viewport, and deferred runtime initialization remain unchanged |
| Plain-web startup | Current compact presentation appears without native startup-mode machinery |
| Compact enter | Immediate expansion; native policy is interactive before visual expansion |
| Full leave | One 80 ms grace, then collapse |
| Re-enter during grace | Timer cancels and full remains |
| Leave during expand | Expand completes and hands into normal collapse without a steady-full flash |
| Enter during collapse | Visual reverses to the new expanding epoch; stale compact completion cannot enable passthrough |
| Active lock | Drag/context/task/drop/outcome/UI Lab/update lock holds full |
| Final lock release outside | Normal 80 ms collapse resumes |
| Foreground task | Full intent occurs before progress/outcome paint; later collapse follows pointer truth |
| Window drag | Pending threshold and active drag survive pointer crossing; rAF position updates remain smooth |
| Windows compact | Passthrough starts only after matching collapse completion; transparent gutter remains click-through; hotspot wakes full |
| Compact correction | Reachable frame remains inside monitor; stale correction cannot move a newer full surface |
| Shortcut | Existing near-cursor placement and full synchronization remain correct |
| Reduced motion | Renderer recipes and native correction retain current reduced-motion behavior; compact pulse remains suppressed |
| UI Lab | Apply/reset/close and docs screenshot scenarios use the same lifecycle without visual override divergence |
| macOS | Transparent shadow/overshoot, icon centering, focusability, and non-Windows hotspot behavior remain correct |

## Review Gates

- Lifecycle review: transition table, epoch handling, lock release, and single completion acknowledgement.
- Projection review: no writable derived state or UI Lab bypass.
- Effect review: contract/executor separation, timer cleanup, native cancellation, singular passthrough.
- Boundary review: App facts versus presentation state versus continuous Motion values versus native policy.
- Scope review: no future effects, visual redesign, or new state/animation framework.
- Cross-platform review: Windows passthrough/taskbar and macOS transparent-window behavior.

## Risks and Stop Conditions

- If foreground outcome can paint compact before explicit full intent is reduced, stop and fix ordering at the presentation intent boundary rather than reintroducing visual overrides.
- If passthrough demonstrably must wait for native placement, stop and return to planning for an explicit multi-acknowledgement barrier.
- If stale pointer-boundary events persist after one lifecycle authority and subscription-generation cleanup, capture the failure in a test before adding synchronization data.
- If native correction needs arbitrary width/height animation for an active behavior, document the caller and return to planning before preserving generic bounds animation.
- macOS platform behavior that cannot be exercised on Windows remains a release verification requirement, not permission to retain dead cross-platform branches.
