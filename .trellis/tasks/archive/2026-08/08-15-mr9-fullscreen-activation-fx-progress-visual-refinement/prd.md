# MR9 Fullscreen Activation FX and Circular Progress Visual Refinement

## Goal

Plan a repository-grounded refinement of Ameow's completed MR0-MR8 Presentation architecture so the one Expanded WebGL2 host can provide short, high-salience activation feedback and restore Circular Download Progress as the primary continuous download visual. The plan must preserve Product, Download, lifecycle, and renderer authority boundaries and must be ready for a later GPT Architecture Lead Planning Architecture Review.

## Baseline

- Source baseline: `motion/presentation-integration` at `4de9c2e` (MR8 implementation, archive, and journal complete).
- Planning artifacts live in this task on root `main`; implementation must branch from the source baseline above, not from root `main` at `5619ba0`.
- MR0-MR8 are closed architecture. MR9 may consume their public facts and extend the one Expanded host, but may not reopen or replace their ownership decisions.

## Requirements

### R1. One concrete Fullscreen Activation FX

- Implement one shared thermal grammar: Origin Ignition, Fast Thermal Sweep, Edge Capture, Dual-front Perimeter Chase, Opposite Closure, short Convergence punctuation, then Dissipation.
- The strongest beat is Origin Ignition. Edge Chase continues momentum; convergence is a short punctuation, not a second climax.
- Fullscreen Activation FX is discrete, bounded feedback. It is not a continuous Progress renderer and must not own a Product, Download, native-window, or lifecycle transition.
- Fullscreen graphics remain in the existing sole `ExpandedPresentationSurface` WebGL2 canvas. No second canvas, alternate renderer, hidden legacy renderer, React shader runtime, scene/layer system, scheduler, reveal queue, priority bus, or generic Motion framework may be introduced.
- Compact Mascot and Fullscreen Activation FX remain visually, causally, and lifecycle independent.

### R2. Opportunity personalities and origins

- Intake uses Ignite / Capture: strongest ignition and the largest, still-bounded distortion punctuation.
- Folder Confirmation uses Anchor / Lock: lower turbulence, steadier sweep, stronger closure/lock.
- Meaningful Session Completion uses Resolve / Release: smoothest motion, least turbulence, and thermal cool-down/decay.
- All personalities use the same palette and thermal grammar; geometry, timing, turbulence, and dissipation distinguish them, not recoloring.
- A reliably causal, normalized local interaction point is used when the event originates from a meaningful interaction inside the full surface. Events without reliable local position, including Browser Extension intake, use neutral viewport center.
- If repository facts cannot prove a local origin, the plan must choose center rather than infer from current/last pointer position.
- MR9 adds one minimum causal-origin contract for fullscreen local submissions. URL drop synchronously captures its normalized drop point. Paste synchronously snapshots the current normalized pointer only when that pointer is valid and inside the fullscreen surface at paste submission; otherwise paste uses center. The immutable optional origin travels as transient command/acceptance metadata and is published only beside the same one-shot `acceptedTraceId` whose pre/post reduction proves new membership. Browser Extension and every unproven origin use center. The origin never enters Download task state, durable queue state, `RawDownloadInput`, progress, tombstones, or acknowledgement correlation.

### R3. Session Completion authority gate

- Meaningful Session Completion must not be inferred from arbitrary `activeDownloads === 0`, visible queue count zero, or one task's terminal event.
- Reuse an existing authoritative session/group completion fact if one exists.
- If no such fact exists, record an architecture gap and keep Session Completion FX out of implementation scope until Product/Application supplies the fact. MR9 must not create a second completion truth for visual convenience.
- A single task completion must not trigger Fullscreen Activation FX at Intake/Folder/meaningful-session salience.
- Preserve MR4's per-terminal classification, bounded Presentation retention, diagnostic semantics, stale invalidation, and lifecycle boundary, but remove single-task Terminal from the Expanded fullscreen target, policy, and shader recipes. Its remaining feedback is restrained semantic DOM outcome/diagnostic UI, not another same-salience fullscreen effect.

### R4. Circular Download Progress

- Circular Download Progress is the primary continuous download visual.
- Exactly one circular arc is the quantitative frontier. Thermal glow, shimmer, and internal flow are low-intensity material accents and may not imply progress beyond the authoritative target.
- Same-trace downward target revisions apply immediately. Replacement traces do not inherit the old trace's quantitative state.
- Indeterminate state uses no fake percentage or synthetic determinate frontier.
- Download Progress does not continuously use obvious lens distortion or chromatic separation.
- Existing Transcode and foreground-task progress semantics remain outside the Download-specific quantitative refactor unless a shared component adjustment is strictly required.

### R5. Transition illusion

