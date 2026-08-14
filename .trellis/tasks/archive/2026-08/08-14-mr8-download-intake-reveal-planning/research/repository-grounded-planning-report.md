# MR8 Repository-Grounded Planning Report

## 1. Baseline and planning status

- Production implementation baseline:
  `motion/presentation-integration@48987f7`.
- Authoritative code worktree:
  `D:/Ameow/.cindy-worktrees/motion-integration` (clean during research).
- Root `main@7d64fc2` owns Trellis planning records and unrelated dirty Trellis
  updates; it is not the MR7 product-code baseline.
- This task remains `planning`. No product code, implementation activation,
  commit, archive, or final shader recipe is authorized.

## 2. Executive architecture decision

The most accurate repository fact for Download Intake is the Application/runtime
operation that creates a new live Download membership. MR8 should carry that
cause atomically on the already-emitted full queue-detail snapshot as optional
`acceptedTraceId`, then let `DownloadQueueController` validate it against the
exact pre/post-reduction membership.

Its root authority is the Application/runtime insertion: the runtime allocates a
trace, appends it to pending membership, emits queue count/detail, and only then
returns a local `DownloadQueueAck`
(`src/electron-runtime/service.ts:484-494,582-593,617-647,956-959`). The
queue-detail event is already common to renderer-origin and extension-origin intake
(`src/features/download/client.ts:55-67,139-166,180-189`). Therefore:

- do not trigger from click/drop/paste;
- do not trigger from the local ack (it is later and local-only);
- do not wait for numeric progress or primary selection;
- do not infer from shader/animation completion;
- do not infer a transition from an unmarked full-snapshot delta;
- add no new event channel or interaction provenance; add only the optional
  Application-authored acceptance cause to the existing queue-detail DTO.

Publish a narrow typed transition from the controller's exact post-reduction
marked-snapshot boundary, then let a Download-Intake-specific Presentation owner
keep one latest bounded opportunity. Resolve priority before the host and pass
MR7 one concrete `idle | progress | terminal | intake` target.

## 3. Repository authority map

```text
Runtime new-membership insertion                           AUTHORITATIVE INTAKE ROOT
  -> queue detail + optional acceptedTraceId cause
  -> protocol/client typed marked snapshot
  -> DownloadQueueController synchronous reduction        EXACT TRANSITION BOUNDARY
  -> Download reducer/model/selectors                      DOWNLOAD AUTHORITY
  -> validate marker against pre/post membership
  -> narrow accepted event + exact post state
  -> Download Intake Presentation state                   LIFETIME / STALE POLICY
  -> Expanded Presentation policy                         PRIORITY / REPLACEMENT
  -> MainWindowPresentationSurface                        ELIGIBILITY / WIRING
  -> one ExpandedPresentationSurface                      LOCAL WEBGL2 EXECUTION

Main Window lifecycle reducer -> full/compact/transition/locks/native authority
center overlay              -> typed Terminal retention/accessibility/lock
graphics runtime            -X-> Intake expiry, Download, lock, lifecycle, native
```

Evidence:

- Download state is explicitly the renderer-owned long-lived queue/progress/
  terminal projection (`src/features/download/model.ts:3-10,60-80`).
- The reducer is the single Download lifecycle transition owner and accepts
  queue snapshots, progress, and typed terminal removal
  (`src/features/download/reducer.ts:11-27,104-149,195-208`).
- Primary Download and pre-progress indeterminate state are selector-derived
  (`src/features/download/selectors.ts:8-24,38-52`).
- Controller callbacks reduce events synchronously; terminal listeners already
  receive exact post-reduction state
  (`src/features/download/useDownloadQueue.ts:24-47,88-99,191-230`).
- App projects current Download facts to MR3/MR4 targets and existing lifecycle
  locks (`src/App.tsx:430-438,487-560,579-596`).

## 4. Authoritative trigger and identity

### Selected trigger

At each runtime path that actually creates new live membership, mark that one
queue-detail emission with `acceptedTraceId`. Normal queued Download creation
and new advanced-quality task creation qualify
(`service.ts:484-494,617-647`). Returning an existing advanced-quality trace is
an acknowledgement but not new membership (`service.ts:620-627`) and stays
unmarked. Moving an existing trace from quality selection into pending also
stays unmarked (`service.ts:497-513`).

