# MR8 Download Intake Reveal Planning

## Goal

Plan a short, semantically distinct Download Intake Reveal on the single MR7
Expanded Presentation host. The reveal tells the user that a new Download has
entered the authoritative Download queue without changing Download correctness,
MR3 Progress, MR4 Terminal Presentation, or Main Window lifecycle authority.

The authoritative implementation baseline is the clean
`motion/presentation-integration@48987f7` worktree at
`D:/Ameow/.cindy-worktrees/motion-integration`. Root `main` owns this planning
record; it is not the MR7 production-code baseline.

## Background and confirmed facts

- Application/runtime membership insertion is the earliest authoritative
  acceptance fact. It appends a trace, emits queue state/detail, and only then
  returns the local acknowledgement
  (`src/electron-runtime/service.ts:484-494,582-593,956-959`).
- The existing `video-queue-detail` path covers renderer-origin and
  browser-extension-origin Downloads. A local `DownloadQueueAck` does not cover
  extension intake and therefore cannot be the Presentation trigger
  (`src/features/download/client.ts:55-67,139-166,180-189`).
- `DownloadQueueController` synchronously reduces each queue event before
  publishing state. The same exact-transition pattern already exists for typed
  terminal facts (`src/features/download/useDownloadQueue.ts:24-47,191-230`).
- Queue membership, order, primary task, progress, terminal tombstones, and
  cancellation remain Download-owned (`src/features/download/model.ts:3-10,60-80`;
  `reducer.ts:11-27,104-149,195-208`; `selectors.ts:8-24,38-52`).
- MR3 Progress is a pure current-primary projection and MR4 Terminal is a typed,
  bounded Presentation projection with current-primary invalidation
  (`downloadProgressProjection.ts:4-49`;
  `downloadTerminalProjection.ts:4-99`).
- The existing `task` lock and full intent are already derived from ongoing
  Product work (`src/App.tsx:487-560,579-596,925-929`). The single Expanded host
  is eligible only while the lifecycle projection is settled full
  (`MainWindowPresentationSurface.tsx:621-640,1110-1120`).
- MR7 explicitly requires later Intake work to add a feature-specific typed
  projection plus explicit priority/retention policy, then reuse the same host
  without a generic Reveal API
  (`.trellis/tasks/archive/2026-08/08-14-mr7-expanded-presentation-substrate-replacement/research/repository-grounded-planning-report.md:169-185`).

## Requirements

### R1. Authoritative Intake trigger

- The authoritative root is the Application/runtime operation that creates a
  new live Download membership. Its already-emitted `video-queue-detail`
  snapshot gains one optional causal field, `acceptedTraceId`, only on the
  emission caused by that new membership.
- `acceptedTraceId` is absent from ordinary full snapshots, promotion/removal,
  UI Lab restore, advanced-quality selection of an existing trace, and a
  deduplicated acknowledgement that returns an already-live trace.
- `DownloadQueueController` first reduces the marked snapshot, then publishes
  one Intake transition only when the marked trace is present post-reduction
  and was absent pre-reduction. The controller supplies the exact post state.
- The transition is not inferred from a UI click/drop/paste, command promise,
  first progress callback, React commit, shader state, or animation completion.
- `queueAccepted` remains only an explicit trace-generation/tombstone reset. It
  does not trigger Intake.
- Replayed marked snapshots for a still-live trace and unmarked full snapshots
  produce no transition. A fresh/replaced controller can consume a full
  snapshot without classifying pre-existing tasks as Intake.
- Two separately created jobs remain two Intakes even when their URL/content is
  identical, because Application assigns distinct trace identities. An
  Application dedupe that returns the same existing trace is not a new Intake.
- Add no dedicated Electron event channel, Download state field, interaction
  provenance, or timing/bootstrap heuristic. If the causal marker cannot be
  emitted atomically with the authoritative snapshot, stop for Architecture
  Review rather than falling back to snapshot-delta guessing.

### R2. Feature-specific Presentation ownership

- Add one small Download-Intake Presentation state/projection, separate from
  `centerOverlayState` and separate from the Download reducer.
- It owns only the latest opportunity identity, intake trace, bounded deadline,
  and the primary trace observed when the opportunity began.
- It stores no queue/task/progress/terminal truth, interaction origin, shader
  phase, lifecycle phase, lock, native state, or accessible outcome content.
- Its output is `none | intake(opportunityId, traceId)`. The monotonic
  opportunity id is Presentation identity only.

### R3. Bounded lifetime and stale invalidation

- Lifetime begins when the exact post-reduction membership transition is
  published to Presentation.
