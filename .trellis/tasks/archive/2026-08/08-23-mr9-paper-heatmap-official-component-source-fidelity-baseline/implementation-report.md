# Implementation Report: Paper Official Heatmap Source-Fidelity Baseline

## Status

Implementation and validation are complete in an isolated worktree. The visual experiment result
is intentionally **UNDECIDED**: the user, not automated checks or this report, owns the final
PASS/REJECT judgment. No production integration, parameter tuning, derivative adaptation,
implementation commit, stable-line integration, task archive, or Architecture PASS occurred.

## Isolated Line

- Base: `431114af4f44619483f1b700554f3f47f1b86619`
- Branch: `motion/mr9-paper-heatmap-official-baseline`
- Worktree: `D:/Ameow/.cindy-worktrees/mr9-paper-heatmap-official-baseline`
- Stable comparison worktree: `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`
- Stable comparison worktree status after implementation: clean

## Implemented Baseline

- Added exact dev dependency `@paper-design/shaders-react@0.0.80`; its only direct dependency is
  exact `@paper-design/shaders@0.0.80`.
- Added a transparent SVG containing exactly one black 200×200/r16 rectangle.
- Added a minimal Lab-only React component that imports the official `Heatmap` and passes only:
  - the imported SVG URL as `image`;
  - `suspendWhenProcessingImage`, matching the official demo path;
  - plain 200×200 host/component sizing.
- Added one `Paper official` Browser Lab category. Its center branch is mutually exclusive with
  `LabOverlayStage` / `ExpandedPresentationSurface`.
- Disabled the production uniform polling path and hid production input inspector/export controls
  while the Paper category is active.
- Added source-fidelity, asset, dependency, build-isolation, and branch-exclusion tests.
- Updated `THIRD_PARTY_NOTICES.md` for active dev-only direct unmodified package use while retaining
  the full Apache-2.0 text, Paper NOTICE, and the accurate statement that no Paper-derived source is
  shipped in Production.

No Paper visual or motion prop is present in Ameow source. There is no Ameow-authored preprocessing,
shader, canvas, RAF, timing, palette, Thermal, Refraction, Boundary, Halo, Entry, Exit, or Reduced
Motion adaptation in this control.

## Runtime Evidence

The implementation was exercised in Chromium through the real Vite Browser Lab. Port 1422 was
used only for validation because port 1421 was already occupied by an unrelated existing Lab
worktree; the normal `npm run dev:lab` configuration remains unchanged. The validation server was
stopped afterward.

| Observation | Result |
| --- | --- |
| Settled document canvas count | 1 |
| Settled Paper mount / Paper canvas count | 1 / 1 |
| Simultaneous production preview count | 0 |
| Visible `<img>` or SVG inside baseline host | 0 |
| Baseline host / official mount size | 200×200 / 200×200 |
| Host background image / radius | none / 0px |
| Official `paperShaderMount` present | yes |
| Native frame samples | 1230.6, 4680.4, 8146.9, 11596.8, 15046.7 ms |
| Continuous observed advancement | 13,816.1 ms across a 12-second capture window |
| Original Paper canvas after category switch | disconnected |
| Paper mounts after switch away | 0 |
| Production preview after switch away | 1 |
| Paper mount after switching back | exactly 1 |

The official demo was also opened at <https://shaders.paper.design/heatmap>, its visible `Default`
button was selected, and its single official canvas was captured across a separate 12-second native
timeline. The two pages were not phase-synchronized; the comparison is behavior/grammar evidence,
not a claim that equal timestamp labels represent equal shader phase.

Machine-readable runtime results:
[browser-validation.json](artifacts/implementation/browser-validation.json)

## Compact Visual Evidence

- [Start comparison](artifacts/implementation/comparison-00s.png)
- [12-second comparison](artifacts/implementation/comparison-12s.png)
- Rounded-rect timeline:
  [0s](artifacts/implementation/lab-rounded-00s.png),
  [3s](artifacts/implementation/lab-rounded-03s.png),
  [6s](artifacts/implementation/lab-rounded-06s.png),
  [9s](artifacts/implementation/lab-rounded-09s.png),
  [12s](artifacts/implementation/lab-rounded-12s.png)
- Official Default timeline:
  [0s](artifacts/implementation/official-default-00s.png),
  [6s](artifacts/implementation/official-default-06s.png),
  [12s](artifacts/implementation/official-default-12s.png)

All evidence is an element/canvas crop or a compact two-up sheet. No full-page screenshot or raw
diagnostics capture is used.

### Factual visual comparison

- Both inputs exhibit Paper's same blue outer field, bright cyan boundary, warm travelling band,
  black silhouette interior, and slow native cycle.
- On the official diamond, the broad field has substantial open space around the smaller centered
  geometry; the warm band is clearly seen moving from upper/side regions toward the lower region.
- On the 200×200/r16 input, the silhouette occupies most of the 200×200 component. The interior is
  therefore a dominant black rounded rectangle, while the warm band appears mainly along the top
  and upper side perimeter and the broad blue field reaches the component edges.
- The rounded-rect frames show native motion rather than a static glow: the warm side lobes and top
  band change materially over the captured timeline.
- These geometry-dependent differences are the intended control result. They were not corrected,
  tuned, clipped with an Ameow mask, or supplemented with another effect.

## Automated Validation

- Focused and license contract suite: **72/72 passed**.
- `npm run type-check`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build:renderer`: passed.
- Production output search for Paper package/shader identifiers: no matches.
- `npm ls @paper-design/shaders-react @paper-design/shaders --depth=1`: exact 0.0.80 → 0.0.80 tree.
- `git diff --check`: passed; only expected CRLF conversion warnings remain.
- Changed-path audit: only `package.json`, `package-lock.json`, `THIRD_PARTY_NOTICES.md`, and
  `src/lab/` paths.
- Full test suite: **1789 passed, 1 failed**. The only failure is
  `browser-extension/architecture-guard.test.js` expecting the unknown-message listener text to
  end with `return false;`. The identical test was run against the clean stable `431114a` worktree
  and reproduced there as **16 passed, 1 failed**, so it is pre-existing and outside this task.

`npm install` reported the repository's current audit total of 12 vulnerabilities. No `npm audit
fix` or unrelated dependency upgrade was attempted. The new Paper core package itself declares no
runtime dependencies.

## Changed Implementation Files

- `package.json`, `package-lock.json`
- `THIRD_PARTY_NOTICES.md`
- `src/lab/PaperHeatmapOfficialBaseline.tsx`
- `src/lab/paperHeatmapSilhouette.svg`
- `src/lab/PresentationLab.tsx`
- `src/lab/locales/en.json`, `src/lab/locales/zh-CN.json`
- `src/lab/rendererReuse.test.ts`
- `src/lab/paperHeatmapOfficial.test.ts`

No `.trellis/spec/` update is appropriate: this is an explicitly isolated one-off control
exception, and encoding it as a general renderer rule would weaken the production single-renderer
contract.

## Review Gate

Stop here for GPT Architecture Lead Implementation Review. The baseline remains uncommitted and
isolated. Do not tune Paper, begin derivative adaptation, integrate Production, commit to the stable
line, archive this task, or declare Architecture PASS without the next explicit review decision.
