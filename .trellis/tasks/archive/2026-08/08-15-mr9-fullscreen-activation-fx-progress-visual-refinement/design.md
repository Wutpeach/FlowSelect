# MR9 Technical Design

## Status and source baseline

This is planning only. The implementation baseline is `motion/presentation-integration` at `4de9c2e`, not root `main` at `5619ba0`. The future MR9 branch must be cut from the integration line and must bring this reviewed task directory with it before any product edit.

## Existing authority chain

```text
Download/Application and existing Presentation facts
  -> pure Download/Folder/Activation projections
  -> resolveExpandedPresentationTarget
  -> MainWindowPresentationSurface
  -> the single ExpandedPresentationSurface
  -> one renderer-local runtime + one WebGL2 canvas/program
  -> pixels
```

The existing host is already the right substrate:

- `App.tsx:499-503` projects the current primary Download into neutral determinate/indeterminate Progress.
- `App.tsx:565-572` resolves the current terminal, Intake, and Progress facts before composition.
- `MainWindowPresentationSurface.tsx:615-620` derives graphics eligibility from settled full lifecycle state without giving the renderer lifecycle authority.
- `MainWindowPresentationSurface.tsx:1104-1113` mounts one `ExpandedPresentationSurface`.
- `ExpandedPresentationSurface.tsx` owns one WebGL2 context, one fragment program, one canvas, context-loss failure isolation, resize/DPR handling, and the existing consumer-local runtime.

MR9 extends these concrete contracts. It does not add another renderer, scheduler, queue, layer graph, or generic scene abstraction.

## Repository findings by opportunity

### Intake: occurrence is sufficient; local drop/paste origin uses one paired transient sidecar

MR8 provides a strong occurrence fact. `ElectronDownloadRuntime.emitQueueState` adds transient `acceptedTraceId` only to the queue-detail snapshot caused by new membership (`src/electron-runtime/service.ts:957-964`). The Download controller reduces the snapshot first, verifies that the trace became a member, and then emits one Intake transition. `downloadIntakePresentation.ts:14-24` owns one latest-only bounded opportunity.

This is sufficient to trigger Intake FX and must remain the occurrence authority.

The current published fact carries no coordinate or transport origin, but the fullscreen surface does synchronously own `clientX/Y` for causal URL drops before App begins asynchronous resolution. MR9 can preserve that point without guessing by extending the existing authoritative acceptance envelope, not by correlating UI intent with a later acknowledgement.

Minimum causal-origin contract:

1. At a local submission boundary, synchronously snapshot one immutable normalized origin before any await. URL drop finite-checks, clamps, and normalizes its event point. Paste reads the existing Surface-local live pointer field only when `pointerInside` is true at that exact paste submission; otherwise it snapshots center.
2. Carry that snapshot as an optional transient Intake-origin sidecar through the renderer command and IPC adapter. It stays separate from `QueueDownloadCommand`, `RawDownloadInput`, Download task records, progress, tombstones, and durable queue state.
3. When runtime accepts a genuinely new membership, attach the sidecar only to the same one-shot queue-detail emission that already carries `acceptedTraceId`. `acceptedTraceId` is the correlation identity; no request map or later acknowledgement correlation is added.
4. The client validates the sidecar only when the same payload has a valid `acceptedTraceId`. The controller first performs MR8's absent-before / present-after membership proof, then emits one Intake transition with either the paired local origin or center.
5. Presentation retains the origin only in the current bounded Intake opportunity. Removal, replacement, terminal reconciliation, deadline expiry, and stale-generation rules discard it with that opportunity.

The narrow contract shape is an optional second cause argument, not a field on the canonical Download command or raw request:

