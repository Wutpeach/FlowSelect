# MR9 Revised Repository-Grounded Planning Report

## Review disposition

**Planning is ready for GPT Architecture Lead review. No Architecture PASS is granted. No implementation is authorized.**

The task remains `planning`. This report stops before `task.py start` and before product code edits.

This revision applies only the requested Architecture repair deltas: proven fullscreen URL-drop and paste-time in-surface Intake origins use the same-acceptance sidecar; single-task Terminal leaves the Expanded fullscreen renderer while retaining MR4 DOM semantics; and normal-motion Activation becomes a bounded thermal occlusion over coverable UI with a fixed protected-control set. All previously approved MR9 directions remain unchanged.

## Executive conclusion

MR9 fits the completed MR0-MR8 architecture without a second renderer or motion framework. The existing one `ExpandedPresentationSurface`, one WebGL2 canvas/program, and one consumer-local runtime can draw both a clean circular Download arc and a short fullscreen thermal activation in one pass. Pure Presentation policy must resolve the one target before it reaches the host.

Two of the three requested opportunities are usable now:

| Opportunity | Existing authority | Planning conclusion |
| --- | --- | --- |
| Intake | transient Application/runtime-authored `acceptedTraceId`, reduced synchronously into one bounded MR8 opportunity; fullscreen drop has a causal event point and paste can snapshot a currently valid in-surface Pointer Field value at submission | sufficient with one minimal same-emission origin sidecar: local URL drop and paste-time proven pointer use their captured point; paste without one, Extension, and unproven sources use center |
| Folder Confirmation | successful persisted output-path change creates bounded `folder-outcome-visible` with unique `requestId`; React drop event has local coordinates | sufficient for success-only Anchor / Lock |
| Meaningful Session Completion | no session/group/batch identity or typed group-completion transition in Download/Application/protocol | architecture gap; do not implement or infer from zero active/visible downloads |

The recommended shader route is Ameow-specific equivalent GLSL. Paper Shaders Heatmap provides useful thermal field and palette ideas but assumes a preprocessed image texture. Lens Distortion is an image post-process with up to 50 samples. Mounting either runtime would violate the one-host boundary or add unnecessary GPU/dependency cost.

## Repository baseline and evidence

The current root `main` is `5619ba0` and does not contain MR8. The authoritative completed motion line is the clean worktree `D:/Ameow/.cindy-worktrees/motion-integration`, branch `motion/presentation-integration`, HEAD `4de9c2e`:

```text
4de9c2e chore: record journal
4c43c08 chore(task): archive 08-14-mr8-download-intake-reveal-planning
3a3aeb3 feat(presentation): add download intake reveal
48987f7 refactor(presentation): replace expanded dot field substrate
710fe5e fix(presentation): close MR6 native lifecycle correctness
```

Future implementation must branch from this integration line. Using root `main` would silently plan against pre-MR8 code.

### Current one-host substrate

- `src/presentation/main-window/expandedPresentationTargets.ts:1` defines the single semantic input union.
- `expandedPresentationPolicy.ts:8` resolves priority before the renderer.
- `App.tsx:499-503` creates the pure Download Progress target.
- `App.tsx:565-572` composes terminal, Intake, and Progress facts.
- `MainWindowPresentationSurface.tsx:615-620` makes full-and-settled lifecycle state a read-only graphics eligibility fact.
- `MainWindowPresentationSurface.tsx:1104-1113` mounts exactly one `ExpandedPresentationSurface`.
- `ExpandedPresentationSurface.tsx:10` caps DPR at 2; its `createGraphicsRenderer` requests one WebGL2 context and compiles one fragment program; `ExpandedPresentationSurface.tsx:336-339` injects the existing rAF runtime.
- `expandedPresentationRuntime.ts:97` owns only reconstructible interpolation/scheduling. It does not own semantic priority or Product state.

This substrate already supplies the required resource, context-loss, resize, transparent blending, and fail-closed behavior. MR9 should extend it in place.

## Opportunity mapping

### Intake: Ignite / Capture

Authoritative flow:

```text
new runtime membership
  -> video-queue-detail { tasks, acceptedTraceId }
  -> Download client validation
  -> DownloadQueueController reduction
  -> one Intake transition after membership is proven
  -> latest-only DownloadIntakePresentationOpportunity
  -> pure Expanded target
```

Evidence:

- `src/electron-runtime/service.ts:583-593` passes the new trace as the transient cause.
- `service.ts:957-964` attaches it only to that emitted queue-detail snapshot.
- `src/utils/downloadViewHelpers.ts:282-289` retains it only when it is a non-empty trace present in the snapshot.
- `src/presentation/main-window/downloadIntakePresentation.ts:14-24` defines one bounded opportunity with generation identity.

This is reliable for renderer-origin and Browser Extension intake. It is not a replayable durable queue field.

