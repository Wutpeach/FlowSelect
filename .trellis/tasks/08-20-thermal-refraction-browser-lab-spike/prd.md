# Thermal Refraction Browser Lab Spike

## Goal

Prototype a bounded Browser Lab-only Thermal Refraction / Heat Haze effect on top of the accepted MR9 Thermal FX baseline. The visible result should resemble soft local air refraction around real heat: clearly caused by the travelling thermal field, perceptible but subordinate to the Thermal material itself.

## Background and Confirmed Facts

- The authoritative accepted baseline is the clean MR9 checkpoint on `motion/mr9-fullscreen-activation-fx`: work commit `e01be01`, Trellis archive commit `a846c64`, and journal checkpoint `d4a5aea`.
- The accepted baseline is implemented in the one `ExpandedPresentationSurface` canvas and one WebGL2 fragment program. The analytic `heatmapOutput` owns the travelling field, palette, material, and rounded-boundary edge capture.
- The locked motion/contact signals are `k`, `front`, `bendTime`, `d`, `body`, `warm`, `core`, `energy`, `boundaryBand`, and `capture`. Existing tests source-assert their formulas and constants.
- The Browser Lab already exposes moving and Reduced Motion heatmap presets and a single-canvas WebGL readback/capture path.
- The runtime already schedules frames only for the Lab heatmap flag and renders a static Reduced Motion snapshot with no pending frame loop.
- The accepted baseline has no sampler, texture, framebuffer, preprocessing, or multipass path. This spike evaluates a subtle optical displacement of the analytic Thermal material inside the existing fragment shader.

## Requirements

### Visual Review Override: 2D Material Model Rework (2026-08-21)

The previous distance-based Material Distribution Rework is rejected. The accepted travelling/diagonal motion grammar, field entry/progression/exit, covered-region progression, rounded-boundary contact, Refraction causality/direction, Reduced Motion behavior, and renderer/runtime architecture remain locked. The Lab-only Thermal temperature topology inside Refraction mode is reopened.

Coverage answers only where Thermal FX exists. It must not also define temperature through `behind`, depth, or distance from the frontier. Inside the covered/energy-gated region, a separate broad, smooth, low-frequency 2D temperature field must distribute the existing seven-stop palette across deep blue, vivid blue, cyan, yellow, orange, and localized red-orange structures. Frontier and contact may add warm/hot bias, but neither may remain the source of truth for the covered-region color topology.

### R1. Preserve the accepted baseline

- Keep all accepted Thermal motion/contact formulas and constants unchanged.
- Keep the accepted seven-stop palette, cool/hot material lifts, grain, alpha, and localized edge treatment unchanged when Refraction is disabled.
- Retain the existing moving and Reduced Motion baseline presets as direct comparison controls.

### R2. Add a causal, local heat-haze displacement

- Add a Lab-only Refraction mode inside the existing fragment program.
- Derive its spatial envelope from the existing Thermal field: strongest around the warm frontier, weaker in the cool swept body, and zero when the field energy gate is zero.
- Derive its direction/evolution from the existing low-frequency `heatmapBend` signal and the same `bendTime`; do not add a second clock, phase, oscillator, scheduler, or motion authority.
- Use a small continuous UV displacement and blend it locally into the analytic Thermal material. The result must read as air refraction, not as a drawn wave, ripple, ring, fisheye, zoom, jelly deformation, or full-screen wobble.
- Keep amplitude low enough that the Thermal field remains the primary visual.

### R3. Browser Lab controls and Reduced Motion

- Add moving and Reduced Motion Refraction presets alongside the accepted baseline presets.
- Keep Refraction disabled by default and unavailable to production call sites.
- Reduced Motion must render one static, pinned refraction snapshot and schedule no continuing frames.

### R4. Architecture invariants

- Retain one `ExpandedPresentationSurface`, one canvas, one WebGL2 renderer/program, and one renderer-local runtime.
- Retain one draw call and the current analytic path.
- Add no dependency, canvas, renderer, texture, sampler, framebuffer, preprocessing, generic post-processing framework, scene graph, or multipass architecture.
- Add no Product, Download, lifecycle, queue, policy, or semantic state.

### R5. Evidence and report

- Capture representative matched phases for baseline and Refraction, including early/frontier, developed, late, and Reduced Motion states.
- Produce comparison evidence that makes baseline preservation and the secondary Refraction contribution inspectable.
- Report the reused Thermal signal, spatial/intensity mapping, baseline changes, architecture changes, validation results, and Cindy Lead's preliminary visual judgment.

## Acceptance Criteria

- [x] AC1: The accepted baseline presets remain visually and source-contract equivalent when Refraction is disabled.
- [x] AC2: Moving Refraction captures show soft, continuous local optical displacement around warm/frontier regions and weaker displacement through cool regions.
- [x] AC3: Distortion disappears where `energy` is zero and follows the same field phase and `bendTime` as the Thermal effect.
- [x] AC4: Direct visual inspection finds Refraction perceptible but secondary, with none of the prohibited ripple/wave/wobble/jelly/fisheye/high-frequency artifacts.
- [x] AC5: Reduced Motion produces a static pinned frame and the runtime has zero continuing animation authority.
- [x] AC6: Tests prove one canvas, one program, one draw, no texture/sampler/framebuffer/multipass, and no production integration.
- [x] AC7: Type-check, lint, focused tests, full tests, and `git diff --check` do not regress from the accepted baseline; the one pre-existing failure is reproduced and documented.
- [x] AC8: Representative PNGs/comparison sheets and an implementation/visual spike report are stored with the task evidence.

### Superseded Material Distribution Rework

The former `behind2` / `depthT` implementation and its MDR1-MDR5 claims are rejected by Visual Review. They are not acceptance evidence for this task.

### 2D Material Model Rework Acceptance

- [x] MMR1: Developed, developed-later, and late-sweep direct captures no longer show a visible warm-frontier / blue-body division.
- [x] MMR2: Yellow, orange, and localized red-orange coexist with blue/cyan in broad, smooth 2D structures throughout the covered region.
- [x] MMR3: Temperature topology is not monotonic in `behind`, depth, or distance from the frontier.
- [x] MMR4: Frontier and contact remain hotter only as local biases; they do not define the base temperature field.
- [x] MMR5: The 2D structures are large-scale and clean, without noise, plasma, checkerboard, stripes, hard bands, or a hidden sweep-aligned gradient.
- [x] MMR6: Refraction is easier to perceive directly through the richer field without increasing displacement amplitude.
- [x] MMR7: Motion, contact, Reduced Motion, one-canvas/program/draw/runtime, and Lab-only boundaries remain unchanged.

## Out of Scope

- Perimeter Chase, Opposite Closure, Mask / Noise Dissolve, and independent Onset / Exit Expansion.
- Production integration, user documentation, packaging, and release work.
- Final fast-slow-fast timing tuning, production baseline integration, or palette replacement. This round may rework only the Lab-only Refraction material distribution while keeping motion/contact and the existing seven-stop palette.
- A generic refraction/post-processing framework, true backdrop/DOM sampling, new lifecycle semantics, or new renderer authority.
- Committing, integrating, or proceeding beyond the prototype/validation report before GPT Architecture Lead Review.