```ts
type LocalIntakeOrigin = { kind: "local"; x: number; y: number };
type QueueDownloadPresentationCause = { intakeOrigin?: LocalIntakeOrigin };

queueDownload(command: QueueDownloadCommand, cause?: QueueDownloadPresentationCause): Promise<DownloadQueueAck>;
queuePastedDownload(
  command: QueueDownloadCommand,
  ports: PastedSelectionPorts,
  cause?: QueueDownloadPresentationCause,
): Promise<DownloadQueueAck>;

type VideoQueueDetailPayload = {
  tasks: VideoQueueTaskPayload[];
  acceptedTraceId?: string;
  acceptedIntakeOrigin?: LocalIntakeOrigin; // valid only beside acceptedTraceId
};
```

Use one narrow Surface paste-submission callback rather than lifting continuous pointer state into App. The Surface synchronously reads `isPointerInsidePanelRef` plus the current Pointer Field value, normalizes it against the stable viewport, and passes the immutable optional origin with clipboard data to App. A leave makes the pointer invalid; the centered reset value is never treated as a local origin. App passes that cause through `queuePastedDownload` across any async selection resolution. The Renderer IPC adapter decodes the optional origin separately from `decodeQueueDownloadCommand`; Browser Extension omits it. Runtime threads it as a separate parameter through `queueDownload` / `queuePastedDownload` / `queueVideoDownload` / the accepted `emitQueueState` call; advanced-quality probing publishes it on the initial marked membership, while later option selection emits no marker or origin.

Fullscreen URL drops that enter a new Download membership use the captured drop point. Fullscreen paste uses the paste-time pointer only when it was currently valid and inside the surface; otherwise it uses center. Browser Extension uses center. Pointer movement after submission cannot mutate the snapshot, even if acceptance is delayed. Advanced-quality selection on an already accepted trace does not create a second marked membership and cannot re-ignite. Acceptance-time pointer reads, historical last pointer, timing windows, and UI-ack maps are forbidden. If implementation cannot prove same-emission pairing, local Intake is a hard blocker requiring a prerequisite contract split; it must not silently degrade a proven local submission to center.

### Folder Confirmation: sufficient

Successful folder drop is already authoritative at the point where `saveOutputPath` succeeds and `showFolderDropOutcome` creates `folder-outcome-visible` (`App.tsx:839` and `App.tsx:1955-1963`). `CenterOverlayState` already carries a monotonically changing `requestId`, a success/error status, and bounded lifetime.

MR9 should:

- normalize the original full-surface drop point before asynchronous work;
- carry it in the existing `showFolderOutcome` Presentation action/state;
- project only `folder-outcome-visible + status=success` into Anchor / Lock;
- reuse `requestId` as the activation identity;
- keep errors on the existing error outcome path without high-salience Folder FX.

No Product or filesystem fact is duplicated.

### Meaningful Session Completion: authority does not exist

The current Download model (`src/features/download/model.ts:70-79`) contains trace-keyed tasks, order, progress, cancel/quality intent, and terminal tombstones. The terminal subscription exposes one typed outcome plus the exact post-reduction queue snapshot (`useDownloadQueue.ts:42-43`, `236-238`). The canonical Application and protocol models have trace IDs but no `sessionId`, `groupId`, `batchId`, meaningful-set identity, or typed group-completion transition.

Therefore:

- `order.length === 0`, `activeDownloads === 0`, and `postReductionPrimary === null` are not meaningful session completion facts;
- a busy-period tracker in Presentation would create the forbidden second completion truth;
- MR9 must not implement Resolve / Release until Product/Application exposes a real semantic fact;
- no speculative completion target, counter, or latent renderer mode should be added in the first implementation slice.

The visual mapping is still defined for future use: once an authoritative completion fact exists, Resolve / Release will use the same palette and phase grammar with the smoothest timing, lowest turbulence, no chromatic separation, and a decay into the neutral/deep thermal roles. That future fact is an explicit prerequisite, not something the renderer infers.

### Single-task Terminal: preserve MR4 truth, retire fullscreen treatment