Protocol normalization preserves only a valid marker. The controller reduces
the full snapshot first and publishes Intake only if the marked trace is present
post-reduction and absent pre-reduction. The transition payload is only
`traceId`; exact post state supplies current primary/live facts without copying
them.

This is more accurate than alternatives:

| Candidate | Verdict | Repository reason |
| --- | --- | --- |
| UI click/drop/paste | Reject | It is intent before acceptance and misses extension-origin Downloads. |
| `DownloadQueueAck.accepted` | Reject as trigger | It arrives after queue insertion/detail and exists only for renderer command callers; reducer uses it only to clear a reused-trace tombstone (`reducer.ts:81-92`; `useDownloadQueue.ts:117-124,155-170`). |
| First progress | Reject | A valid active Download already has synthetic indeterminate Progress before numeric progress (`selectors.ts:33-52`). |
| Current-primary change | Reject as trigger | Accepted pending membership is already Intake; primary is a later Presentation interruption fact. |
| Unmarked queue snapshot delta | Reject | Queue detail is a full snapshot. A fresh/replaced controller starts empty and would misclassify pre-existing tasks on the next refresh. |
| Application-marked queue snapshot | Select | It atomically joins the authoritative creation cause with the common typed membership snapshot and exact reduction boundary. |
| Shader/animation completion | Reject | It is renderer-local execution and cannot prove acceptance or lifetime. |

### Duplicate and rapid Intake

- Unmarked full snapshots never emit, regardless of how many traces are new to a
  controller instance.
- Replaying the same marked snapshot after its trace is already live does not
  emit because the pre/post membership guard is idempotent.
- Two separately created requests for the same URL/media normally have distinct
  traces and distinct marked snapshots, so the later opportunity replaces the
  earlier one. An Application dedupe returning the same existing trace is
  unmarked and does not replay Intake.
- Rapid distinct marked snapshots publish in event order. Presentation holds one
  latest opportunity; a newer one replaces the old immediately. There is no
  retained visual queue.
- Existing terminal tombstones reject stale detail/progress revival
  (`reducer.ts:104-149,195-208`). Runtime trace IDs are session-unique; a
  hypothetical reused generation is not an MR8 identity mechanism and could
  replay only after the existing explicit generation reset plus a later
  authoritative membership transition.

### Snapshot / controller-lifetime boundary

`video-queue-detail` is a full live snapshot (`service.ts:386-416`) and a newly
created/replaced controller starts empty (`useDownloadQueue.ts:31-57,238-253`).
That makes bare absent-to-present comparison insufficient: the next unmarked
refresh may contain pre-existing work. The optional cause solves this without
the old M3 bootstrap—unmarked hydration/full snapshots establish current state
but never claim acceptance. Time, first-render, empty-state, and progress
heuristics remain forbidden.

## 5. Ownership and bounded lifetime

Do not extend `centerOverlayState`. It owns direct processing/outcomes,
request-id retention, accessible Terminal identity/message/action, and the
`centerOutcome` lock. Intake is decorative, has no semantic center content, and
must not risk MR4 state transitions.

Add a smaller feature-specific Presentation owner with only:

- monotonic `opportunityId` (Presentation identity, not task identity);
- Intake `traceId`;
- primary trace observed at start;
- one finite deadline/guarded expiry action.

Lifetime begins at controller publication after reduction and ends at the
earliest of deadline, replacement, trace removal, a foreground typed terminal
accepted by MR4 from its exact post-reduction primary, unrelated new primary,
suppression/controller replacement/reset/unmount. A new primary equal to the
Intake trace may keep the still-current opportunity. A `null` primary does not
extend or replay it. A background terminal suppressed by MR4 does not interrupt
Intake.

The deadline belongs to Presentation state/hook and continues while the host is
ineligible. Host wake/sleep and animation completion never change it. Old timer
callbacks carry `opportunityId` and are no-ops after replacement.

## 6. Intake / Progress / Terminal contract