The published cause currently contains no coordinate/transport discriminator, but the full-surface drop handler owns the causal `clientX/Y` synchronously before awaiting App work (`MainWindowPresentationSurface.tsx:864-877`). The URL-drop branches later enqueue at `App.tsx:2120-2126`, `2215-2222`, and `2292-2296`; async resolver paths are safe only when the point is snapshotted before their first await.

Paste currently enters App through the synchronous window paste boundary before `handlePaste` awaits resolution (`App.tsx:1782-1790`, `1906-1914`). The Surface already owns both the live Pointer Field and the current `pointerInside` fact (`MainWindowPresentationSurface.tsx:511-545`); pointer leave resets the field to center (`pointerField.ts:88-99`). A narrow Surface paste-submission callback can therefore snapshot a local origin only when `pointerInside` is true at that exact boundary, then pass clipboard data plus the immutable optional origin to App. It does not lift continuous pointer state or a historical last pointer into Application state. Browser Extension transport (`electron/downloadWsAdapter.mts:113-119`) has no renderer-local point.

The minimum MR9 contract is an optional transient `acceptedIntakeOrigin` sidecar:

1. finite-check, clamp, and normalize one immutable drop point at the full-surface boundary;
2. for paste, snapshot the current normalized Pointer Field only while the Surface's current `pointerInside` fact is true; otherwise choose center immediately;
3. carry the immutable drop/paste snapshot through the renderer command/IPC adapter separately from `QueueDownloadCommand`, `RawDownloadInput`, task records, and durable queue state;
4. runtime publishes it only on the same queue-detail payload as the new membership's one-shot `acceptedTraceId`;
5. client accepts it only beside that marker, and the controller forwards it only after MR8's absent-before / present-after membership proof;
6. the bounded latest-only Intake opportunity owns it until ordinary replacement, removal, terminal reconciliation, or expiry.

The smallest API shape is an optional `QueueDownloadPresentationCause` argument on renderer/runtime queue calls, containing only `intakeOrigin`. The Surface passes paste clipboard data and the paste-time snapshot to App; `queuePastedDownload` carries the immutable cause across any async selection resolution. The IPC adapter decodes it separately from `decodeQueueDownloadCommand`; `QueueDownloadCommand`, `toRawDownloadInput`, and `RawDownloadInput` remain unchanged. Runtime passes the sidecar separately to the accepted `emitQueueState` call, which adds `acceptedIntakeOrigin` only beside `acceptedTraceId`. Browser Extension omits the cause. Advanced-quality probing emits the pair on its initial marked membership; later option selection emits neither marker nor origin.

`acceptedTraceId` is the correlation identity. No request map, later acknowledgement, timing window, acceptance-time pointer read, historical last pointer, or persistent provenance is needed. Fullscreen URL-drop Intake uses its drop point. Fullscreen paste uses its paste-time pointer only when currently valid and in-surface; otherwise it uses center. Browser Extension, malformed/unpaired metadata, and every source without proven local causality use center. Pointer movement after paste cannot change the immutable snapshot, even when acceptance is delayed. Rejected/non-new membership produces no Intake FX. Advanced-quality continuation on the same trace does not emit a second accepted marker and cannot re-ignite. If the same-emission pairing cannot be proven during implementation, local Intake is blocked and the sidecar must split into a reviewed prerequisite; a proven local submission must not be silently downgraded to center.

### Folder Confirmation: Anchor / Lock

Authoritative flow:

```text
full-surface drop event (local point)
  -> native folder resolution
  -> saveOutputPath succeeds
  -> showFolderOutcome success
  -> folder-outcome-visible { requestId, bounded duration, origin }
  -> pure success-only activation projection
```

Evidence:

- `App.tsx:839` owns the existing bounded Folder success presentation.
- `App.tsx:1955-1963` shows it only after output-path persistence succeeds.
- `src/utils/centerOverlayState.ts` owns unique request identity and current status/lifetime as Presentation state.

This is sufficient. Folder error remains existing error feedback and does not trigger the high-salience lock effect.

### Meaningful Session Completion: Resolve / Release

The Download feature has task traces and a current queue snapshot, not a meaningful session/group:

- `src/features/download/model.ts:70-79` has `tasksById`, `order`, progress, intent, and tombstones only.
- `useDownloadQueue.ts:42-43` exposes per-terminal listeners.
- `useDownloadQueue.ts:236-238` supplies an exact post-reduction queue snapshot for terminal presentation decisions.
- Canonical `DownloadTerminalOutcome`, queue detail, and Application command/result types have no group/session/batch ID.

The exact snapshot is intentionally sufficient for MR4's foreground single-terminal classification, but it cannot answer whether an arbitrary empty queue represents a meaningful user session. Presentation-side “busy period” or “seen intake since empty” state would create a second semantic truth.

