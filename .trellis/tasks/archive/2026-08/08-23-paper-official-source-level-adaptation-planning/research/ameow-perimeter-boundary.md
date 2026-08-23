# Research: Ameow Perimeter-Oriented Boundary

- Query: Where does the current perimeter result arise in the smallest upstream/repository boundary?
- Scope: repository and archived Browser Lab evidence
- Date: 2026-08-23

## Repository Geometry and Composition

- `.cindy-worktrees/mr9-paper-heatmap-official-baseline/src/constants/windowMetrics.ts:1` defines the visible panel as 200px.
- `.cindy-worktrees/mr9-paper-heatmap-official-baseline/src/presentation/main-window/geometry.ts:45` defines radius 16.
- The accepted official baseline imports only `Heatmap`, passes the black r16 SVG through `image`, enables official preprocessing suspension, and uses a 200×200 host.
- The accepted Scheme B composition places the official canvas above one real Ameow panel, uses `colorBack="#00000000"`, and clips the result to r16. This composition changes background alpha, not Paper motion or domain semantics.

Primary repository reports:

- `.trellis/tasks/08-23-mr9-paper-heatmap-official-component-source-fidelity-baseline/implementation-report.md`.
- `.trellis/tasks/08-23-mr9-paper-heatmap-panel-mapping-comparison/implementation-report.md`.
- `.cindy-worktrees/mr9-paper-heatmap-official-baseline/.trellis/tasks/archive/2026-08/08-23-mr9-paper-official-heatmap-panel-interior-calibration/implementation-report.md`.

## Causal Evidence

The final public-prop matrix held the accepted composition fixed and varied only:

- C0: official defaults;
- C1: `scale=1`;
- C2: `innerGlow=1`;
- C3: `outerGlow=0`;
- C4: `scale=1`, `innerGlow=1`, `outerGlow=0`.

Repository anchors:

- `src/lab/PaperHeatmapInteriorCalibration.tsx:25-30` defines the matrix.
- `src/lab/paperHeatmapInteriorCalibration.test.ts:40-65` locks the matrix, transparent background, real panel, r16 clip, and official package-only import.
- The archived implementation report lines 150-161 records that C0-C2 retain moving perimeter energy, while C3/C4 remove that movement and leave byte-identical 200×200 start/end captures despite native frame advancement.

Conclusion from evidence:

1. Paper timing and RAF are alive; the failure is not a stalled animation.
2. Transparent `colorBack`, real-panel composition, r16 clip, `scale`, and public inner/outer amplitudes do not create central moving heat.
3. The branch that produces visible motion in this mapping is the official outer branch.
4. Official `heatmap.ts:231` gates that branch to object exterior. Because the computational r16 object occupies nearly the whole 200×200 viewport, its active domain is perceived at the panel perimeter and is then clipped by the panel viewport.

The smallest causal boundary is therefore the conjunction of one upstream source expression (`outerBlur`'s shape selector) and the intentionally fixed Ameow r16 object mapping. It is not caused by Production Thermal, the panel theme, or an Ameow-authored carrier.

## Negative Evidence That Must Not Be Reused

Archived task `.cindy-worktrees/mr9-paper-heatmap-official-baseline/.trellis/tasks/archive/2026-08/08-21-paper-heatmap-geometry-rendering-domain-audit/` independently integrated Paper-derived concepts into Ameow's renderer, palette, preprocessing, geometry, and fixed-phase morphology. Its `research/archive-summary.md` records visual rejection and full removal.

That task is useful only as a boundary warning. Its Thermal palette, custom processing, fixed phase, outer-domain renderer integration, and carrier-like code are excluded from this source-fidelity plan.

## Production Isolation

The official baseline, A/B comparison, and C0-C4 calibration all ran in `D:/Ameow/.cindy-worktrees/mr9-paper-heatmap-official-baseline`. Their reports verify zero Production canvases in Paper modes, mutual exclusion from the Production preview, successful disposal/remount, no Production bundle identifiers, and a clean stable `mr9-fullscreen-activation-fx` comparison worktree.

The proposed source-level prototype can remain Lab-only and does not require any change to the stable Thermal Production checkpoint.

