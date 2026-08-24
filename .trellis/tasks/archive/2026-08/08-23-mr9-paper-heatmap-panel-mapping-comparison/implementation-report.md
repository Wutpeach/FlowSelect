# Implementation Report: Paper Heatmap Panel Mapping Comparison

## Status

Implementation, automated validation, and real-browser evidence are complete in the accepted
isolated baseline worktree. Visual PASS/REJECT and the A/B choice remain **UNDECIDED** for the
user. No Production integration, Paper tuning, derivative adaptation, implementation commit,
stable-line integration, task archive, or Architecture PASS occurred.

## Isolated Line

- Base / worktree HEAD: `431114af4f44619483f1b700554f3f47f1b86619`
- Branch: `motion/mr9-paper-heatmap-official-baseline`
- Implementation worktree:
  `D:/Ameow/.cindy-worktrees/mr9-paper-heatmap-official-baseline`
- Stable comparison worktree:
  `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`
- Stable comparison worktree status after validation: clean

The accepted uncommitted Paper official baseline was preserved. The comparison adds no dependency
or license change and touches no Production presentation, renderer, lifecycle, Product,
Application, Electron, native-window, extension, Download, site, or release file.

## Implemented Comparison

One mutually exclusive `Paper panel A/B` Browser Lab category now renders two official
`@paper-design/shaders-react@0.0.80` Heatmaps side by side. In this category there is no
`LabOverlayStage`, `ExpandedPresentationSurface`, Production canvas, Production readout/export, or
Production input control.

### Scheme A: full-interior Paper viewport

- New `paperHeatmapFullFrame.svg`: one black 200×200 full-frame rectangle, no radius and no other
  visible element.
- The asset is passed only through Paper's `image` prop and is never displayed as DOM or CSS.
- The official Heatmap receives only `image`, `suspendWhenProcessingImage`, and 200×200 style.
- Its output is clipped by an external 200×200/r16 display viewport.
- There is no real Ameow panel beneath Scheme A.

### Scheme B: real panel plus computational silhouette

- Reuses the accepted black 200×200/r16 SVG only as Paper's computational `image` input.
- Renders exactly one real black-theme Ameow panel below the Paper output through
  `getPanelShellStyle(...)`, `MAIN_WINDOW_PANEL_SIZE`, and
  `MAIN_WINDOW_FULL_PANEL_RADIUS`.
- Adds exactly one Paper visual prop beyond the accepted baseline:
  `colorBack="#00000000"`.
- The overlay uses the same external r16 clip. There is no visible input SVG, second panel, blend
  mode, opacity adjustment, filter, mask, extra blur, or output postprocessing.

### Shared official behavior

Both cells are under one shared Suspense boundary and appear in the same React commit. Each
published component still owns its own canvas, WebGL resources, preprocessing, texture/mipmaps,
RAF, frame clock, visibility pausing, and disposal. No `speed`, `frame`, `scale`, `fit`, glow,
contour, palette, coordinate, or morphology prop is passed. Approximate start alignment is observed;
exact phase synchronization is not claimed.

## Simplify and Evidence-Tool Review

Lead review shortened the comparison component's design commentary without changing code behavior.
It also corrected three evidence-tool defects before accepting any runtime result:

- the original “start” screenshot occurred after an initial 12-second wait;
- `[data-paper-shader]` also matched Paper's document-level style element and would miscount mounts;
- the disposal selector used `data-lab-cell-a` instead of the actual `data-lab-cell="a"` hook.

The final evidence was regenerated from a fresh successful run after these corrections. The
temporary full-page diagnostic screenshot and Vite logs were removed; only element crops, compact
sheets, and machine-readable results remain.

## Automated Validation

| Check | Result |
| --- | --- |
| Focused Lab suites | **55/55 passed** across 4 files |
| `npm run type-check` | passed |
| `npm run lint -- --quiet` | passed |
| `npm run build:renderer` | passed |
| Production bundle Paper identifier search | 0 matches |
| Paper dependency tree | exact React 0.0.80 -> core 0.0.80 |
| `git diff --check` | passed; existing CRLF warning only |
| Stable Production worktree | clean |
| Full test suite | **1803 passed, 1 failed** |

The only full-suite failure is
`browser-extension/architecture-guard.test.js > runtime routing ownership > falls through to false
for unknown messages instead of leaving the channel open`. Running that focused file against the
clean stable `431114a` worktree reproduced the same **16 passed, 1 failed** result. It is pre-existing
and outside this Lab-only task.

