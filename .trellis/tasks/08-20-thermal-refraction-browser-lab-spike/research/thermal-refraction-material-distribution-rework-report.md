# Thermal Refraction Material Distribution Rework Report

**Date:** 2026-08-21  
**Status:** rework, matched evidence, and validation complete; stopped before GPT Architecture Lead Review  
**Authoritative worktree:** `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`

## 1. Architecture Decision

The previous trailing-residual repair was visually rejected. This round formally reopened only the Lab-only Refraction material/temperature spatial distribution.

Still locked:

- travelling diagonal motion, field entry/progression/exit, and timing;
- rounded-boundary contact;
- finite-difference Refraction direction, causality, envelope, and strength;
- Refraction-off accepted production baseline;
- Reduced Motion pinned behavior;
- one surface, canvas, WebGL2 program, draw, and runtime.

## 2. Material distribution rework

The rejected fast-decaying `body2/heat2/coolLift2/hotLift2/trailing` chain was removed from the Refraction gate. The displaced sample now uses one broad depth ramp and one broad low-frequency structure term:

```glsl
float behind2 = max(-d2, 0.0);
float warm2 = exp(-abs(d2 + 0.018) * 30.0);
float covered2 = 1.0 - smoothstep(0.0, 0.05, d2);
float depthT = 1.0 - smoothstep(0.0, 1.5, behind2);
float structure = bend * 9.0 + along2 * 0.08;
float material2 = clamp(
  mix(0.05, 0.90, depthT) + structure * 0.26,
  0.0,
  1.0
) * covered2;
```

The `1.5`-unit smoothstep distributes the existing seven-stop palette over a wide part of the swept body instead of compressing it into a frontier stripe. Existing low-frequency `bend` creates broad temperature lobes, while the small `along2` term prevents a perfectly uniform cross-front band. `covered2` keeps the reworked material inside the displaced covered field.

No palette stop, random noise, clock, oscillator, texture, geometry, or second rendering authority was added.

## 3. Frontier and covered-body balance

The resulting spatial reading is:

- edge/contact: hottest orange/red-orange peak and strongest Refraction;
- frontier vicinity: broad yellow/orange dominant region rather than a narrow dividing stripe;
- developed swept body: wide mixed yellow/cyan/vivid-blue field with low-frequency warm structures;
- deep swept body: blue-dominant but still connected to the mixed-temperature gradient.

Refraction parameters remain unchanged:

```glsl
const float REFRACTION_EPS = 0.02;
const float REFRACTION_STRENGTH = 0.16;
float env = clamp(contact + warm * 0.60 + bodyFloor * 0.30, 0.0, 1.0) * energy;
```

The richer material is therefore the new visual carrier. The repair does not obtain visibility by increasing displacement.

## 4. Matched evidence

Primary sheets:

- `research/thermal-refraction-material-distribution-repair/before-vs-repair.png` compares the rejected trailing-residual version with this rework;
- `research/thermal-refraction-material-distribution-repair/baseline-vs-refraction.png` compares the accepted Refraction-off baseline with this rework.

Direct matched frames are stored under `research/thermal-refraction-material-distribution-repair/evidence/` for:

- early frontier (`k = 0.10`);
- developed (`k = 0.25`);
- developed later (`k = 0.35`);
- late sweep (`k = 0.50`);
- Reduced Motion (`k = 0.42`, `uTime = 0`).

Moving pairs use exactly matched pinned time. Capture readout records one canvas, one linked program, expected Refraction uniform state, no bound texture, and no framebuffer.

## 5. Cindy Lead visual judgment

**Answer: yes. The direct frames have changed from `blue body + warm frontier` into an entire-covered-region multi-temperature thermal field. Visual PASS for this bounded Material Distribution Rework.**

In developed, developed-later, and late-sweep captures, the former broad uniform blue fill is replaced by a continuous hot/warm to mixed to cool gradient across the covered surface. Yellow and orange extend visibly behind the contact/frontier, cyan and vivid blue occupy the mixed/deep field, and localized orange/red-orange remains concentrated around hotter parts without becoming a uniform hot slab.

The transition is broad and smooth. It does not read as a hard temperature band, high-frequency plasma/lava texture, decorative neon, inset geometry, or UI frame. Refraction is directly easier to perceive across the active field because the displaced material now contains visible tonal/color structure; this conclusion does not depend on the amplified difference column.

## 6. Baseline and architecture preservation

- Motion grammar, sweep trajectory, contact formulas, and timing are unchanged.
- Refraction finite-difference direction, displacement, envelope, and strength are unchanged.
- Refraction-off accepted baseline path and existing seven-stop palette are unchanged.
- Reduced Motion remains a static pinned snapshot and schedules no continuing frame authority.
- One `ExpandedPresentationSurface`, canvas, WebGL2 renderer/program, draw, and renderer-local runtime remain.
- No texture, sampler, framebuffer, multipass, second renderer/runtime, lifecycle, production integration, Perimeter Chase, Opposite Closure, Mask, or Noise Dissolve was added.

## 7. Validation

- Focused suite: **4 files / 70 tests passed**.
- `npm run type-check`: **pass**.
- `npm run lint -- --quiet`: **pass**.
- `git diff --check`: **pass**, with existing LF-to-CRLF conversion warnings only.
- Full suite: **199 / 200 files passed; 1772 / 1773 tests passed**.
- The sole failure remains the pre-existing `browser-extension/architecture-guard.test.js:277` source-shape assertion. No browser-extension file was changed.
- Capture console output contained only the pre-existing React `borderColor`/`border` shorthand warning; no shader compile, link, or WebGL resource error occurred.

## 8. Execution channels and stop condition

- Orca Worker `develop`: two-file material distribution implementation and focused validation.
- Cindy Lead: Architecture Decision task update, simplification review, matched captures, visual judgment, full validation, and report.

No timing tuning, production integration, commit, Trellis archive, or further visual iteration was performed. Await GPT Architecture Lead Review.
