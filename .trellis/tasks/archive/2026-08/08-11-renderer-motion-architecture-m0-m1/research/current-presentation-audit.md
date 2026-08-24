# Current Main Window Presentation Audit

## Scope

This audit records the repository behavior that constrains the M0 + M1 Renderer Motion Architecture reconstruction. It is a behavior baseline, not an endorsement of the current module structure.

## Current Ownership Flow

```text
application/task/UI Lab facts in App.tsx
  -> duplicated presentation locks and force-full calls
  -> MainWindowShellMachine reducer stored in shellMachineRef
  -> App effect runner
       -> shellPhase state + ref
       -> isMinimized state + ref
       -> panelTransitionMode state
       -> native transition token refs
       -> Motion props assembled inline
       -> currentWindow interaction/bounds bridge
```

The reducer is the intended decision owner, but it is not the effective single source of truth because App mirrors and independently mutates presentation state around it.

## Repository Evidence

### Competing presentation truth

- `src/App.tsx:501-565` stores `isMinimized`, `panelTransitionMode`, `shellPhase`, a separate shell reducer state, native bounds transition state, pending compact tokens, compact-settle flags, and mirror refs.
- `src/App.tsx:754-759` independently mirrors `shellPhase` into both React state and a ref.
- `src/App.tsx:991-1043` translates reducer effects into direct mutations of `shellPhase`, `isMinimized`, native transition refs, edge-glow state, and native calls.
- `src/App.tsx:1393-1431` commits collapse/expand completion through both the reducer and separate App state/ref updates.
- `src/App.tsx:1435-1534` derives geometry and rebuilds renderer Motion timing inline from `visualIsMinimized`, `shellPhase`, `panelTransitionMode`, initial-mount state, and reduced-motion state.
- `src/App.tsx:597-598` lets UI Lab override `isMinimized` through a separate `visualIsMinimized` branch instead of making forced-full a lifecycle fact.
- `compactNativeSettledRef` is assigned during initialization, expand, collapse, and collapse completion but has no reader. It is dead historical state and should be deleted rather than promoted into the new lifecycle.
- `src/utils/mainWindowMode.ts` retains collapse predicates that are referenced only by their own tests; App has already moved those decisions into the shell reducer.

### Existing reducer behavior worth preserving

- `src/utils/mainWindowShellMachine.ts:1-31` models compact, expanding, full, collapse-pending, and collapsing phases; pointer truth; reducer-issued timer tokens; and named presentation locks.
- `src/utils/mainWindowShellMachine.ts:124-236` preserves immediate enter, delayed leave, expand-complete handoff, stale timer rejection, lock-aware collapse, and compact settle.
- `src/utils/mainWindowShellMachine.test.ts` characterizes pointer enter/leave, re-entry cancellation, programmatic full requests, task/outcome/drop locks, pointer ownership, and compact completion.
- The reducer structure is replaceable. The observable transition table and tests are the compatibility contract.

### Geometry and Motion are currently mixed

- `src/utils/mainWindowShellGeometry.ts:1-23` imports Motion timing constants.
- `src/utils/mainWindowShellGeometry.ts:70-114` defines visual, native, and icon timing descriptors next to spatial geometry types.
- `src/utils/mainWindowShellGeometry.ts:270-306` resolves reduced-motion and native animation timing in the geometry module.
- `src/utils/mainWindowShellGeometry.test.ts:125-177` asserts timing output despite the test name claiming timing remains outside geometry.
- `src/App.tsx:1435-1534` does not consume that transition plan for the actual shell; it rebuilds recipes inline, leaving two descriptions of timing.

### Normal full/compact morphs already use a stable BrowserWindow

- `src/utils/mainWindowMotionBaseline.ts:63-120` records `hoverRequestExpand` and `hoverRequestCollapse` as visual-only paths that preserve native size.
- `src/App.tsx:1014-1042` changes renderer visual state for normal expand/collapse. Collapse starts only a compact visibility correction; neither path performs a native size morph.
- `src/utils/mainWindowNativeBoundsOrchestrator.ts:131-218` uses native bounds animation for position-only compact visibility correction while preserving current width/height.
- `src/App.tsx:1949-1974` uses generic bounds animation only for dormant compact-startup normalization.
- `electron/startupWindowMode.mts:7-18` currently resolves every production main-window creation to full startup mode.

### Renderer-facing native contract is broader than active presentation needs

- `src/types/electronBridge.ts:180-202`, `electron/preload.mts:103-105`, and `src/desktop/runtime.ts:75-77` expose arbitrary `animateBounds(bounds, { durationMs, transitionToken })` to the renderer.
- `electron/main.mts:837-945` implements a generic 60 Hz interpolator over x, y, width, and height.
- `electron/main.mts:3566-3585` accepts arbitrary renderer target bounds and timing.
- Active presentation behavior needs native placement correction, interaction mode, position synchronization/dragging, visibility, and focus. It does not need a renderer-controlled generic native bounds animation API.

### Pointer, drag, passthrough, and platform constraints

- `electron/mainWindowPointerBoundary.mts` reports OS cursor inside/outside facts at a 50 ms cadence but does not decide presentation state.
- Pointer-boundary startup uses a deferred zero-delay first emission, not a synchronous call. The new subscription must keep a listener-generation/cancellation guard so a late emission from a replaced subscription cannot affect the current lifecycle.
- `src/App.tsx:2521-2576` applies Windows compact hotspot hysteresis only while the lifecycle is compact and native mode is passthrough.
- `src/App.tsx:2623-2663` combines renderer mouseout with native pointer-boundary facts because transparent Electron windows may lose DOM leave events during morphs.
- `src/App.tsx:2788-3009` keeps pointer-down, drag-threshold-pending, active drag, pointer capture, position caching, and rAF-batched native position updates distinct.
- `electron/main.mts:3538-3563` owns `setIgnoreMouseEvents`, platform focusability, taskbar correction, and pointer-boundary polling.
- `src/utils/compactPointerHotspot.test.ts` and `electron/mainWindowPointerBoundary.test.mts` characterize hotspot hysteresis and native boundary change emission.