MR4's exact post-reduction terminal classification remains authoritative for one Download outcome. MR9 does not change terminal Product truth, typed status, diagnostic payload, duplicate idempotence, bounded request-id retention, stale invalidation, new-primary invalidation, or lifecycle independence.

The visual disposition changes at the Presentation boundary:

- remove `terminal` from the Expanded target union, pure Expanded policy, App host input, and fragment-shader modes;
- retire `resolveDownloadTerminalTarget` as a fullscreen-host projection rather than dimming the old recipe;
- keep the existing DOM outcome/diagnostic path available as restrained, bounded semantic feedback, including diagnostic copy affordance;
- use no thermal sweep, edge chase, fullscreen convergence, or other same-salience replacement recipe for a single task terminal;
- ensure WebGL failure cannot remove the semantic outcome.

Meaningful Session Completion remains separately gated and cannot inherit this per-terminal fact.

## Concrete target and policy shape

Keep the current single discriminated union. Add one concrete activation variant rather than generic scenes or layers:

```ts
type ThermalOrigin =
  | { kind: "center" }
  | { kind: "local"; x: number; y: number }; // clamped normalized viewport

type FullscreenActivationTarget = {
  kind: "activation";
  opportunityId: number;
  personality: "intake" | "folder";
  startedAt: number; // Presentation monotonic clock; never renderer completion
  origin: ThermalOrigin;
  progress: ExpandedPresentationProgressTarget;
};
```

Do not add `completion` until its fact exists. `progress` is embedded so Intake or Folder Confirmation can preserve a current circular Download carrier in the same draw call while the discrete effect passes over it.

Pure policy remains concrete and exhaustive:

1. Successful Folder activation wins when the folder outcome is current and carries current Progress as an underlay if a Download also exists.
2. Intake activation wins over ordinary Progress and carries current Progress as an underlay.
3. Progress follows.
4. Idle follows.

Terminal classification and DOM outcome retention remain outside this Expanded resolver. Existing primary/background/stale rules still decide whether the restrained terminal outcome is current, but no terminal result selects or wakes the WebGL host.

The Folder-over-Intake choice is a concrete policy for the only defensive overlap between the two approved activation opportunities. It is not a configurable priority mechanism.

No renderer decides priority, meaning, or lifetime.

## Renderer-local execution

Extend `expandedPresentationRuntime.ts`, do not add a scheduler.

- Each bounded Presentation opportunity supplies `startedAt` from the same monotonic clock used for its current lifetime. Intake derives it from the existing opportunity deadline/duration; Folder records it when the success Presentation is created.
- Personality constants provide one bounded visual duration and phase stops. The runtime derives phase from `(now - target.startedAt) / duration`.
- Latest target replacement discards the old reconstructible phase immediately.
- Ineligible/sleep time advances the phase instead of pausing it. Waking late reconstructs the current phase or an already-dissipated result and never replays ignition.
- No completion callback leaves the renderer. Real UI state is already active before the first FX frame.
- Normal motion schedules while activation is visibly alive, while indeterminate Progress animates, or while determinate Progress is converging.
- Reduced Motion renders one bounded semantic snapshot per input change and does not run travelling/chase frames.
- One pending rAF remains the hard maximum. Idle, settled determinate Progress, dissipated activation, sleep, context loss, and dispose schedule zero frames.

Suggested full-motion phase envelope, calibrated later in deterministic visual validation:

| Phase | Intake | Folder |
| --- | --- | --- |
| Ignition | 0-12%, strongest energy and bounded UV warp | 0-14%, firm but quieter |
| Thermal sweep | 8-36%, fast and turbulent | 10-42%, steadier front |
| Edge capture | 28-48% | 34-55%, emphasized |
| Dual-front chase | 42-72% | 48-76%, low turbulence |
| Opposite closure | 68-82% | 72-88%, emphasized lock |
| Convergence punctuation | 80-87%, short | 86-92%, short |
| Dissipation | 86-100% | 91-100% |