**Architecture gap:** a future Product/Application contract must define meaningful group identity and publish a typed group completion. Until then MR9 implements no Resolve / Release trigger. The visual personality is documented but gated.

### Single-task Terminal: semantic outcome remains, fullscreen recipe is retired

MR4's exact post-reduction classification remains the authority for one terminal outcome. Its typed status, diagnostic payload, duplicate idempotence, bounded request-id retention, stale/new-primary invalidation, and lifecycle independence remain unchanged (`useDownloadQueue.ts:223-239`, `downloadTerminalProjection.ts:62-98`, `App.tsx:1375-1417`).

The current Expanded host path is removed rather than visually softened: App stops projecting terminal into the host, `terminal` leaves `expandedPresentationTargets.ts` and `expandedPresentationPolicy.ts`, and the fragment program drops terminal modes. The DOM outcome/diagnostic path remains as restrained, bounded semantic feedback, including diagnostic copy; it remains available when WebGL fails. A single task terminal never selects, wakes, or draws a fullscreen thermal recipe. This does not create meaningful Session Completion.

## Circular Progress re-entry

The repository currently has two Download progress visuals:

1. MR3's Expanded shader uses a horizontal determinate fill/indeterminate band.
2. `App.tsx:3639` renders a 48px SVG `CircularProgressIndicator` for the current primary task.

The latter is already visually circular, but its API has no trace identity and its determinate dash offset always uses a CSS transition. It cannot independently enforce immediate downward revision or replacement-trace rebasing. Leaving it plus the Expanded quantitative field creates competing frontiers, and adding another Download-only SVG renderer would create another graphics authority. MR9 should make the trace-aware one WebGL host draw the sole Download arc, while the DOM keeps percentage/stage/status/cancel affordances. Other `CircularProgressIndicator` uses for Transcode, task processing, and outcome loading remain unchanged.

Authoritative semantics already exist:

- `downloadProgressProjection.ts` maps only the current primary Download to idle, indeterminate, or determinate `[0,1]`.
- `expandedPresentationRuntime.ts` applies a same-trace downward revision immediately and resets replacement traces.
- Indeterminate is explicit and has no percentage target.

The new shader ring must preserve these contracts. Thermal accent is material behind the angular mask, not another progress estimate.

## Fullscreen Activation grammar in the current host

One concrete `activation` union variant is enough. It carries `opportunityId`, Presentation monotonic `startedAt`, personality, proven-or-center origin, and optional current Download Progress underlay. The runtime derives phase from current time minus `startedAt`; ineligible or sleeping time cannot pause/replay ignition. The shader derives all seven visual beats procedurally.

The effect is a transition illusion:

- UI/Product/lifecycle facts change first.
- The renderer receives a read-only target after policy resolution.
- It never calls back on completion.
- Dissipation only stops pixels/rAF work.
- Shader failure may remove all FX without delaying or reversing real state.

It is also a bounded visual takeover, not permanent background decoration. During normal-motion Activation, the existing pointer-transparent canvas may temporarily stack above coverable central/read-only material: Download arc/material, ordinary progress/status text, Folder success visual, drag glow, and non-interactive background decoration. Primary cancel, hide/close, queue/quality/cancel controls, runtime indicator, and terminal/error diagnostics remain in a fixed protected set above the canvas. The DOM stays mounted, accessible, and enabled; compile/context/runtime failure leaves the canvas transparent and the authoritative DOM visible. Reduced Motion keeps ordinary non-occluding stacking and a bounded static semantic state.

Thermal alpha occlusion plus distortion of procedural shader-field coordinates is sufficient for the first-version illusion. Scene-texture sampling, real DOM distortion, another pass, and another renderer are not required.

The frozen timing direction is medium-fast with roughly one second of perceived feedback. A 600-750 ms active envelope is only an initial capture-tuning candidate, never an Architecture constant or lifecycle/acknowledgement/retention/correctness deadline.

Recommended personality mapping:

| Dimension | Intake | Folder | Future completion |
| --- | --- | --- | --- |
| Ignition | largest/brightest | firm, smaller | soft |
| Sweep | fastest, highest turbulence | stable | smoothest |
| Distortion | brief early UV warp | negligible | none |
| Edge/closure | capture then chase | stronger lock/closure | resolve then release |
| Dissipation | quick | short locked afterglow | slowest thermal cool-down |
| Palette | canonical thermal | same | same |

No personality is a recolor.

## Paper Shaders utilization and license

Package evidence gathered on 2026-08-15:

- npm package: `@paper-design/shaders@0.0.80`
- license: Apache-2.0
- NOTICE: “Paper Shaders, Copyright 2026 Paper”, `https://shaders.paper.design`
- source project banner: `https://github.com/paper-design/shaders`