MR3 and MR4 remain unchanged:

- MR3 maps only the current primary Download to idle/indeterminate/determinate
  (`downloadProgressProjection.ts:4-49`).
- MR4 accepts only typed Download terminal Presentation and invalidates it when
  a current primary exists, including before numeric progress
  (`downloadTerminalProjection.ts:16-29,40-99`).
- MR4 Terminal retention and `centerOutcome` ownership remain outside graphics;
  MR7 records success/cancelled 1500 ms and failure 5000 ms retention as current
  behavior (`MR7 planning report:61-65,96-106`).

The new pure Presentation policy is:

1. preserve MR4 current-primary suppression (defensive Progress/Terminal
   overlap resolves to current-primary semantics);
2. a foreground typed terminal accepted by MR4 invalidates Intake; its effective
   Terminal target selects Terminal, while a background terminal remains ignored;
3. otherwise current Intake selects the feature-specific Intake mode;
4. otherwise select current Progress or idle.

Intake interrupts only Expanded graphics. The accessible central Progress DOM
and cancel control remain mounted and current. Progress changes during Intake
are not discarded; expiry returns to the latest projection, never an old
snapshot. A background terminal suppressed by MR4 cannot compete in the shader.

## 7. Main Window lifecycle and locks

No new lock is justified.

- App already derives `hasOngoingTask` from Download/Transcode Product state and
  maps it to `task` lock (`src/App.tsx:506-545,579-596`).
- Ongoing work already requests full presentation (`src/App.tsx:925-929`).
- Terminal Presentation already owns `centerOutcome`.
- The lifecycle reducer remains the only full/compact/transition/lock authority
  (`lifecycle.ts:3-48,55-80,189-370`).
- Expanded graphics eligibility remains settled-full only
  (`MainWindowPresentationSurface.tsx:621-626`).

An Intake lock would duplicate Product task membership and could incorrectly
hold the window after task/Terminal facts disappear. Intake does not add a
full-intent reason or native operation.

## 8. Minimal MR7 host input change

MR7 currently passes separate Progress and Terminal targets
(`expandedPresentationTargets.ts:1-24`;
`ExpandedPresentationSurface.tsx:88-97,278-296`). Its local runtime currently
contains a Progress-over-Terminal selection at
`expandedPresentationRuntime.ts:170-207`. MR8 should move that policy above the
renderer rather than add a third competing lane.

Pass one resolved union:

```ts
idle
| progress(activeProgressTarget)
| terminal(success | failure | cancelled)
| intake(opportunityId, traceId, currentProgressTarget)
```

This is one concrete Download feature extension, not a scene/layer API. The
Intake variant carries the current Progress baseline only so the one host can
reconstruct from current facts when the transient ends. It carries no deadline,
priority number, command, callback, queue, lock, native fact, or Folder placeholder.

The host remains one `aria-hidden`, `pointer-events:none` WebGL2 canvas
(`ExpandedPresentationSurface.tsx:273-287,325-381,404-417`). It may own local
Intake frames/generation and pixels, but not semantic lifetime or priority.

Reduced Motion keeps the `intake` variant and renders one immediate/static
semantic distinction. It removes non-essential travel/explosion and continuous
frames; it does not collapse Intake into ordinary Progress.

## 9. Historical M3 evidence

Reading old M3 was useful, but only through frozen task/code evidence; no old
implementation is production authority.

Still valid:

- latest replaces, no visual queue;
- bounded Presentation relevance and epoch-guarded expiry;
- stale local frame/timer continuations are no-ops;
- Progress/cancel correctness is independent of Reveal completion;
- Reduced Motion resolves to a semantic static/final treatment.

Superseded and not restored:

- interaction-origin and local-ack correlation;
- queue-observer bootstrap or broad provenance protocol expansion (the new
  one-field authoritative acceptance cause is the reviewed replacement);
- direct foreground image/file Intake;
- the old 3000 ms value;
- CSS radial mask, SVG noise/wave/Impact recipe;
- extracted `DownloadProgressSurface` and old App/Surface composition.

