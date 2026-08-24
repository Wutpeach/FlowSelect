# Planning Report: Paper Official Heatmap Source-Fidelity Baseline

## Decision and Authoritative Base

Proceed, after GPT Architecture Lead approval, with one bounded control scenario on a new
branch/worktree from clean commit `431114a`. The stable Production Thermal line and its existing
Browser Lab scenarios remain untouched. The baseline is not a production renderer proposal.

## 1. Minimal Repository Isolation

Keep the existing dev-only route:

```text
lab.html -> src/lab/lab-main.tsx -> PresentationLab
```

Add one `Paper official` category/mode in `PresentationLab`. At the center preview boundary:

```text
ordinary Lab category -> existing LabOverlayStage -> ExpandedPresentationSurface
Paper official        -> PaperHeatmapOfficialBaseline -> official <Heatmap>
```

The branches are mutually exclusive. The Paper branch must not render `LabOverlayStage`,
`ExpandedPresentationSurface`, production overlays, production WebGL readback, or the existing PNG
export transaction. This isolates Paper without changing production code or weakening the normal
Lab renderer-reuse contract.

`PaperHeatmapOfficialBaseline` should be a small Lab-only component containing:

- a `<Suspense fallback={null}>`, matching the official demo;
- the package-exported `<Heatmap>`;
- the imported SVG URL as `image`;
- `suspendWhenProcessingImage`;
- a plain 200×200 host/style.

No Paper shader, preprocessing helper, timing loop, canvas, or lifecycle code is authored by
Ameow. The official package creates those resources inside its mount.

## 2. Rounded-Rectangle as the Official `image` Input

Use one Lab-only SVG asset:

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 200 200" width="200" height="200">
  <rect x="0" y="0" width="200" height="200" rx="16" ry="16" fill="#000"/>
</svg>
```

The SVG background is transparent, so only the rounded corners are transparent. Black is required
by Paper's own source convention: the official diamond is also a black shape on transparency;
`toProcessedHeatmap` composites the image over white and converts RGB luminance to the scalar
source field. Ameow must pass the imported URL directly to `image` and never display the SVG.

Do not add CSS `border-radius`, `clip-path`, `mask`, a panel shell, or a second DOM copy of the
rounded rectangle. The 200/r16 ratio exists only in the input asset. Paper's own 1000px
rasterization, padding, blur, sampling, fit, and scale determine how it appears.

## 3. Source-Fidelity Contract

The baseline is official behavior if all of these stay true:

1. Package import is `Heatmap` from exact `@paper-design/shaders-react@0.0.80`.
2. Ameow does not import or call `toProcessedHeatmap`, `ShaderMount`, fragment source, or core
   renderer APIs directly.
3. No Heatmap visual/motion props are passed. The component's own Default preset supplies them.
4. `suspendWhenProcessingImage` matches the current official demo's React/Suspense path.
5. The official mount owns canvas creation, WebGL2, texture/mipmap creation, resize observation,
   frame time, requestAnimationFrame scheduling, visibility pausing, and disposal.
6. The only semantic difference from the official Default demo is `image`.

Tests should enforce the prop allowlist and prohibit copied Paper shader/preprocessing identifiers
in Ameow Lab source. They should also prove mutual exclusion between the Paper and production
preview branches.

### Official behavior intentionally preserved

- `toProcessedHeatmap` uses a 1000px source size, `maxBlur = floor(1000 * 0.15)`, padding of
  `ceil(maxBlur * 2.5)`, three-pass broad blur, three-pass inner blur at 12% of broad radius, and a
  one-pass contour blur of radius 5.
- The processed texture channels feed Paper's contour, outer, and inner morphology; the official
  shader applies its fixed image-coordinate transform and composition.
- Default speed is 1 and frame is 0. The shader derives `t = 0.1 * u_time - 0.3`, uses three
  phase-shifted moving shapes, and cycles in approximately 10 seconds.
- The official mount pauses while the document is hidden or the mount is outside the viewport,
  targets at least pixel ratio 2, generates a mipmap for `u_image`, and disposes its own resources.

None of these internals becomes an Ameow API or test-tuned constant.

## 4. Package, Demo Preset, Dependencies, and License

### Version choice

| Item | Grounded value |
| --- | --- |
| npm latest (checked 2026-08-22) | `@paper-design/shaders-react@0.0.80` |
| exact runtime dependency | `@paper-design/shaders@0.0.80` |
| published package gitHead | `60467401863c1917dd02016d0c1ff2f791d0b3c8` |
| current upstream main | `7002061d8389781a45e479584deeca0cf538474e` |
| license | Apache-2.0 |
| peers | `react ^18 || ^19`; optional `@types/react ^18 || ^19` |

Current main still declares version 0.0.80. Between the package gitHead and current main, the React
Heatmap component, preset, and ShaderMount are unchanged. The only targeted differences are the
demo scale-control minimum (`0.01` to `0.1`) and removal of an unused image-aspect uniform plus
JSDoc cleanup; Heatmap output and timing behavior are unchanged.

Pin the React package with no range as a dev dependency. It adds only the exact core package;
there is no Motion or other runtime dependency.

### Official Default preset

| Prop | Value |
| --- | --- |
| `fit` | `contain` |
| `scale` | `0.75` |
| `rotation` | `0` |
| `offsetX`, `offsetY` | `0`, `0` |
| `originX`, `originY` | `0.5`, `0.5` |
| `worldWidth`, `worldHeight` | `0`, `0` |
| `speed`, `frame` | `1`, `0` |
| `contour`, `angle`, `noise` | `0.5`, `0`, `0` |
| `innerGlow`, `outerGlow` | `0.5`, `0.5` |
| `colorBack` | `#000000` |
| `colors` | `#11206a`, `#1f3ba2`, `#2f63e7`, `#6bd7ff`, `#ffe679`, `#ff991e`, `#ff4c00` |

