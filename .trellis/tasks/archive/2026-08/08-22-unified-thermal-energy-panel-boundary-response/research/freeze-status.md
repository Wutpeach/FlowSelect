# Freeze / Status Record — Unified Thermal Energy → Panel Boundary Response Spike

Task: `08-22-unified-thermal-energy-panel-boundary-response`
Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`
Branch: `motion/mr9-fullscreen-activation-fx`
Recorded: before the single implementation/evidence round.

## Accepted checkpoint (pre-edit baseline)

- HEAD: `4db772276977db96812b84b11c47c9a92d6ff0a1`
- Production `src/presentation/main-window/ExpandedPresentationSurface.tsx` = accepted
  Thermal + Refraction checkpoint:
  - one canvas / one WebGL2 program / one `gl.drawArrays`; no sampler / texture / framebuffer;
  - analytic heatmap field (`heatmapBend`, `roundedBoundary`, `boundaryBand`, `capture`,
    `HEAT_STOP[7]`, `material2`/`rgb2`/`alpha2`, Refraction with `REFRACTION_EPS=0.02`,
    `REFRACTION_STRENGTH=0.16`, ∇bend direction, env envelope, first-order resample);
  - no Paper residue anywhere in `src/` (verified by grep: `uPaperPhase`, `paperOutput`,
    `paperShadowBlob`, `uPaperBoundary`, `MODIFIED DERIVATIVE`, `data-lab-panel-clip`,
    `PAPER_STOP` all absent — only a test asserts their absence).
- `expandedPresentationRuntime.ts` = bounded heatmap scheduling; Reduced Motion = static
  snapshot, zero continuing frames; no Paper phase.
- `THIRD_PARTY_NOTICES.md` = clean-room ("no active Paper-derived source shipped"); root
  `LICENSE` MIT unchanged.
- Lab baseline: `LAB_PREVIEW_SIZE = 200`; 4 heatmap presets
  (`heatmap-moving`, `heatmap-reduced`, `heatmap-refraction-moving`,
  `heatmap-refraction-reduced`); `LabOverlayStage` mounts the one surface at 200px;
  `WebglReadback` same-commit readback; `rendererReuse.test.ts` locks reuse/no-reimplementation.

## Pre-edit dirty state (task-scoped, preserved)

The worktree carries the prior accepted Thermal/Refraction + archived spike research files
from earlier tasks (reports, capture pages under
`.trellis/tasks/*/research/...`). None of those touch production source; this spike edits
only the files listed below plus new task-local research evidence.

## Files this spike will change (task-scoped)

- `src/presentation/main-window/ExpandedPresentationSurface.tsx` (lab-gated `uBoundaryMode`
  + panel-mapping uniforms + T/A/H/E consumers)
- `src/presentation/main-window/expandedPresentationSurface.test.ts` (source-contract tests)
- `src/lab/scenarios.ts` (unified presets + `boundary` flag)
- `src/lab/scenarios.test.ts` (preset/state tests)
- `src/lab/LabOverlayStage.tsx` (outer-domain 228 composition + `boundary`/panel props)
- `src/lab/PresentationLab.tsx` (readout + props wiring)
- `src/lab/locales/en.json`, `src/lab/locales/zh-CN.json` (preset labels)
- `src/lab/rendererReuse.test.ts` (Lab reuse assertions)

## Untouched (boundaries)

`expandedPresentationRuntime.ts` (no scheduling change), production files, geometry/metrics,
native bounds, `THIRD_PARTY_NOTICES.md`/`LICENSE` (candidate stays clean-room analytic),
unrelated dirty work, prior evidence.