The MR0 audit explicitly classifies origin/adapter discipline as historical
lessons while marking recipe/timing, transition surface, Progress extraction,
and composition for re-evaluation or supersession
(`.cindy-worktrees/motion-integration/.trellis/tasks/archive/2026-08/08-12-mr0-motion-presentation-architecture-foundation/research/m3-intake-implementation-audit.md:14-35,47-51`).

## 10. Minimal implementation boundary

Expected production boundary:

- `src/electron-runtime/service.ts` and event-contract tests: mark only actual
  new-membership queue-detail emissions with `acceptedTraceId`.
- `src/protocol/download/ipcTypes.ts`, queue-detail normalization, and
  `src/features/download/client.ts`: preserve the optional typed cause across
  the existing event boundary; add no dedicated channel.
- `src/features/download/useDownloadQueue.ts`: reduce the marked snapshot,
  validate pre/post membership, publish the exact accepted transition, and
  expose the narrow hook listener; no Download model/reducer field change.
- `src/presentation/main-window/downloadIntakePresentation.ts` plus thin hook:
  feature-specific opportunity state, deadline, replacement/invalidation.
- `src/presentation/main-window/expandedPresentationPolicy.ts`: pure resolved
  target selection.
- `expandedPresentationTargets.ts`, `expandedPresentationRuntime.ts`, and
  `ExpandedPresentationSurface.tsx`: one Intake variant and renderer-local execution.
- `App.tsx` and `MainWindowPresentationSurface.tsx`: subscription/projection and
  resolved-target wiring only.
- Chinese/English `site/.../downloads.mdx` pages and frontend Presentation spec
  guidance, plus focused tests and existing architecture/composition guards.

Explicitly untouched: Download model/reducer authority, command acknowledgement,
dedicated Electron event vocabulary, lifecycle/projections/effects/native
policy, center-overlay MR4 state, central Progress/cancel DOM, Compact Character,
and Folder/Transcode flows. The runtime emission and queue-detail DTO change only
to carry the approved causal field; public Download docs and frontend
Presentation specs are updated in the same implementation commit.

## 11. Validation strategy

### Automated

- Runtime/protocol/controller: marked renderer and extension-like new membership,
  unmarked full snapshot on fresh/replaced controller, replayed marked snapshot,
  same-URL distinct jobs versus same-trace dedupe, rapid marked traces,
  terminal/removal, disposal/stale subscription.
- Presentation state: latest replacement, guarded expiry, live removal,
  related/unrelated primary change, exact MR4 foreground-terminal invalidation
  versus background-terminal suppression, suppression/unmount.
- Policy matrix: existing MR4 suppression, Terminal > Intake, Intake > Expanded
  Progress, latest Progress recovery, idle.
- Runtime/host: opportunity replacement, target reconstruction, stale frame
  invalidation, Reduced Motion static/no continuous frame, one-frame budget,
  sleep/wake/dispose/context-loss/resource cleanup.
- Regressions: MR3 projection, MR4 projection/retention, lifecycle, composition,
  Download controller/reducer/selectors, import guards.
- Documentation/spec: both Download locales build, and Motion/Presentation
  guidance records the authoritative cause, owner, priority, host, and Reduced
  Motion contract without defining a generic Reveal framework.
- Static architecture: exactly one Expanded host/canvas, no Dot Field/fallback,
  no Product/lifecycle/native imports in host/runtime, no generic Reveal queue/
  scheduler/scene/layer API.

### Windows Electron

- renderer-origin and extension-origin Intake each display once;
- duplicate and rapid intake remain latest-only;
- pending -> primary, unrelated new primary, same-trace terminal, background
  terminal, cancellation, and very-fast terminal follow the policy;
- compact/full eligibility never pauses/replays expired Intake;
- Reduced Motion, black/white themes, DPR/resize, context loss/recovery;
- DOM percentage/status/cancel/terminal diagnostic actions remain accessible and
  interactive above the non-interactive canvas.

Do not claim macOS verification without evidence.

## 12. Architecture review return

Planning is ready for GPT Architecture Lead review. Implementation must not
start until the Lead approves this report and the user later explicitly
authorizes `task.py start`.
