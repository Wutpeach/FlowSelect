# MR8 Download Intake Reveal — Architecture Design

## Decision summary

Carry the Application/runtime new-membership cause as optional
`acceptedTraceId` on the existing queue-detail snapshot, derive one typed Intake
transition from the marked exact reduction at `DownloadQueueController`, hold
only the latest event in a bounded feature-specific Presentation state, resolve
Intake/Progress/Terminal priority before the renderer, and pass one resolved
target to MR7's single Expanded Presentation host.

Do not extend `centerOverlayState`, the Main Window lifecycle reducer, the
Download model, the Electron event vocabulary, or the host into a generic Reveal
system. The optional queue-detail causal field is the only protocol expansion.

## Authority and data flow

```text
Application/runtime new-membership insertion
  -> existing video-queue-detail snapshot + optional acceptedTraceId cause
  -> DownloadQueueController reduces the marked snapshot synchronously
       Download state owns membership/order/primary/progress/tombstones
       controller validates cause against pre/post membership
       controller publishes accepted transition + exact post state
  -> Download Intake Presentation state
       one latest opportunity + deadline + stale guards only
  -> pure Expanded Presentation policy
       existing MR4 current-primary rule
       visible terminal > intake > current progress > idle
  -> MainWindowPresentationSurface
       settled-full eligibility only
  -> existing single ExpandedPresentationSurface
       WebGL2 resources, local frames/interpolation, pixels only

Main Window lifecycle reducer -> full/compact/transition/lock/native authority
renderer completion           -X-> Intake lifetime/Download/lifecycle/locks
```

## Intake fact contract

The authoritative root fact is the runtime operation that creates new live
membership: normal queue creation or a new advanced-quality task. The runtime
adds the trace and emits queue detail before acknowledging a renderer command.
The renderer's common semantic input is therefore an optional
`acceptedTraceId` cause on that existing full snapshot, not the local
acknowledgement and not an unmarked snapshot delta.

At the controller boundary:

1. Application/runtime marks only the queue-detail emission caused by actual
   new membership with `acceptedTraceId`;
2. protocol normalization preserves a valid string marker and leaves ordinary
   snapshots unmarked;
3. controller captures previous live membership and reduces
   `queueDetailReceived` through the existing reducer;
4. when the marker is present post-reduction and absent pre-reduction, publish
   one feature-specific Intake transition with the exact post state;
5. let Presentation's latest-only reducer replace any older opportunity.

This is causal metadata on one authoritative state transition, not a second
membership store. Unmarked hydration/full snapshots and repeated marked
snapshots for an existing trace produce nothing. Rapid distinct insertions
replace Presentation locally; there is no visual queue. A deduplicated advanced-
quality request that returns an existing trace emits no marker and no Intake.

The causal field and transition payload need only `traceId`. App/Presentation
derive live membership and primary identity from the supplied exact state. Do
not add source (`drop`, `paste`, `external`), pointer origin, queue position,
status, progress, timestamp, or renderer recipe to the Download fact.

## Presentation state and lifetime

Use a focused pure state module plus thin React timer/subscription glue. A
conceptual state shape is:

```ts
type DownloadIntakePresentationState =
  | { kind: "none"; nextOpportunityId: number }
  | {
      kind: "active";
      nextOpportunityId: number;
      opportunityId: number;
      traceId: string;
      primaryTraceIdAtStart: string | null;
    };
```

The deadline may live in the hook timer rather than state. Whichever shape is
chosen, expiry actions carry `opportunityId`; stale timers are no-ops. The state
does not carry Download records or renderer phases.

### Start

Start on the controller's exact post-reduction marked acceptance transition. Do
not wait for the first progress event or the local command promise.

### End / invalidation

Clear the matching opportunity when:

- its bounded Presentation timer expires;
- a newer opportunity replaces it;
- its trace is no longer live;
- a foreground typed terminal transition qualifies under MR4's exact
  post-reduction primary rule;
- a later non-null primary is unrelated to both the primary observed at start
  and the Intake trace;
- Presentation is explicitly suppressed, the controller lifetime changes, or
  the component unmounts.

The timer runs independently of graphics eligibility. Collapse/transition sleep
does not pause it; wake can render only a still-current target. No renderer
completion is consumed.

## Priority and replacement policy

Do not encode competition in GLSL mode ordering or in the local frame runtime.
Add one pure Presentation selector that receives the existing Progress target,
existing Terminal target, and current Intake target.