The current live page at <https://shaders.paper.design/heatmap> was inspected on 2026-08-22 and
shows Default selected with the same numeric controls and seven-color palette. The page uses the
official diamond image, `suspendWhenProcessingImage`, and the package Default preset. Minor hex
differences visible after editing/reading the live color controls are caused by the demo's
integer-rounded HSLA conversion; the published preset values above remain the source-fidelity
authority.

### License delivery

The packages ship Apache-2.0 LICENSE and this NOTICE:

```text
Paper Shaders
Copyright 2026 Paper

Powered by Paper Shaders:
https://shaders.paper.design
```

Update Ameow's existing `THIRD_PARTY_NOTICES.md` status to active dev-only direct package use.
Retain the notice and full license already present. Because Ameow imports an unmodified package,
do not add a “modified derivative” header or claim that Paper source was changed.

## 5. Minimal Visual Verification

### Automated/source checks

- Exact dependency and lockfile resolution are 0.0.80.
- The SVG has one 200×200/r16 black rect and no other visible element.
- The component prop surface contains only `image`, `suspendWhenProcessingImage`, and 200×200 host
  sizing/style.
- After Suspense settles, the Paper scenario has exactly one canvas and one `[data-paper-shader]`
  mount; the production preview is absent.
- `paperShaderMount.getCurrentFrame()` increases across a bounded wait while visible, proving
  native continuous motion; switching category removes the canvas/mount and leaves no leak.
- Existing production scenarios still mount exactly one `ExpandedPresentationSurface`.

### Direct visual comparison

1. Run `npm run dev:lab` and select `Paper official`.
2. Open the official Default demo at <https://shaders.paper.design/heatmap> beside it.
3. Confirm the official controls match the table above; do not tune either side.
4. Observe both continuously for at least 12 seconds, covering one full native Paper cycle.
5. Judge only motion grammar, preprocessing morphology, coordinate behavior, and composition.
   Geometry-specific differences caused by diamond versus rounded rectangle are expected.
6. Save one tightly cropped 200×200 Lab canvas image and, if useful, one compact two-up sheet with
   a tightly cropped official-demo region. No tall page capture and no raw diagnostics screenshot.

The implementation report records PASS/REJECT as a visual experiment result, not Architecture
PASS. A screen recording is optional; live continuous observation is the acceptance authority.

## 6. Temporarily Inapplicable Ameow Renderer Constraints

| Constraint | Control-experiment treatment |
| --- | --- |
| Browser Lab must reuse `ExpandedPresentationSurface` | Waived only for `Paper official`; normal scenarios keep it. |
| Lab source may not create/own another renderer or canvas | Waived for the imported package; Ameow code still authors no canvas/renderer. |
| One production renderer/program/draw/resource authority | Not evaluated in this isolated control; Paper owns its official resources. |
| Production presentation target/policy drives every preview | Not applicable; the scenario has no Product or Presentation semantics. |
| Ameow runtime owns frame scheduling and Reduced Motion freezes motion | Not applicable; Paper's official speed/RAF/visibility behavior is the subject under test. |
| Existing WebGL uniform readback and PNG export use the production canvas | Not applicable; do not adapt Paper to those tools in round one. |
| 228/200/14 outer-domain, gutter, CSS shadow, and native-window geometry | Not applicable; this is a plain 200×200 browser component control. |
| Production single-renderer invariant | Still fully applicable to production; no production file or bundle changes. |

Still applicable: dev-only build isolation, no Electron/desktop bridge, no Product/Application/
Download/native state, no second visible input geometry, exact package/license attribution, and no
production integration.

## Risks and Rollback

| Risk | Containment |
| --- | --- |
| A wrapper silently changes Paper behavior | Enforce the prop allowlist and plain unstyled host; no Paper internals imported. |
| SVG is displayed as a second geometry | Import it only as the `image` URL; DOM tests reject `<img>`, CSS mask/background, or duplicate panel shell. |
| React StrictMode leaves duplicate resources | Inspect settled canvas/mount count and category-switch disposal; do not replace Paper lifecycle. |
| Existing inspector/export reads the wrong canvas | Hide/mark production readback and export unavailable in the Paper scenario instead of adapting Paper. |
| Dependency leaks into production | Keep it dev-only, retain `index.html` as the sole production build input, and inspect production bundle inputs. |
| Review drifts into Paper tuning | Any parameter, timing, morphology, halo, or geometry change ends source fidelity and requires a new reviewed task. |

Rollback is Lab-local: remove the scenario component/asset/category, exact dev dependency/lockfile
entries, tests, and active-direct-use notice wording. No production renderer rollback is involved.

## Review Gate

Planning is complete but not approved. Do not run `task.py start`, create the implementation
branch/worktree, install the package, or edit product/Lab code until GPT Architecture Lead Planning
Review explicitly approves this report.