The Production build completed with the repository's existing userscript/browser-externalization
and chunk-size warnings. No Paper package or shader identifier was found in `dist/`.

## Real-Browser Runtime Evidence

Validation ran in headless Chromium against the real Vite Browser Lab on temporary port 1422. The
server was stopped and transient logs were removed afterward.

### Settled A/B category

| Observation | Result |
| --- | --- |
| Document canvas count | 2 |
| Paper mount / Paper canvas count | 2 / 2 |
| Production preview count | 0 |
| A viewport | 200×200, one canvas, no `<img>`/`<svg>`, no panel shell |
| B composed panel / viewport | 200×200, one canvas, no `<img>`/`<svg>`, exactly one real panel shell |

### Continuous native motion

| Time | Scheme A frame | Scheme B frame |
| --- | ---: | ---: |
| 0s | 2432.0ms | 2431.9ms |
| 3s | 5481.9ms | 5481.8ms |
| 6s | 8498.4ms | 8498.3ms |
| 9s | 11531.6ms | 11531.5ms |
| 12s | 14548.2ms | 14548.1ms |

Both independent Paper timelines advanced **12,116.2ms** over the recorded 12-second observation.
No frame was set or synchronized by Ameow.

### Disposal and remount

- Switching to the ordinary Activation category disconnected both original Paper canvases.
- Settled Paper mount count became 0; one Production preview/canvas returned.
- Switching back created exactly two Paper mounts/canvases again and removed the Production preview.

Machine-readable results:
[browser-validation-ab.json](artifacts/implementation/browser-validation-ab.json)

## Compact Visual Evidence

- [Start A/B comparison](artifacts/implementation/comparison-ab-00s.png)
- [12-second A/B comparison](artifacts/implementation/comparison-ab-12s.png)
- Element crops:
  [A start](artifacts/implementation/ab-a-00s.png),
  [A 12s](artifacts/implementation/ab-a-12s.png),
  [B start](artifacts/implementation/ab-b-00s.png),
  [B 12s](artifacts/implementation/ab-b-12s.png)

Every source image is a tight 200×200 CSS element crop. Fractional page positioning produces a
201×201 PNG raster, which the compact sheet places into a 200px comparison cell. B is captured as
the composed real-panel element, not as its transparent Paper canvas alone.

## Factual Visual Comparison

- Scheme A's full-frame input does not produce a uniform filled panel. Paper's official Default
  preprocessing and sizing leave a large opaque black square with visibly square inner corners
  inside the external r16 viewport. Blue/cyan field and warm bands occupy the area around that
  square; the outer field is clipped by the r16 viewport.
- Scheme B exposes the real Ameow gradient panel as one rounded r16 central surface. Paper's
  blue/cyan field and warm side bands remain visible around the panel perimeter through the
  official transparent-background composition. No second r16 input geometry is visible.
- Across the 12-second evidence, both mappings preserve the same stable central geometry while the
  warm/cool distribution moves around it. The warm band position and side-lobe distribution change
  between the start and end frames in both cells.
- The mappings therefore answer different composition questions: A shows Paper's opaque full-frame
  result inside a clipped viewport; B shows Paper as a transparent perimeter overlay above a real
  Ameow surface. Whether either visual behavior is desirable is not decided by this report.

## Changed Comparison Files

- `src/lab/PaperHeatmapPanelComparison.tsx`
- `src/lab/paperHeatmapFullFrame.svg`
- `src/lab/paperHeatmapPanelComparison.test.ts`
- `src/lab/PresentationLab.tsx`
- `src/lab/locales/en.json`, `src/lab/locales/zh-CN.json`
- `src/lab/rendererReuse.test.ts`
- `src/lab/paperHeatmapOfficial.test.ts` (baseline assertions adapted only for the shared Paper-mode
  suppression branch)
- task report and `artifacts/implementation/` validation/evidence files

No new `.trellis/spec/` rule is appropriate. This remains a bounded source-fidelity Lab control,
not a reusable Production renderer pattern.

## Review Gate

Stop here for GPT Architecture Lead Implementation Review. Do not select A/B, tune either mapping,
add a hybrid, modify Paper, integrate Production, commit/archive the task, or declare Architecture
PASS without the next explicit review decision.
