# Thermal Refraction / Heat Haze Browser Lab Spike Report

**Date:** 2026-08-20  
**Status:** prototype and validation complete; hard stop before GPT Architecture Lead Review  
**Authoritative worktree:** `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`

## 1. Baseline checkpoint gate

The earlier accepted Thermal motion/material repair was already completed before this implementation:

- accepted work commit: `e01be01 feat(presentation): complete MR9 activation and progress refinement`;
- MR9 Trellis archive: `a846c64`;
- journal checkpoint and implementation base: `d4a5aea`;
- branch/worktree was clean before the Refraction task began.

The current task therefore started directly from the stable checkpoint. No earlier close-out was repeated.

## 2. Implementation

The existing Heatmap Lab preset model now has two derived Refraction variants: moving and Reduced Motion. Both stay in the same Heatmap category/state. A single false-by-default `refraction` prop reaches the existing surface and writes one `uRefractionMode` uniform in the existing fragment program. Production callers never set it.

Inside `heatmapOutput`, the accepted baseline path completes first. Refraction is then gated by `uRefractionMode`:

1. A finite difference of the existing low-frequency `heatmapBend(q, bendTime)` produces the local gradient direction (`REFRACTION_EPS = 0.02`).
2. The existing Thermal scalars produce the envelope:

   `env = clamp(warm * 0.85 + body * 0.12, 0.0, 1.0) * energy`

   Warm/frontier regions are strongest, the cool swept body is weaker, and the displacement is exactly zero when the accepted energy gate is zero.
3. A bounded strength of `0.16` shifts the signed front distance and front-tangent coordinate through a first-order analytic resample. The displaced material is blended back with `env`.
4. The accepted palette, material lifts, yellow transition, inward edge treatment, alpha, and grain are reused for the displaced analytic sample. No visible wave primitive is drawn.

No high-frequency noise field, independent clock, phase, or oscillator was introduced.

## 3. Baseline preservation

- The accepted `k`, `front`, `bendTime`, `DIR`, `d`, `body`, `warm`, `core`, `energy`, rounded boundary, capture, heat sum, palette stops, material lifts, edge treatment, alpha, and grain formulas remain unchanged.
- `uRefractionMode = 0` skips the additive block and retains the accepted baseline path.
- Baseline and Refraction evidence pairs were drawn at the exact same manually pinned `uTime`, eliminating phase/bend drift from the comparison.
- No baseline motion, palette, material, edge, or timing tuning was performed.

## 4. Renderer/runtime architecture

- one `ExpandedPresentationSurface`;
- one canvas;
- one WebGL2 renderer and linked program;
- one `gl.drawArrays` call;
- no sampler, texture, framebuffer, preprocessing, post-processing pass, or second draw;
- no Product, Download, lifecycle, target, policy, queue, or production integration;
- no independent Refraction runtime input or scheduling path.

The worker initially added Refraction to runtime inputs. Lead simplification removed that redundant path: moving Refraction is always a derived Heatmap preset and consumes the existing Heatmap frames. Reduced Motion continues to render once with `k = 0.42`, `bendTime = 0.0`, and zero pending frame loop.

## 5. Visual evidence

Primary comparison:

- `research/thermal-refraction/baseline-vs-refraction.png`

Exact paired frames and terminal evidence:

- `research/thermal-refraction/evidence/baseline-k010.png` / `refraction-k010.png`;
- `research/thermal-refraction/evidence/baseline-k025.png` / `refraction-k025.png`;
- `research/thermal-refraction/evidence/baseline-k035.png` / `refraction-k035.png`;
- `research/thermal-refraction/evidence/baseline-k050.png` / `refraction-k050.png`;
- `research/thermal-refraction/evidence/baseline-reduced.png` / `refraction-reduced.png`;
- `research/thermal-refraction/evidence/capture-log.json`;
- `research/thermal-refraction/evidence/analysis.json`.

The capture log proves, for every pair: one canvas, linked program, Heatmap mode on, Refraction uniform off/on as expected, no bound texture, and no framebuffer. Moving pairs use identical pinned time. Both Reduced Motion frames report frozen time across 500 ms.

Quantitative A/B analysis at the final bounded amplitude supports the intended causal hierarchy:

| Phase | Warm mean RGB delta | Cool mean RGB delta | Dark mean RGB delta |
| --- | ---: | ---: | ---: |
| k 0.10 | 4.73 | 2.44 | 0.017 |
| k 0.25 | 0.94 | 0.15 | 0.009 |
| k 0.35 | 2.21 | 0.12 | 0.025 |
| k 0.50 | 2.86 | 0.04 | 0.006 |
| Reduced | 4.03 | 0.09 | 0.027 |

The changed pixels cluster around the warm/frontier contour, remain weaker in cool material, and are effectively absent in dark/energy-free regions.

## 6. Cindy Lead preliminary visual judgment

**Preliminary ACCEPT for the bounded Browser Lab spike.**

Direct inspection of the full-resolution pairs and comparison sheet finds a subtle, continuous contour displacement around the warm frontier and hot bulges. It reads as secondary optical instability rather than a new visible wave graphic. The effect does not create concentric ripples, explicit wave lines, full-screen wobble, jelly deformation, fisheye/zoom, or high-frequency shimmer. The accepted Thermal field remains visually dominant.

The result intentionally sits near the restrained end of perceptibility. The final amplitude is stronger than the first capture while remaining subordinate. No further tuning round was entered.

## 7. Validation

- Pre-edit focused baseline: **3 files / 54 tests passed**.
- Final focused suite: **5 files / 76 tests passed**.
- `npm run type-check`: **pass**.
- `npm run lint -- --quiet`: **pass**.
- `git diff --check`: **pass**, with existing CRLF conversion warnings only.
- Full suite: **199 / 200 files passed; 1770 / 1771 tests passed**.
- The single failure is the existing `browser-extension/architecture-guard.test.js:277` source-shape assertion. It was already documented and reproduced on the accepted MR9 baseline; no browser-extension file was changed.
- Browser capture console contained only the pre-existing React `borderColor`/`border` shorthand warning; no shader compile/link/WebGL error occurred.

## 8. Stop condition

Prototype, visual evidence, validation, and this report are complete. No production integration, timing tuning, commit, Trellis archive, or follow-on visual round was performed. Await GPT Architecture Lead Review.

