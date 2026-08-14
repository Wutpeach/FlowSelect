# MR8 Download Intake Reveal — Implementation Plan

Implementation is not authorized by this planning task. After GPT Architecture
Lead approval and a separate explicit start instruction, perform the following
on `D:/Ameow/.cindy-worktrees/motion-integration` from
`motion/presentation-integration@48987f7`.

## 1. Freeze the exact acceptance-cause contract

- Add focused runtime/protocol/controller tests before production edits:
  - actual normal and advanced-quality new membership marks exactly one queue
    detail with `acceptedTraceId`;
  - ordinary full snapshots, promotion/removal, quality selection of an
    existing trace, and advanced-quality dedupe stay unmarked;
  - a marked trace present post-reduction and absent pre-reduction publishes one
    Intake with the exact post state;
  - a renderer-local ack is neither required nor sufficient;
  - an extension-like marked snapshot with no local ack publishes Intake;
  - a fresh/replaced controller receiving an unmarked full snapshot of
    pre-existing tasks publishes nothing;
  - a replayed marked snapshot for the same live trace publishes nothing;
  - rapid distinct marked snapshots preserve exact event order;
  - same-trace stale events do not replay, while two separately accepted jobs
    with identical URL/content remain distinct trace-keyed Intakes and a dedupe
    returning the same trace does not replay.
- Stop for Architecture Review if the marker cannot be emitted atomically on
  the authoritative snapshot. Do not guess baseline from time, empty state,
  first render, later full snapshots, or progress.

## 2. Carry the authoritative cause and publish the feature transition

- Add optional `acceptedTraceId` to `VideoQueueDetailPayload` and its normalizer.
  Preserve it only when it is a valid string identifying a task in that snapshot.
- Mark the existing queue-detail emission at the runtime's two actual new-
  membership creation points. Do not mark existing-trace quality selection,
  dedupe, promotion, removal, bootstrap/full refresh, or UI Lab snapshots.
- Add no dedicated Electron event channel and no persistent Download state field.
- Extend `DownloadQueueController` with one narrow Intake subscription, modeled
  on its existing exact post-reduction terminal subscription. Reduce first,
  validate the marker against pre/post membership, then publish the exact post state.
- Expose `onIntake` from `useDownloadQueue`; keep command acknowledgement and
  the Download reducer/model unchanged.
- Keep listener lifetime guarded by the existing controller epoch/disposal
  behavior.

## 3. Add bounded Download-Intake Presentation state

- Add a pure `downloadIntakePresentation` state/reducer and focused tests.
- Add thin hook glue for subscription, one local finite deadline, and cleanup.
- Cover latest-replaces, rapid events, stale expiry no-op, trace removal,
  related/unrelated primary changes, MR4-accepted foreground terminal
  invalidation versus background-terminal suppression, controller replacement,
  and unmount.
- Choose and name one finite implementation duration constant during this step;
  do not couple it to shader completion or lifecycle transition duration.

## 4. Make Expanded priority explicit

- Add a pure `expandedPresentationPolicy` selector and table-driven tests.
- Preserve MR4's current-primary suppression before applying
  Terminal/Intake/Progress selection.
- Replace parallel raw Progress/Terminal host inputs with one resolved
  `ExpandedPresentationTarget` union and add only the concrete Intake variant.
- Carry the current Progress target inside the Intake variant solely so expiry
  reconstructs from current facts; do not retain a snapshot after removal.

## 5. Extend the single MR7 host

- Update `ExpandedPresentationSurface` and its private runtime to consume the
  resolved target.
- Add one concrete Intake rendering mode in the existing WebGL2 shader/runtime.
  Keep shader/lens/noise/timing tuning local and reviewable; do not create a
  recipe framework or renderer interface.
- Normal motion may use bounded transient frames. Reduced Motion must render a
  semantic static/immediate Intake treatment with zero continuous travel.
- Target replacement, sleep, context loss, dispose, and stale callbacks must
  cancel local work without notifying Presentation.