The frozen visual direction is medium-fast with roughly one second of perceived feedback. A 600-750 ms active envelope is only an initial tuning candidate for capture-based iteration, not an Architecture constant or a lifecycle, acknowledgement, retention, state, or correctness deadline.

## Transition-illusion stacking contract

The existing canvas is behind ordinary DOM content. Normal-motion Activation must temporarily give that same pointer-transparent canvas enough visual stacking priority to occlude coverable Expanded material, then reveal the already-authoritative UI as shader alpha dissipates. This is one fixed composition rule on the existing Surface, not a layer framework.

Coverable during the bounded takeover:

- the Download arc/material and ordinary central progress/status text;
- Folder success visual;
- drag glow, queue/background decoration, and other non-interactive Expanded material.

Protected above the canvas and always visibly operable:

- primary cancel and window hide/close controls;
- queue badge/popover plus quality/cancel controls;
- runtime indicator;
- terminal/error diagnostic content and diagnostic copy control.

The DOM is never hidden, disabled, removed from accessibility, or used as an animation-completion dependency. `pointer-events: none` lets input reach the authoritative controls even while thermal pixels overlap coverable material. Compile/link failure, context loss, sleep, or disposal leaves the elevated canvas transparent and the already-current DOM visible. Reduced Motion uses the ordinary non-occluding composition and a bounded static semantic state, with no travelling cover or frame loop.

The first version distorts only procedural thermal field coordinates. Thermal alpha occlusion provides the visual takeover; scene-texture sampling, real DOM Lens Distortion, extra passes, and a second renderer remain unnecessary.

## One-pass shader design

Keep the existing fullscreen triangle and transparent blend path. The fragment shader gets only the concrete uniforms it needs: activation phase, normalized origin, personality coefficients, progress target/level, reduced-motion flag, resolution, and named Thermal Palette colors.

### Thermal grammar

- Build a procedural scalar heat field from origin distance, a directed sweep front, edge distance, perimeter coordinate, two opposite-running fronts, closure distance, and short convergence impulse.
- Map the scalar through the canonical palette with smooth thresholds.
- Intake increases ignition radius, turbulence, and a small early UV warp. Folder lowers turbulence and strengthens edge/closure terms.
- Apply any distortion only to procedural field coordinates during early Intake ignition. Do not distort DOM/UI content and do not sample a rendered scene texture.
- Dissipation controls alpha and thermal energy only. It has no external completion effect.

### Circular Progress

Replace the current fullscreen horizontal quantitative field with an SDF circular track and arc in the same fragment pass.

- The angular target mask is the only arc frontier.
- The target/level comes from the existing pure Download projection and runtime interpolation.
- Thermal material is clipped at or behind the frontier. Spatial glow may feather around the arc thickness, but angular energy may not appear ahead of the authoritative target.
- A same-trace downward revision snaps the level down before drawing. A trace replacement starts from the new trace target and cannot reuse the old level.
- Indeterminate draws a fixed-length non-percent segment. Normal motion may rotate that segment; Reduced Motion holds a fixed segment and uses the existing non-percent textual status.
- No Progress mode uses lens distortion or chromatic dispersion.

The existing generic DOM `CircularProgressIndicator` has no trace identity and always CSS-transitions determinate dash offset, so it cannot by itself prove immediate same-trace downward correction or replacement-trace rebasing. Adding a second Download-only DOM/SVG renderer would also leave the Expanded host as a competing graphics authority. Keep the generic indicator for Transcode, foreground processing, and outcome loading. For the primary Download path, remove its SVG arc so the trace-aware WebGL arc is the only circular quantitative frontier; retain compact DOM text/status/cancel affordances. Ordinary progress/status text is coverable during normal-motion Activation, while essential cancel and window controls use the protected stacking contract above. This avoids two competing Download rings without broadening MR9 into a Transcode redesign.

