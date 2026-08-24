# MR0 Motion / Presentation Architecture Foundation — Implementation Plan

## Approval gate

Do not run `task.py start`, edit product code, dispatch implementation, commit, archive, or enter MR1–MR4 before GPT Architecture Lead approval. Implementation targets committed M0–M2 in `D:/Ameow/.cindy-worktrees/auto-o3p8cr`; dirty M3 files are selectively reviewed candidates only.

## Slice 1 — Codify the authority and dependency contracts

Update the relevant `.trellis/spec/frontend/` documents and architecture guard tests to record and enforce:

- Download/Product facts -> selectors -> presentation projection -> surface -> renderer-local execution;
- `lifecycle.ts` as sole full/compact/transition writer;
- Pointer Field as sole continuous pointer geometry;
- Interaction Origin as a discrete snapshot;
- no feature-motion import path to Product dispatch, lifecycle dispatch, desktop/native actions, or Electron APIs;
- `MainWindowPresentationSurface` as wiring/composition rather than recipe/download/runtime orchestration;
- shell `visualTransitionCompleted` as a private lifecycle-owned epoch acknowledgement, not a feature-motion completion API.

Use the existing `src/architecture/import-guard.test.ts` style. Do not add a framework or dependency.

Checkpoint: source/import guards pass and no authority migrates.

## Slice 2 — Pin the minimal presentation composition boundary

Document and test, using existing projection/composition modules, the following shape:

- current persistent presentation baseline;
- bounded transient presentation intents with local identity/priority;
- terminal-priority projected target;
- reduced semantic target.

MR0 does not add an unused shared production type merely because Dot Field and Character are future consumers. Keep vocabulary in specs and tests unless implementation discovers a concrete gap in an existing projection/caller; if so, name that exact module and return it for Architecture Lead review before adding production code. Do not centralize scheduling, geometry, easing, springs, recipes, or renderer APIs.

Focused tests:

- transient response ends at the latest persistent baseline, not Dormant or its start snapshot;
- a persistent target change during a transient updates the restoration target;
- terminal target interrupts/suppresses ordinary transient work without waiting;
- latest-replaces/coalescing keeps concurrency bounded and cannot form an infinite queue;
- presentation values cannot write Product or lifecycle authority.

Checkpoint: composition is a projection contract, not a new state machine/store/manager.

## Slice 3 — Pin consumer-local runtime lifecycle and retarget semantics

Add a small test harness or consumer-local tests covering the common behavioral contract without creating a common engine:

- mount initializes from current projected target;
- new targets are accepted mid-transition;
- suitable geometry retargets from current rendered condition rather than reset/replay;
- lifecycle collapse/eligibility exit invalidates the active generation, hard-stops work, and sleeps without permanently disposing a still-mounted surface;
- re-expansion wakes/reconstructs from the current projection;
- replacement/unmount permanently disposes rAF/timers/subscriptions/Motion controls;
- generation/epoch/disposed guards make all stale callbacks no-op;
- reconstruction from current projection preserves Product, logical progress, terminal, lifecycle, and collapse correctness even if visual continuity is lost.

Keep M2 `pointerField.ts`/`magnetic.ts` behavior and authority. Add focused tests for centered mount, root-relative updates/reset, disabled/reduced zero displacement, single runtime ownership, and unmount isolation. A defect that requires an authority change is a stop condition, not an assumed edit.

Checkpoint: current Pointer/Motion execution and the M3 candidate's epoch/disposal paths remain uncoupled by source/import guards. MR1's Canvas/rAF consumer and MR2's Character consumer each get a later conformance gate against these invariants; MR0 does not invent fake production consumers or a shared test API.

## Slice 4 — Reduced motion, interpolation classes, and sleep/wake

Tests/specs must prove:

- presentation projection/recipe chooses a deterministic reduced semantic target;
- local execution removes travel/continuous deformation/long propagation/unnecessary displacement and stops obsolete work;
- a mid-flight reduced-motion toggle lands on the semantic target without firing a lifecycle completion;
- information-bearing progress can lag but approaches monotonically and never exceeds the latest authoritative value;
- expressive Character/decorative geometry may spring/overshoot independently without changing Product/lifecycle facts;
- an rAF-like runtime wakes on input/target/transient, runs until settled, cancels its frame, and stays at zero scheduled frames while settled;
- no `setState`/React render loop, Electron Main/BrowserWindow loop, or high-frequency IPC carries frame geometry.

Checkpoint: frame-count instrumentation demonstrates settled sleep; source guards reject high-frequency cross-layer motion paths.

## Slice 5 — Selectively inherit M3 assets and supersede old presentation paths

Review and carry forward only architecture-independent assets:

- ordered queue observation bootstrap/logical cut;
- `interactionOrigin.ts` discrete normalized snapshot;
- presentation-only intake observation/epoch/generation discipline;
- Download correctness and logical progress facts independent from Reveal completion.