### Continuous values currently leak into React application state

- `src/App.tsx:500` stores pointer coordinates in `mousePos` React state.
- `src/App.tsx:2971-2989` updates that state on pointer movement.
- `src/App.tsx:1535-1572` derives Edge Glow opacity and gradient position from those render-driving coordinates.
- Edge Glow must remain, but its continuous coordinates can move to Motion values or equivalent local runtime values without becoming presentation lifecycle state.

### Application locks and UI Lab

- `src/App.tsx:2578-2610` maps task, center outcome, context menu, UI Lab, updater, and runtime gate facts into presentation locks.
- `src/App.tsx:2119-2165` keeps UI Lab scenarios on the real main window and forces full presentation while scenarios are active.
- `src/pages/UiLabPage.tsx:117-153` applies and resets scenarios through the typed desktop command boundary.
- `electron/main.mts:3246-3249` keeps scenario application main-process-owned.
- The current UI Lab preview path bypasses lifecycle convergence twice: `visualIsMinimized` is forced false and `handleAnimationComplete` returns early. The replacement must express preview as a lifecycle lock/full intent instead of retaining either bypass.
- The docs screenshot path intentionally stops native pointer-boundary polling and injects an `inside: true` boundary fact before applying UI Lab scenarios. This development-only behavior must continue to reach the authoritative lifecycle.
- Center overlay state is already a separate reducer/selector and should remain application/presentation input rather than being merged into the shell lifecycle.

### Additional native risks

- `electron/startupWindowMode.mts` currently ignores both `platform` and `hasShownMainWindowOnce` and always returns `full`. Compact native startup is therefore dormant production code, not a second active product mode.
- Renderer position caching is refreshed by initial reads, manual drag, and shortcut show. OS-side moves such as display topology correction are not guaranteed to update that cache, so native compact reachability must return or own the authoritative corrected position rather than trusting a renderer cache.

## Preserved Behavior Matrix

| Behavior | Current contract to preserve |
|---|---|
| Startup | Electron launches visibly full; browser/plain-web mode can begin compact through renderer initialization; dormant native compact-startup machinery is not a behavior contract |
| Enter | Compact hotspot/pointer enter requests full immediately |
| Leave | Unlocked full mode starts one cancelable 80 ms collapse timer |
| Expand interruption | Pointer leave during expand is remembered; collapse starts only after expand completes |
| Re-entry | Re-entry cancels the reducer-issued timer and invalidates stale callbacks |
| Locks | drag, context menu, task, drop, startup, center outcome, UI Lab, and updater/runtime activity hold full mode |
| Programmatic full | task/runtime/shortcut/UI Lab requests do not fabricate pointer-inside truth |
| Task return | once task/outcome locks clear outside the pointer, normal delayed collapse resumes |
| Drag | pointer-down, threshold-pending, and active drag suppress collapse; position updates are rAF-batched |
| Windows compact | passthrough activates only after visual collapse; hotspot hysteresis wakes the shell |
| Visibility | compact reachable frame is clamped into the current monitor work area; stale correction cannot commit renderer cache state |
| Reduced motion | visibility correction snaps and renderer icon/visual recipes use the existing reduced-motion variants |
| UI Lab | scenarios operate on the real main window, keep it full, and reset live state on reset/close |

## Test Gaps

- No component-level test proves App no longer owns presentation coordination.
- No single test asserts that normal expand/collapse never calls a native bounds/size API.
- Geometry tests currently accept timing in the geometry module instead of enforcing the desired boundary.
- The generic native bounds handler is not covered by a presentation-specific contract test.
- Pointer Motion/Edge Glow updates are not tested for avoiding React render state.
- UI Lab has no focused presentation lifecycle test for force-full and reset/unlock behavior.
- The docs screenshot/UI Lab path has no focused test proving its injected pointer-boundary fact reaches the same lifecycle as real native boundary events.
- Cross-owner interruption is mostly inferred from pure reducer tests; the new boundary needs at least one integration-level harness or deterministic controller test covering effects and completion epochs.

## Planning Conclusion

The reconstruction should preserve the existing transition table while replacing the ownership structure. The minimum architecture that satisfies the goal is:

1. one pure presentation lifecycle as the only writable full/compact/transition authority;
2. pure visual, interaction, and native-facing projections that cannot write lifecycle state or execute effects;
3. a small lifecycle effect vocabulary and a separate injected executor for timers, focus, compact reachability, cancellation, and the singular passthrough commit;
4. a thin React adapter that binds reducer state, forwards declared effects, guards subscription generations, and owns no transition rules;
5. a presentation surface that hosts existing DOM/Motion, pointer/drop/drag/hotspot wiring, and epoch-matched Motion completion without absorbing application state;
6. spatial-only geometry, renderer-only Motion recipes, and feature-local Motion values for continuous pointer data;
7. a narrow native Main Window surface policy API for placement, interaction, focus, visibility, and drag position, with no generic renderer-controlled bounds animation.

Compact lifecycle completion has one acknowledgement: the matching Renderer Motion collapse completion. Native compact reachability is independent OS work and cannot complete or gate the lifecycle. The write-only `compactNativeSettledRef` is removed rather than formalized, pointer-boundary transition tokens remain out unless a post-consolidation failing test proves they are needed, and dormant native compact-startup arguments/normalization are deleted rather than preserved for a hypothetical future mode.