Policy order:

1. Apply the existing MR4 rule unchanged: current primary Progress suppresses
   Terminal, including stale defensive overlap.
2. A foreground typed terminal transition accepted by MR4 invalidates Intake;
   while its effective Terminal target exists, select Terminal. A background
   terminal suppressed by MR4 does not interrupt Intake.
3. Otherwise select a current Intake opportunity, carrying the latest Progress
   target as its baseline.
4. Otherwise select current Progress or idle.

Consequences:

- Intake temporarily interrupts Expanded graphics, not the central accessible
  Progress UI or Download facts.
- A later Progress update during Intake remains current; Intake expiry returns
  to that latest target.
- A same-trace terminal removes membership and ends Intake. A foreground typed
  Terminal also invalidates through the existing exact post-reduction terminal
  listener and then presents under MR4 retention.
- A background terminal with another primary remains suppressed by existing
  MR4 logic and does not invent an interruption.
- A new Intake always replaces the previous opportunity. No same-kind replay
  queue or completion chain exists.

## Minimal host contract

Use one resolved discriminated target rather than adding parallel competing
lanes:

```ts
type ExpandedPresentationTarget =
  | { kind: "idle" }
  | { kind: "progress"; progress: ExpandedPresentationActiveProgressTarget }
  | { kind: "terminal"; status: ExpandedPresentationTerminalStatus }
  | {
      kind: "intake";
      opportunityId: number;
      traceId: string;
      progress: ExpandedPresentationProgressTarget;
    };
```

`ExpandedPresentationSurface` receives `target`, `eligible`, Reduced Motion,
and existing material colors. The runtime may keep reconstructible rendered
progress and an Intake-local generation/frame, but it does not retain an Intake
after the publisher removes it and exposes no semantic callback.

The Intake shader/material recipe is intentionally unspecified. The
architecture only requires a distinguishable normal-motion response and a
static/immediate Reduced Motion response. One WebGL2 canvas remains the complete
graphics substrate.

## Lifecycle and locks

No lifecycle changes are required:

- accepted queue membership contributes to existing `hasOngoingTask`;
- App already projects that Product fact to the `task` lock and full intent;
- Terminal retention already projects `centerOutcome`;
- the host already derives eligibility from settled full.

The Intake opportunity must not keep the window full after Product/Terminal
facts disappear. Therefore no `intake` lock or `requestFull("intake")` reason is
allowed.

## Historical M3 disposition

Old M3 was read only as historical evidence from the frozen
`auto-o3p8cr` worktree and the MR0 audit. Still-valid lessons are:

- one latest bounded Presentation opportunity, never a queue;
- opportunity/generation guards for stale timer/frame continuations;
- logical Progress and cancel correctness never depend on Reveal completion;
- Reduced Motion reaches a semantic final/static treatment;
- renderer state is disposable and non-authoritative.

Do not restore:

- click/drop/paste origin capture or local-ack reconciliation;
- `queue_observer_bootstrap` protocol expansion or timing heuristics;
- direct foreground image/file intake;
- the old 3-second constant as an architectural requirement;
- `DownloadIntakeTransitionSurface`, CSS radial mask/SVG noise recipe, or
  `DownloadProgressSurface` extraction;
- any old App/Surface wiring from the frozen worktree.

The MR0 audit already marks the old transition surface, recipe/timing, Progress
extraction, and composition as superseded
(`m3-intake-implementation-audit.md:32-51`). No raw conversation extraction is
needed beyond the task/code evidence already inspected.

## Compatibility and rollback

- No persisted data, migration, command, dedicated event channel,
  Electron/native window, or dependency change is planned. The only protocol
  change is optional `acceptedTraceId` causal metadata on queue detail.
- Update the existing Chinese and English public Download pages for the new
  visible Intake behavior and validate the docs build.
- Existing DOM progress, cancellation, terminal message/diagnostics, MR3/MR4
  projections, and Compact Character stay intact.
- Rollback removes the Intake listener/state/policy variant and returns the host
  to its current Progress/Terminal target set; Product behavior remains correct.

## Architecture stop conditions

Return to GPT Architecture Lead before implementation if the work appears to
require a hydration/bootstrap heuristic beyond the approved causal marker,
another protocol/native change, Download state field, lifecycle lock/phase,
renderer completion callback,
second host/backend, generic Reveal/scene/layer/queue/scheduler API, Folder or
Transcode generalization, central Progress rewrite, or new dependency.
