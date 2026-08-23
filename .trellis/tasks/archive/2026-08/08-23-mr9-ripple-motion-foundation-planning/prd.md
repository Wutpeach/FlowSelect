# MR9 Ripple Motion Foundation Planning

## Goal

Produce an upstream-grounded and repository-grounded architecture plan for evaluating `m1ckc3s/ripple` as Ameow MR9's next motion-foundation candidate. The intended visual is a point-origin circular or cloud-like wavefront that propagates across Ameow's 200 x 200, radius-16 panel and completes when the wavefront reaches the panel boundary.

This task is planning-only. Its output is a reviewable source-fidelity baseline and a bounded Browser Lab prototype plan for GPT Architecture Lead Planning Review, not an implementation.

## Product Baseline

- Preserve Ripple's established radial motion and organic/noise character as the first visual truth.
- Use the user's confirmed Pinch ON official-demo control set as the first control baseline:
  - transition speed: approximately `1.00x`
  - wavelength: approximately `0.15`
  - ripple density: approximately `5`
  - displacement: approximately `0.155`
  - RGB split: approximately `0.0225`
  - glow: approximately `0.37`
  - noise warp: approximately `0.70`
  - easing: strong Ease Out
  - Pinch: `ON`
  - Pinch Strength: approximately `0.14`
- `.14` is the upstream Pinch Strength control, not a blend-strength value.
  The control must not expose, invent, or map any fictional blend-strength
  parameter, no-op, or substitute uniform.
- Avoid adaptations that make the final image look excessively liquefied or folded over, or that materially reduce wavefront readability.
- Do not reinterpret the goal as simply reducing noise.

## Requirements

### R1. Source-grounded upstream analysis

- Inspect the actual source of GitHub repository `m1ckc3s/ripple`, not only its README, screenshots, or live-demo description.
- Record the exact upstream commit/revision used by the research and make it the later source-fidelity baseline.
- Document the actual shader, motion, progress, point-origin, easing, rendering/runtime, click/swap semantics, and parameter pipeline.
- Document license and provenance facts and the obligations that would apply to copied or derivative source.
- Preserve the upstream Minsang inspiration credit, derive only from the pinned Mick Cesanek GLSL/WebGL source, and do not copy the Pinterest demo images that upstream marks as demonstration-only.

### R2. Ameow authority and architecture fit

- Explain how Ripple visual execution can fit the existing Ameow Presentation/transition framework.
- Ameow must remain authoritative for when a transition starts, completes, reverses, or is cancelled.
- Ripple demo click, swap, or product-state semantics must not become Ameow authority.
- Classify upstream responsibilities as suitable for direct reuse, derivative work, or an Ameow-owned adapter.
- Identify the minimum progress/origin/rendering contract without creating a general shader/effect framework.

### R3. Isolated Browser Lab source-fidelity control

- Define the minimum scope of a Browser Lab-only control using the real upstream Ripple motion.
- The control viewport is Ameow's 200 x 200 panel with radius 16.
- Propagation begins from a point origin and expands radially until its furthest required panel boundary is covered.
- Use the accepted control values above as the initial baseline.
- Keep Paper and Thermal effects out of the source-fidelity control.
- Keep Production integration out of scope.
- Make Pinch ON / Pinch Strength `.14` the default radial-wavefront lane.
  Keep Pinch OFF only as a clearly labelled pure-wavefront comparison.

### R4. Minimal visual-adaptation order

- First candidate: Color.
- Second candidate: Hot Edge.
- Refraction and Halo are deferred and may be discussed only if later visual evidence shows they are needed.
- Previous Paper/Thermal checkpoints are visual knowledge and reference material, not mandatory code reuse or an effect checklist.
- Existing visual code may be reused, modified, or discarded later according to product evidence; Ripple must not be distorted to preserve the old Thermal implementation.

### R5. Planning report contents

- Architecture fit with Ameow's current motion/presentation framework.
- Direct-reuse, derivative, and adapter responsibility boundaries.
- Ameow-owned control authority.
- Minimum isolated Browser Lab source-fidelity control scope.
- Source-fidelity validation method.
- Main technical and visual risks, including visual review methods.
- License and provenance requirements.
- Exact upstream commit/revision used for research.

## Out of Scope

- Production implementation or Production-file changes.
- An implementation of the Browser Lab control during this task.
- Full Ripple + Thermal integration.
- Paper integration or further Paper source adaptation.
- A generic shader/effect framework or other speculative abstraction.
- A historical edge-entry wave that crosses the panel and exits from the opposite edge.
- A commitment to Refraction or Halo.

## Acceptance Criteria

- [x] The planning artifacts cite the exact inspected Ripple upstream commit/revision and evidence from actual implementation files.
- [x] The report describes the real upstream motion/shader/progress/origin/runtime pipeline and separates visual execution from demo product semantics.
- [x] The report maps Ripple into Ameow's current Presentation/transition authority without transferring start, completion, reverse, or cancellation ownership.
- [x] The minimum Browser Lab control is bounded to a real point-origin Ripple in a 200 x 200/r16 viewport with the accepted parameter baseline and no Paper/Thermal effects.
- [x] Proven baseline values map to exact upstream uniforms/easing, including Pinch ON / Pinch Strength `.14`; no fictional blend-strength control is exposed or mapped.
- [x] The plan defines objective and visual source-fidelity checks, including the panel-boundary completion rule.
- [x] The plan orders later visual adaptation as Color, then Hot Edge, and explicitly defers Refraction/Halo.
- [x] The report identifies license/provenance obligations and the boundary between direct reuse, derivative source, and adapter code.
- [x] The artifacts explicitly prohibit Production integration, premature abstraction, Paper-route restart, and compatibility-driven distortion of Ripple.
- [x] `prd.md`, `design.md`, `implement.md`, and research artifacts are ready for GPT Architecture Lead Planning Review.
- [x] The task remains in `planning`; `task.py start` is not run and no Product code is changed.

## Review Gate

Stop after the planning report is complete and wait for GPT Architecture Lead Planning Review. Review approval in a later turn would still authorize only the explicitly approved next phase.