- FX may visually bridge an already-authoritative state change, including briefly occluding coverable Expanded visuals and then dissipating to reveal the already-current UI. Shader completion never gates real UI visibility, Product state, Download state, native-window state, lifecycle state, timers, acknowledgement, or correctness.
- The sole pointer-transparent canvas may temporarily stack above coverable decoration/read-only central material during normal-motion Activation. Essential controls and terminal/error diagnostics remain visually protected and operable above it; DOM semantics are never hidden or disabled for the effect.
- The first version may use thermal alpha occlusion plus distortion of the procedural shader field. It does not require scene-texture sampling, real DOM distortion, another pass, or another renderer.
- Renderer-local animation phase is reconstructible and disposable. Context loss, shader compilation failure, unmount, sleep, or reduced motion may remove the effect without changing real behavior.

### R6. Reduced Motion

- Preserve distinct Intake, Folder, and eventual Completion semantic shapes.
- Remove fullscreen travel, perimeter chase, and obvious distortion.
- Use bounded low-motion thermal state changes. Reduced Motion must not create an unbounded animation loop.

### R7. Canonical Thermal Palette

- Establish one named Thermal Palette and validate it first on the existing dark/neutral Ameow surface.
- Light/white theme material adaptation is deferred. MR9 must not create parallel light/dark shader palettes.
- Palette values are presentation tokens, not component-local anonymous colors.

### R8. Paper Shaders reference and licensing

- Evaluate Paper Shaders Heatmap and Lens Distortion against the existing direct WebGL2 host.
- Prefer the least coupled route that preserves the visual grammar: equivalent GLSL or a minimal, documented source adaptation inside the existing shader program.
- Do not install or mount `@paper-design/shaders-react` or a Paper `ShaderMount` runtime.
- Any copied or modified Apache-2.0 source must preserve the license/NOTICE obligations and mark modifications. Pure algorithmic/visual inspiration must not be represented as copied source.

### R9. Documentation and validation

- Later implementation must update relevant Chinese and English public docs in `site/src/content/docs/` because user-visible feedback and progress behavior change.
- Validation must cover causal origin sidecar pairing/rejection; URL-drop local origin; paste with valid paste-time in-surface pointer versus paste without one; delayed acceptance after pointer movement; Browser Extension center; rejected/non-new membership producing no Intake; advanced-quality no-reignite; absence of Terminal fullscreen recipes; pure projection/policy; protected-control stacking; runtime replacement/downward/reduced-motion rules; one-host composition; WebGL failure isolation; deterministic visual capture; performance/idle scheduling; and the authoritative semantic gates.

## Acceptance Criteria

- [x] Planning report identifies the exact current source baseline and the one-host composition/data flow with file anchors.
- [x] Planning report classifies Intake, Folder Confirmation, and meaningful Session Completion sources as sufficient, insufficient, or gated, without inventing authority.
- [x] Planning report gives a concrete single-host target/runtime/shader extension and priority policy.
- [x] Planning report defines the minimum `acceptedTraceId`-paired transient origin contract for fullscreen URL drop and paste-time proven in-surface pointer, with center fallback for paste without a valid pointer, Browser Extension, and all unproven cases.
- [x] Planning report removes single-task Terminal from Expanded fullscreen targets/recipes while preserving MR4 semantic and diagnostic contracts in restrained DOM feedback.
- [x] Planning report defines bounded thermal occlusion, coverable visuals, protected controls, fail-closed behavior, and Reduced Motion without adding a layer system or second renderer.
- [x] Planning report establishes a single dark-neutral Thermal Palette and geometry/timing differences for the three personalities.
- [x] Planning report explains the recommended Heatmap/Lens Distortion reuse route and Apache-2.0 obligations.
- [x] Planning report makes one circular arc the sole quantitative frontier and preserves downward revision, trace replacement, and indeterminate honesty.
- [x] Planning report proves transition illusion cannot gate Product, Download, window, or lifecycle correctness.
- [x] Planning report defines Reduced Motion semantics with no travel/chase/obvious distortion and no unbounded loop.
- [x] `design.md`, `implement.md`, research report, and real `implement.jsonl`/`check.jsonl` entries are complete.
- [x] The final report explicitly stops before `task.py start`, implementation, and Architecture PASS.

## Out of Scope

- Product code implementation or task activation.
- Compact Mascot refinement or coupling.
- Light/white theme shader adaptation.
- New Presentation features beyond Intake, Folder Confirmation, meaningful Session Completion, and Download progress.
- Redesign of Product/Download domain semantics except reporting a proven MR9 blocker.
- Rework of MR0-MR8 closed architecture.

## Blocking Open Questions

None for planning. Repository gaps remain explicit implementation gates rather than user questions.