Heatmap's reusable ideas are scalar heat, inner/outer/contour separation, subtle procedural noise, and palette mapping. Its concrete implementation depends on an input sampler and preprocessed texture channels and includes source-specific procedural shapes. Lens Distortion samples an input image many times for spread/dispersion and includes bulge/swirl/noise controls.

The repository has no need for Paper's `ShaderMount`, React wrapper, preprocessing canvas, scene texture, or second pass. Equivalent one-pass GLSL is the smallest architecture-correct route. Source adaptation remains legally possible but would require Apache-2.0 license distribution, NOTICE retention, and prominent modification notices. The plan does not authorize silent copying.

## Thermal Palette and baseline

The first canonical palette is:

```text
thermalVoid  #201E25
thermalDeep  #5A2330
thermalEmber #C9443A
thermalFlare #FF7447
thermalGold  #FFC45C
thermalCore  #FFE8C8
```

It is validated over the current dark-neutral Ameow surfaces. Personalities share it. White/light material adaptation is deferred and no second palette enters MR9.

## Reduced Motion

Reduced Motion is semantic, not a global off switch:

- Intake: one bounded ignition/capture state at proven origin or center.
- Folder: simultaneous stable edge lock/closure state.
- Future completion: simultaneous low-energy resolve/cool state, still gated by missing authority.
- Determinate Progress: immediate static authoritative arc.
- Indeterminate Progress: fixed non-percent segment.

There is no travelling sweep, perimeter chase, obvious distortion, chromatic separation, or unbounded rAF loop.

## Main risks

1. **Wrong baseline:** root `main` is older than MR8. Implementation must branch from `motion/presentation-integration`.
2. **Origin causality:** a local point is valid only when the transient sidecar rides the same `acceptedTraceId` emission and survives the existing membership proof. Block/split if that cannot be guaranteed; never use pointer, timing, or acknowledgement heuristics.
3. **Fake completion:** queue empty is not meaningful session completion. Keep the mode out until authority exists.
4. **Dual progress authority:** retire the Download SVG arc when the WebGL circle becomes authoritative; keep non-Download uses.
5. **GPU overreach:** direct Lens Distortion or Heatmap texture reuse would add passes/samples/resources. Use procedural one-pass math.
6. **Reduced Motion drift:** assert static mapping and zero-loop scheduling.
7. **Effect hides essential UI:** thermal occlusion may cover only the fixed coverable set; keep essential controls and terminal/error diagnostics visibly protected and operable above the pointer-transparent canvas.

## Validation strategy

- Pure unit tests for same-emission Intake sidecar pairing/rejection, URL-drop local origin, paste with and without a valid in-surface pointer, delayed acceptance after pointer movement, Browser Extension center, rejected/non-new membership, no acceptance-time pointer sampling, advanced-quality no-reignite, source projections, policy priority, Terminal absence from Expanded targets, no-completion negative contract, Folder-local/center origin rules, trace replacement, downward revision, indeterminate honesty, and Reduced Motion.
- Runtime fake-clock tests for phase stops, latest replacement, no ineligible/sleep replay, one pending frame, dissipation stop, sleep/wake/dispose, and absence of completion callbacks.
- Composition/source tests for one host/canvas/program and no Paper React/runtime dependency.
- Deterministic Windows Electron/WebGL pixel probes and screenshots for local URL-drop Intake, paste with valid paste-time pointer, paste-without-pointer center fallback, Browser Extension center, all available personalities/arc states, thermal occlusion, protected-control operability, restrained terminal DOM outcome, Reduced Motion non-occlusion, context loss, DPR/resize, and no angular glow ahead of Progress.
- `npm run type-check`, `npm run lint`, `npm test`, `npm run build`, and `npm run docs:build`.
- macOS transparent-window/WebGL validation before release when a host is available; otherwise explicitly retained debt.

## Planned implementation scope

In scope after Architecture Lead approval:

- Intake and Folder activation opportunities only, including the minimal transient same-emission origin sidecar for local URL drop and paste-time proven in-surface pointer.
- Removal of single-task Terminal from Expanded target/policy/shader while retaining restrained MR4 DOM semantics and diagnostics.
- One concrete activation target and runtime phase.
- One canonical dark-neutral Thermal Palette.
- One-pass thermal grammar and light early Intake UV warp.
- WebGL circular Download arc plus DOM progress text/status/cancel controls.
- Reduced Motion static/bounded mappings.
- focused tests, Windows visual harness, and paired public docs updates.

Blocked or deferred:

- meaningful Session Completion trigger and renderer mode;
- Compact Mascot work;
- white/light shader adaptation;
- Paper runtime/dependency;
- new generic Presentation infrastructure;
- new Presentation feature families.

## Stop condition

Planning artifacts are complete for review. The task stays in `planning`. Do not implement, do not run `task.py start`, and do not grant Architecture PASS. Wait for GPT Architecture Lead Planning Architecture Review.