## 6. Wire App and the Surface without new authority

- Subscribe/derive the Intake opportunity next to existing Download projections
  in `App.tsx`; reuse the exact post-reduction terminal listener/policy so a
  qualifying foreground terminal invalidates Intake without waiting for a React
  commit, while a background terminal remains ignored.
- Resolve the single Expanded target in Presentation policy before passing it to
  `MainWindowPresentationSurface`.
- Keep Surface responsible only for settled-full eligibility and passing the
  resolved target to its one host.
- Do not edit lifecycle lock/event/reducer/native files, center-overlay
  retention semantics, central Progress/cancel DOM, Compact Character, Folder
  flows, or Transcode flows.

## 7. Automated validation

Run focused suites first, then the repository gates:

```powershell
npx vitest run src/electron-runtime/service.test.ts src/utils/downloadViewHelpers.test.ts src/features/download/client.test.ts src/features/download/useDownloadQueue.test.ts src/presentation/main-window/downloadIntakePresentation.test.ts src/presentation/main-window/expandedPresentationPolicy.test.ts src/presentation/main-window/expandedPresentationRuntime.test.ts src/presentation/main-window/expandedPresentationSurface.test.ts src/presentation/main-window/downloadProgressProjection.test.ts src/presentation/main-window/downloadTerminalProjection.test.ts src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/presentationCompositionContract.test.ts src/architecture/windows-terminal-retention.test.ts src/architecture/import-guard.test.ts
npm run type-check
npm run lint
npm run docs:build
```

Required proofs:

- authoritative new membership carries one causal marker across renderer and
  extension paths; unmarked full snapshots never fabricate Intake;
- duplicate/rapid/dedupe semantics are deterministic and latest-only;
- timers are opportunity-id guarded and renderer callbacks cannot expire state;
- MR3 trace replacement/downward revision and MR4 terminal retention/priority
  tests remain unchanged or equivalent;
- one host/one canvas/no Dot Field/no second backend remains statically guarded;
- idle/settled/Reduced Motion/sleep/dispose use no unnecessary continuous frame;
- host/runtime contain no Product, lifecycle, desktop, Electron, lock, or native
  authority vocabulary/imports.

## 8. Windows Electron validation

- Verify a renderer-origin Download and a browser-extension-origin Download each
  produce one Intake distinction before/alongside current Progress.
- Verify duplicate queue detail does not replay and two rapid Downloads show
  only the latest opportunity, with no queued delayed reveal.
- Verify current-primary replacement, same-trace terminal, background terminal,
  cancellation, and very fast terminal arrival follow the policy matrix.
- Verify compact -> full transition, ineligible expiry, context loss/recovery,
  DPR resize, black/white themes, and Reduced Motion.
- Confirm central percentage/status/cancel and terminal diagnostic actions remain
  usable throughout because the host is `pointer-events:none`/`aria-hidden`.
- Do not claim macOS validation without direct evidence.

## 9. Documentation and specification synchronization

- Update `site/src/content/docs/docs/downloads.mdx` and
  `site/src/content/docs/en/docs/downloads.mdx` in the implementation commit to
  describe the visible Intake acknowledgement and Reduced Motion behavior in
  user language. Keep both locales aligned and run `npm run docs:build`.
- Use `trellis-update-spec` to synchronize the existing frontend Presentation/
  motion guidance with the approved authoritative marker, latest-only bounded
  owner, MR4/Intake/MR3 priority, single-host target, and Reduced Motion contract.
- Do not create a standalone generic Reveal specification.

## 10. Review and rollback gate

- Inspect the final diff for generic nouns/APIs (`RevealRuntime`, queue,
  scheduler, scene, layer arrays, command bus) and remove them unless they are
  the existing Download queue itself.
- Present implementation evidence to GPT Architecture Lead before commit/archive.
- Roll back as one source change: remove the Intake listener/state/policy/target
  and restore the current MR7 host input shape. Never add a runtime old/new
  fallback.