## Paper Shaders decision

The reviewed package is `@paper-design/shaders@0.0.80`, Apache-2.0, with `LICENSE` and `NOTICE` stating “Paper Shaders, Copyright 2026 Paper” and the project URL.

- Heatmap is image/mask driven. It preprocesses a source into contour/large-blur/inner-blur channels, samples a texture, generates animated shadow shapes, and maps heat through up to ten colors. Its useful ideas are the scalar heat field, contour/inner/outer energy separation, small noise, and named gradient stops. Its image preprocessing, Apple-specific procedural shapes, `ShaderMount`, and texture contract do not fit Ameow's procedural transparent host.
- Lens Distortion is an image post-process with a sampler, bulge/spread/swirl/dispersion controls, and up to 50 texture samples. Direct reuse would require a scene texture or extra pass and is too expensive and structurally wrong for the current one-pass decorative host.

Recommendation: implement equivalent Ameow-specific GLSL from first principles inside the current fragment program. Do not add either Paper package. If implementation later copies any source expression or substantial shader block, stop and add the Apache-2.0 license, NOTICE attribution, and prominent modification notice before shipping.

## Canonical Thermal Palette

One shader-material palette is used on the existing dark/neutral scene:

| Role | Candidate | Use |
| --- | --- | --- |
| `thermalVoid` | `#201E25` | existing dark-neutral surface convergence |
| `thermalDeep` | `#5A2330` | low energy, captured edges, late decay |
| `thermalEmber` | `#C9443A` | stable thermal body |
| `thermalFlare` | `#FF7447` | sweep/front energy |
| `thermalGold` | `#FFC45C` | hot accent and closure punctuation |
| `thermalCore` | `#FFE8C8` | ignition core, used sparingly |

These become named Presentation tokens in one module. Personalities vary geometry and energy, not colors. The transparent shader composes over Ameow's existing `#201E25` / `#2B2A31` surfaces. White/light adaptation is deferred and must not silently remap this palette in MR9.

## Reduced Motion mapping

| Semantic | Reduced Motion visual |
| --- | --- |
| Intake | bounded local-or-center ignition blot plus captured halo; no travelling sweep, chase, turbulence animation, or distortion |
| Folder | simultaneous stable edge lock plus short warm closure state; no perimeter travel |
| Future meaningful completion | simultaneous low-energy resolve state decaying toward `thermalDeep/thermalVoid`; unavailable until authority exists |
| Determinate Progress | immediate authoritative arc level with static low-intensity material |
| Indeterminate Progress | fixed non-percent arc segment and textual non-percent state; no rotation |

Reduced Motion distinction comes from geometry and energy distribution, not color substitution.

## Failure and compatibility boundaries

- WebGL2 unavailable, shader compile/link failure, context loss, or draw failure fails closed to existing DOM Product UI. It cannot change lifecycle or Download facts.
- Shell transition completion never waits for the renderer.
- Canvas stays `pointer-events: none`, transparent, DPR-capped, and owned by `MainWindowPresentationSurface`.
- Normal-motion Activation may temporarily elevate that canvas above explicitly coverable DOM material; essential controls and terminal/error diagnostics remain protected above it. Reduced Motion remains non-occluding.
- Compact Mascot imports no activation state, and activation state imports no mascot/pointer-attention state.
- No old `.cindy-worktrees/auto-o3p8cr` M3 shader/runtime code is a source.

## Architecture gaps and implementation gates

1. Meaningful Session Completion fact is absent. Completion FX is blocked.
2. MR9 must first land and prove the `acceptedTraceId`-paired transient origin sidecar before local drop/paste Intake FX. If same-emission pairing cannot be guaranteed across the current command/runtime/detail path, split that contract as a reviewed prerequisite and block local Intake rather than falling back silently.
3. Root `main` is not the implementation baseline. Starting from it would regress MR8.
