# Thermal Refraction Browser Lab Spike Implementation Plan

## Implementation

1. Extend the existing Lab heatmap presets with moving and Reduced Motion Refraction variants and update reducer tests/locales.
2. Forward the derived Refraction boolean through `PresentationLab` and `LabOverlayStage` to an optional false-by-default surface prop.
3. Add one Refraction uniform to the existing program and renderer draw/redraw plumbing, with no runtime state, resource, pass, or second draw.
4. Preserve accepted baseline calculations. For Refraction only, derive a bounded low-frequency displacement direction from finite differences of `heatmapBend`, apply a warm/frontier-first envelope using existing `warm`, `body`, and `energy`, and locally blend an analytic re-evaluation.
5. Add source-contract and scenario tests, keeping all existing baseline assertions.
6. Replace the rejected `behind2` / `depthT` material axis with a covered/energy-gated, broad low-frequency 2D multi-temperature field built from the existing `heatmapBend` and shared `bendTime`; layer frontier warm bias and contact hot bias over it. Keep the palette, displacement envelope/strength, motion/contact formulas, and Refraction-off path unchanged.

## Validation

1. `npm exec vitest run -- src/presentation/main-window/expandedPresentationSurface.test.ts src/presentation/main-window/expandedPresentationRuntime.test.ts src/lab/scenarios.test.ts`
2. `npm run type-check`
3. `npm run lint -- --quiet`
4. `npm test`
5. `git diff --check`

## Visual Evidence

- Capture matched baseline/refraction frames near `k ~= 0.10`, `0.25`, `0.35`, and `0.50`, plus Reduced Motion at `k = 0.42`.
- Record one canvas/program/draw, Refraction uniform, moving/frozen time, no texture, and no framebuffer.
- Build comparison sheets, inspect full-resolution captures, and write the requested implementation/visual report.
- Compare the current rejected distance-driven Material Distribution version directly with the 2D Material Model Rework at early, developed, developed-later, late-sweep, and Reduced Motion phases. Visual PASS requires: temperature topology no longer distance-driven; the covered region genuinely reads as a 2D multi-temperature field; and no visible warm-frontier / blue-body division in direct frames, not only amplified deltas.

## Stop Condition

Stop after prototype, evidence, validation, and report. Do not tune final timing, integrate to production, commit, archive, or continue into another visual round before GPT Architecture Lead Review.
