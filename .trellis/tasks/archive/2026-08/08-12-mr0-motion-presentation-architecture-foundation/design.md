# MR0 Motion / Presentation Architecture Foundation — Technical Design

## 1. Evidence baseline

The implementation target is committed M0–M2 in `D:/Ameow/.cindy-worktrees/auto-o3p8cr` (`cindy/auto-o3p8cr` at `69d0ff8`). `D:/Ameow/main` at `e40f5fe` predates that architecture. Dirty M3 files in the worktree are candidate evidence only.

Detailed anchors live in:

- `research/motion-presentation-baseline-audit.md`
- `research/m3-intake-implementation-audit.md`
- `research/windows-correctness-risks-and-validation.md`

## 2. Current ownership map

| Concern | Actual owner | Consumers / direction |
| --- | --- | --- |
| Download/Product facts | `src/features/download/model.ts`, reducer, selectors, client | selectors feed `App.tsx` presentation projections; motion never writes back |
| Center presentation projection | `App.tsx:484-546`; `src/utils/centerOverlayState.ts:136-228` | surface composition and future local runtimes |
| Main Window lifecycle | `src/presentation/main-window/lifecycle.ts:22-49,80-82,135-178,191-370` | read-only `projections.ts:43-153`, React adapter, effect executor, shell |
| Native semantic effects | `effectContracts.ts` / `effectExecutor.ts:25-82`; Electron surface policy | consumes lifecycle effects; no per-frame feature motion |
| Continuous pointer geometry | `pointerField.ts:4-13,37-99` | `magnetic.ts:8-13,58-79`; future Character may consume the same values |
| Discrete Interaction Origin | dirty M3 `interactionOrigin.ts` | one interaction snapshot for a presentation intent; never long-lived pointer authority |
| Presentation Surface | `MainWindowPresentationSurface.tsx` | projection/wiring/composition, shell acknowledgement, pointer events; not recipe algorithms or Download reconciliation |

Dependency graph:

```text
Product facts -> selectors -> presentation projection --------------------+
                                                                           |
Lifecycle reducer -> read-only lifecycle projections ----------------------+-> Surface composition
                                                                           |      -> local runtime -> pixels
Interaction event -> discrete origin -> presentation intent ---------------+
Pointer event -> sole Pointer Field runtime -------------------------------> local consumers
```

No arrow returns from motion execution to Product facts. Feature motion also has no arrow to lifecycle. The existing shell-only `visualTransitionCompleted` acknowledgement is confined to lifecycle-owned shell morphology and matching epochs; it is not available to feature motion as a collapse gate.

## 3. Minimum boundary to add

MR0 does not introduce a `MotionRuntime` service, shared animator, manager, bus, state machine, DSL, or renderer hierarchy. The minimum common contract is behavior expressed in specs, narrow projection/composition values, and tests:

```text
Authoritative facts
  -> projected presentation target
       persistent baseline
       + bounded transient intent(s)
       + optional terminal-priority target
  -> consumer-local execution
```

Create a shared type/helper only if two implementation consumers need the exact same data contract. Scheduling, easing, springs, geometry, and frame ownership stay local.

### Presentation composition

| Part | Meaning | Owner/lifetime |
| --- | --- | --- |
| Persistent baseline | current projected visual target derived from authoritative facts, e.g. logical progress presentation | projection is authoritative for presentation; local runtime may interpolate toward it |
| Transient response | bounded event-scoped additive/temporary response, e.g. click/intake ripple | consumer-local epoch/generation; cannot rewrite baseline |
| Terminal target | success/failure/cancelled projection with higher visual priority | derived from terminal Product fact; may interrupt/absorb/suppress transients |

When a transient ends it reveals/reconverges to the **current** persistent baseline, including baseline changes that arrived while the transient ran. Terminal arrival does not wait for low-priority transients. A terminal target is itself a projection, not a Product or lifecycle authority.

Concurrency is bounded per consumer. The default smallest policy is latest-replaces for same-priority ephemeral work plus terminal priority; a consumer may coalesce or suppress events. No consumer may build an unbounded FIFO animation queue.

## 4. Renderer-local runtime lifecycle

Every future consumer must satisfy this lifecycle without sharing an engine:

| Event | Required behavior |
| --- | --- |
| mount | construct local runtime from the current presentation target; never require historical animation state |
| target change | accept immediately; for suitable geometry, retarget from the current rendered condition rather than reset/replay |
| persistent update during transient | update stored/projected baseline; transient remains additive and later returns to the new baseline |
| terminal target | supersede/intercept lower-priority transient work from current visual condition; do not wait for completion |
| reduced-motion change | resolve deterministically to the reduced semantic target; cancel unnecessary travel/propagation; no fake lifecycle completion |
| collapse / eligibility exit | invalidate the active generation, hard-stop frames/timers/controls, and sleep; because the React surface can remain mounted, do not permanently poison the runtime |
| re-expand / eligibility re-entry | wake or reconstruct from the current projection, never from pre-collapse animation history |
| surface replacement / unmount / dispose | permanently mark disposed, release rAF/timers/subscriptions/Motion controls, and make late callbacks no-op |
| rebuild after replacement | reconstruct from current projection; only brief visual continuity may be lost |

M2 Pointer Field is existing evidence for local `MotionValue` ownership and stable consumption, not a universal implementation template. Its event-driven values do not run a permanent frame loop. Future Canvas/rAF consumers must add explicit wake/settle/sleep behavior locally.

## 5. Lifecycle and terminal visibility

Terminal dependency is one-way:

```text
Terminal Product fact
  +--> terminal presentation projection -> local visual execution
  +--> lifecycle-owned centerOutcome/visibility policy -> collapse eligibility

local visual completion -X-> collapse / lock release / Product transition
```