Do not automatically adopt current radial/noise/wave recipes, `DownloadIntakeTransitionSurface`, Progress visual materialization, or central-surface coexistence. MR3 chooses Progress presentation and MR4 chooses Intake/Confirmation/Terminal Reveal after MR0. Current M3 can supply tests/lessons, not a mandated visual baseline.

Checkpoint: no current M3 animation callback is reachable from Product correctness, lifecycle progression, lock release, or collapse.

## Slice 6 — Terminal/lifecycle independence and Windows risk gates

Add focused integration tests around the existing request-id/timer/lock policy:

- terminal Product fact independently projects terminal presentation; App/`centerOverlayState` presentation policy owns the bounded opportunity and projects the lifecycle lock;
- terminal motion may be disposed immediately and lifecycle correctness is unchanged;
- lifecycle does not wait for terminal motion completion;
- terminal hold expiry releases only policy-owned state and normal lifecycle rules decide collapse;
- new authoritative active work during the hold re-evaluates locks/collapse eligibility and keeps/returns the window full as appropriate;
- stale outcome timers/request ids cannot collapse or clear newer presentation;
- pointer/lock conditions and matching shell epoch still govern the existing collapse acknowledgement.

Keep both reported Windows issues as separate repair dependencies unless implementation touches their exact paths:

- native conversion/reachability: `App.tsx:377-403 -> desktop/runtime.ts:69-76 -> preload.mts:95-102 -> main.mts:3417-3473 -> mainWindowSurfacePolicy.mts:192-250`;
- terminal-not-compact: `App.tsx:1366-1398 -> App.tsx:796-842 -> centerOverlayState.ts:7-56,84-111 -> App.tsx:577-594 -> lifecycle.ts:251-258,161-178`.

Checkpoint: neither issue is marked solved by visual replacement alone.

## Validation matrix

| Invariant | Planned evidence |
| --- | --- |
| Authority uniqueness | import/source guards plus reducer/projection tests; no second lifecycle or pointer writer |
| Dependency direction | architecture guard rejects Product/lifecycle/native imports and callbacks from feature motion |
| Dispose/stale safety | fake timers/rAF/subscription/Motion-control disposal tests; epoch/disposed callback no-op |
| Retarget safety | mid-flight target update starts from captured current visual condition |
| Persistent + transient | transient completion restores newest baseline; bounded latest/priority replacement |
| Terminal/collapse independence | dispose terminal runtime before completion; lifecycle still follows facts/locks/timer/shell epoch |
| Reduced motion | initial and mid-flight deterministic semantic final-state tests; no fake lifecycle completion |
| Performance | wake/settle/frame-count instrumentation; settled zero-frame assertion |
| No high-frequency React/Main | source guards and review of state/IPC/native call sites |
| Heterogeneous execution | source guards prove current local mechanisms share facts without runtime coupling; MR1/MR2 plans inherit separate conformance gates |
| Information motion | monotonic/no-overshoot progress property/table tests across retargets |
| Expressive motion | spring/overshoot allowed in decorative consumer while facts stay unchanged |
| M0/M1/M2 regression | focused lifecycle/projection/effect/geometry/pointer/magnetic/recipe/panel/completion/native-policy/bridge suites |
| Windows risks | focused bridge/native serialization test; terminal-hold/lock/collapse integration; packaged Windows manual matrix |

Focused existing suites include:

```powershell
npm test -- src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/projections.test.ts src/presentation/main-window/effectExecutor.test.ts src/presentation/main-window/geometry.test.ts src/presentation/main-window/pointerField.test.ts src/presentation/main-window/magnetic.test.ts src/presentation/main-window/motionRecipes.test.ts src/presentation/main-window/panelHover.test.ts src/presentation/main-window/presentationCompletion.test.ts electron/mainWindowSurfacePolicy.test.mts electron/mainWindowPointerBoundary.test.mts electron/preloadBridgeContract.test.mts
```

Final automated gate:

```powershell
npm test
npm run type-check
npm run lint
npm run build
git diff --check
```

Windows manual matrix:

- full/compact/transition and pointer/magnetic M2 regression;
- surface replacement and collapse while feature motion is active;
- terminal success/failure/cancelled visibility then compact restoration;
- new task during terminal opportunity;
- reduced-motion initial and mid-flight behavior;
- native compact reachability/argument conversion in packaged Electron;
- multi-monitor compact reachability and post-collapse passthrough.

macOS is reported **NOT VERIFIED** unless it is actually run.

## Stop conditions

Return to GPT Architecture Lead before proceeding if implementation needs:

- any Product, lifecycle, Pointer Field, or native authority migration;
- feature animation completion as lifecycle/collapse input;
- a shared animator/runtime/manager/bus/DSL/state framework;
- a new graphics dependency or renderer lock-in;
- high-frequency React state or Main/IPC motion;
- repair of either Windows issue beyond the approved MR0 scope;
- Dot Field, Character, Progress Field, Reveal visuals, or MR1–MR4 work.

## Planning-phase completion

Validate the Trellis task, confirm `task.json.status == "planning"`, confirm the diff is limited to this task's planning artifacts, return the planning report, and stop.