- Lifetime is finite and owned by the feature-specific Presentation
  state/hook. The implementation may tune one local duration constant; visual
  completion never starts, extends, or ends the lifetime.
- The current opportunity ends at the earliest of:
  - its Presentation deadline;
  - a newer Intake transition (latest replaces; never queue);
  - its trace leaving authoritative live Download membership;
  - a foreground typed terminal transition accepted by MR4 from its exact
    post-reduction state (`postReductionPrimary === null`);
  - a later non-null primary trace that is neither the primary captured at
    Intake start nor the Intake trace itself;
  - UI Lab/suppression, controller replacement, reset, or unmount.
- A primary transition to the Intake trace may keep the still-unexpired
  opportunity. A transient `null` primary while the trace remains queued does
  not fabricate a new event or extend the deadline.
- Old deadline callbacks are opportunity-id guarded and cannot clear a newer
  Intake.

### R4. Intake / Progress / Terminal policy

- Preserve MR4 first: a current primary Download continues to invalidate the
  Terminal target, and a background terminal remains suppressed from center
  Presentation.
- A foreground typed Terminal transition accepted by MR4 invalidates Intake;
  its visible Terminal target then owns the Expanded graphics presentation.
  A background terminal suppressed by MR4 does neither.
- Otherwise, an unexpired Intake temporarily owns only the decorative Expanded
  graphics mode. MR3 Progress facts, central DOM progress, text, and cancel
  controls remain live and unchanged.
- When Intake ends, the host reconstructs from the latest MR3 Progress target;
  it does not replay or restore an old progress snapshot.
- Put this selection in a pure Presentation policy function. The shader and
  renderer runtime receive one already-resolved target and do not compete for
  priority.

### R5. Main Window lifecycle and locks

- Add no Intake lock, lifecycle event, full-intent reason, reducer phase, native
  request, or animation acknowledgement.
- Existing Product `task` facts keep the Main Window full while the accepted
  trace is live; existing `centerOutcome` facts cover Terminal retention.
- Expanded-host eligibility remains exactly settled full. Ineligible/sleeping
  time does not pause or restart the Intake deadline.

### R6. Single-host input and execution

- Replace the host's parallel raw Progress/Terminal competition with one
  feature-specific resolved Expanded target:
  `idle | progress | terminal | intake`.
- The Intake variant carries only `opportunityId`, `traceId`, and the current
  Progress baseline needed for renderer-local reconstruction. It carries no
  command, callback, deadline, lock, queue, scene, layer list, or future Folder
  payload.
- The sole `ExpandedPresentationSurface` remains one non-interactive,
  `aria-hidden` WebGL2 host. No Dot Field, second substrate, second canvas,
  backend fallback, generic Reveal runtime, scheduler, priority bus, scene API,
  or new dependency is allowed.
- Reduced Motion keeps the typed Intake mode for its normal bounded lifetime but
  renders an immediate/static semantic distinction with no non-essential travel,
  explosion, or continuous frame work.

## Acceptance Criteria

- [ ] A repository-grounded report identifies Application-authored new
      membership plus its atomic queue-detail cause marker as the authoritative
      Intake source and explains why click, ack, unmarked snapshot delta,
      progress, and renderer completion are not sources.
- [ ] Ownership, start/end lifetime, duplicate handling, rapid replacement,
      trace removal, primary replacement, terminal interruption, and stale
      callback behavior are explicit.
- [ ] MR3 Progress and MR4 Terminal contracts remain unchanged; a pure
      Presentation policy selects the single Expanded target.
- [ ] No new Main Window lifecycle or lock authority is introduced.
- [ ] The MR7 host receives one minimal Download-specific Intake target and no
      generic Reveal/queue/scene framework is planned.
- [ ] Reduced Motion preserves Intake semantics while removing non-essential
      travelling/explosive execution.
- [ ] The implementation boundary and automated/manual validation matrix are
      concrete and repository-grounded.
- [ ] The plan requires paired Chinese/English Download documentation, docs
      build validation, and frontend Presentation spec synchronization.
- [ ] Old M3 evidence is classified as historical only; reusable lessons and
      superseded code are identified.
- [ ] Planning stops at GPT Architecture Lead review. No Product implementation,
      `task.py start`, commit, archive, or final visual recipe is produced.

## Out of scope

- Implementation or final shader/lens/noise/takeover tuning.
- Folder Confirmation Reveal, Transcode Reveal, foreground image/file intake,
  Compact Character refactoring, or docs-site feature work.
- Interaction-origin capture or renderer/local-ack correlation.
- Native-window changes, generic Reveal infrastructure, a second graphics
  host/backend, or Dot Field restoration. The one optional queue-detail causal
  field in R1 is the only protocol change in scope.