Current bounded outcome opportunity is owned by App presentation policy: request-id/timer state in `centerOverlayState.ts` and `App.tsx` projects a `centerOutcome` lock; `lifecycle.ts` consumes that lock but does not own the timer. This already qualifies as lifecycle-integrated Presentation policy without migrating timer ownership into the reducer. If retained or adjusted, it remains policy-owned rather than renderer-runtime-owned. New authoritative active work causes projections/locks to re-evaluate collapse eligibility. Runtime callbacks cannot decide.

## 6. Reduced motion

Responsibility is split:

- Presentation projection/recipe boundary selects the deterministic reduced semantic target: the fact remains visible/understandable, with spatial travel, continuous deformation, long propagation, and unnecessary displacement removed or shortened.
- The consumer-local renderer executes that target immediately or with minimal non-spatial transition and stops obsolete work.
- Product and lifecycle code do not receive a fake animation completion.

This applies both at mount and when the preference changes mid-flight.

## 7. Performance and interpolation policies

### Scheduling

- React may publish target/input changes, not per-frame geometry.
- Electron Main, BrowserWindow, preload, and IPC never participate in per-frame feature motion.
- Local runtimes wake on input, target change, or transient intent; render/interpolate; detect settlement; cancel scheduling until the next wake.
- Persistent idle cost must remain visibly below short transient cost. Instrument frame scheduling in tests or a debug harness rather than assuming it.

### Information-bearing motion

Logical progress remains selector authority. Visual progress may lag and monotonically approach the latest authoritative value but must never imply a value greater than it. On target changes it retargets from current visual progress; terminal may take over without waiting.

### Expressive motion

Character/body/ear/eye/hand or decorative material geometry may use spring, temporal lag, secondary motion, small overshoot, squash, or settle because it carries no authoritative quantity. It may consume Pointer Field but cannot create another continuous pointer state.

The shell epoch acknowledgement remains a separate lifecycle protocol, not an example of feature information interpolation.

## 8. Technology and infrastructure verdict

Current dependencies already provide enough primitives:

- `motion@^12.35.2`, DOM/SVG/CSS for shell and possible future Character work;
- browser-native Canvas 2D and renderer-local rAF remain available for a future Dot Field if profiling justifies that route.

No evidence justifies PixiJS, Three.js, WebGL/WebGPU framework, OffscreenCanvas/Worker infrastructure, particle framework, or shared animator. MR0 keeps heterogeneous execution explicit.

## 9. Existing-contract disposition

### Preserve

- M0/M1 lifecycle authority, pure projections, effect boundary, shell epoch acknowledgement, semantic native reachability, and center-overlay request identity.
- M2 Pointer Field as sole continuous pointer geometry and Magnetic as a visual consumer.
- Download reducer/selectors as Product authority.

### Reuse from dirty M3 as concepts/assets after review

- ordered queue observation bootstrap/logical cut;
- Interaction Origin normalized discrete snapshot;
- intake presentation adapter epoch/generation/stale-continuation discipline;
- correctness independent of Reveal completion;
- reduced-motion final-state direction.

### Supersede or re-evaluate

- current radial Impact/noise/wave geometry, timing, and recipe;
- `DownloadIntakeTransitionSurface` as foundation/shared abstraction;
- current Progress materialization and central coexistence (retain only selector-derived facts/cancel correctness);
- any current composition that resets to Dormant rather than the latest persistent baseline.

## 10. Windows risk disposition

### Native argument conversion

The reported reachable path is `App.tsx:377-403 -> src/desktop/runtime.ts:69-76 -> electron/preload.mts:95-102 -> electron/main.mts:3417-3473 -> electron/mainWindowSurfacePolicy.mts:192-250`. Replacing Reveal/Progress does not remove this existing bridge/native compact-reachability path. Keep it as a separate repair dependency and add focused serialization/native-policy and Windows manual gates. Startup argv parsing and unused size/position channels are secondary audit findings; removing them is not required to satisfy MR0.

### Terminal window remains full

The reachable chain is terminal dispatch `App.tsx:1366-1398 -> showForegroundTaskOutcome App.tsx:796-842 -> request-id/timer state centerOverlayState.ts:7-56,84-111 -> presentation lock App.tsx:577-594 -> lock-release/collapse lifecycle.ts:251-258,161-178`. Visual replacement does not remove it. Treat it as a later repair dependency unless approved implementation changes and proves this exact path.

## 11. Acceptance-question crosswalk

| # | Answer |
| --- | --- |
| 1 | Section 2 maps Product, projection, lifecycle, and local runtime ownership/direction. |
| 2 | Section 3 adds only composition/runtime contracts and tests; no global framework. |
| 3 | Section 9 classifies M0–M2 preservation and M3 reuse/supersession. |
| 4 | Section 4 defines mount, change, retarget, replacement, collapse, dispose, rebuild. |
| 5 | Section 3 defines persistent/transient/terminal composition without duplicate authority. |
| 6 | Section 8 concludes no shared Motion abstraction is currently justified. |
| 7 | Section 5 preserves one-way terminal/lifecycle dependency and forbids completion gating. |
| 8 | Section 6 splits reduced semantic selection from local execution. |
| 9 | Section 7 specifies local wake/settle/sleep and bans high-frequency React/Main/IPC. |
| 10 | Section 8 finds the current stack sufficient; the gap is contracts/tests, not an engine. |
| 11 | Section 7 separates non-overshooting information geometry from expressive freedom. |
| 12 | Section 10 keeps both Windows issues as reachable repair dependencies. |
| 13 | `implement.md` maps every invariant to repository-grounded validation. |
