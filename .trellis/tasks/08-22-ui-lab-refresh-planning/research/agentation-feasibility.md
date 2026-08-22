# Agentation Feasibility for the UI Lab

Date: 2026-08-22

Disposition: **feasible as an optional Lab-only tool, pending a bounded browser proof and dependency-license acceptance**.

Agentation is not required for the core UI Lab Refresh. A failed proof or rejected license must not block the three-region Presentation Playground.

## Upstream Baseline

Research used the current npm release and upstream source on 2026-08-22:

- Package: `agentation@3.0.2`
- npm: <https://www.npmjs.com/package/agentation>
- Upstream source: <https://github.com/benjitaylor/agentation>
- Source revision inspected: `8158a97c10c37e577b0a6e2d3175d143918216cd`
- React peer range: `react >=18`, `react-dom >=18`; compatible with Ameow's React 19 (`package.json:72-73`).
- Runtime dependencies: none.
- npm unpacked size: approximately `3.63 MB`.
- Stated environment: desktop browser; the Lab is a desktop-only browser tool.
- License: `PolyForm-Shield-1.0.0`, not the repository's usual permissive license family. It prohibits competing use and requires preserving / distributing its license notice. Dependency adoption needs explicit license acceptance and notice handling; this is not a production architecture issue.

## Recommended Containment

If adopted:

1. Add Agentation as a `devDependency` only.
2. Import and mount it only from `src/lab/lab-main.tsx` or another `src/lab/` leaf.
3. Do not add it to `index.html`, `src/main.tsx`, Electron, Presentation production modules, or shared runtime composition.
4. Do not configure `endpoint` or `webhookUrl` in the first integration. The default local workflow and copy callback are enough; no Agent Sync service is part of this scope.
5. Preserve the production build guard in `vite.config.ts:9-16` and extend `src/lab/rendererReuse.test.ts:43-77` so production inputs and output contain no Agentation entry or asset.

The Lab already has the correct containment boundary: `vite.lab.config.ts:4-23` is a dedicated server, and the production Rollup input is only `index.html`.

## Hit Testing Under the Current Preview

Agentation's current source is compatible with uniform display scaling in principle:

- It finds the target under a viewport point with `document.elementFromPoint()` and can drill through open shadow roots (`package/src/components/page-toolbar-css/index.tsx:233-249` upstream).
- Hover and click selection derive highlight bounds from `getBoundingClientRect()` (`index.tsx:1838-1869`, `1926-2062` upstream).
- Multi-select also uses `document.elementsFromPoint()` plus live bounding rectangles (`index.tsx:2220-2285` upstream).
- Its UI is portaled to `document.body` (`index.tsx:3565-3571` upstream).
- Its full-page overlay is `pointer-events: none`; only its own child UI becomes interactive (`package/src/components/page-toolbar-css/styles.module.scss:754-763` upstream).

Browser `elementFromPoint()` and `getBoundingClientRect()` both operate in post-transform viewport coordinates. A uniformly transformed preview child should therefore highlight at the displayed bounds. The transform must wrap only the preview stage, not the whole Lab or Agentation toolbar.

This still requires a real-browser proof at `1x` and the maximum planned scale. Stored annotations are viewport/document coordinates, and target replacement or zoom changes can make a previous stored box stale even when live hover is correct.

## Meaningful Targetability by Preview Kind

### Full

- The production canvas is `aria-hidden` and `pointer-events: none` (`src/presentation/main-window/ExpandedPresentationSurface.tsx:786-798`).
- The hit target for shader-only pixels is therefore the Lab frame (`src/lab/LabOverlayStage.tsx:198-204`), not an internal heat, progress, or refraction pixel.
- Shared DOM overlays mounted at `LabOverlayStage.tsx:217-254` remain ordinary DOM targets when their own production pointer behavior permits it.
- The pointer-origin marker is deliberately `pointer-events: none` (`LabOverlayStage.tsx:256-272`).

Conclusion: Full supports meaningful whole-stage and DOM-overlay annotations. Shader regions require Agentation's area/draw annotations; no DOM selector can identify an individual WebGL feature.

### Compact

- The existing character SVG and its production shell layer are non-interactive (`CompactCatCharacter.tsx:217-227`; `MainWindowPresentationSurface.tsx:1159-1167`).
- Agentation will therefore resolve to the Lab-local Compact stage wrapper rather than the body, ears, or eyes.

Conclusion: Compact supports a meaningful semantic target such as `Compact Preview / Character`, plus area annotations over eyes/body. It does not support reliable element-level selection of internal SVG paths unless production pointer behavior is changed, which is prohibited and unnecessary.

The Compact Lab host should expose a stable Lab-local stage name / data attribute so feedback identifies the preview target without changing the production renderer.

## Interaction Risk

Agentation's document-level capture click handler calls `preventDefault()` for annotation clicks, but ordinary non-interactive page clicks are not always stopped from propagating (`package/src/components/page-toolbar-css/index.tsx:1926-2068` upstream).

The Full Preview currently uses a frame click to set normalized activation origin (`src/lab/LabOverlayStage.tsx:162-168`, `198-204`). An annotation click can therefore also move the scenario origin.

The smallest Lab-local mitigation is to make the preview click handler ignore an already-default-prevented event, if the browser proof reproduces the conflict. Do not change production pointer-events, z-index, canvas behavior, or overlay authority for Agentation.

## Proof Spike Acceptance

Before keeping the dependency, run one disposable Lab-only browser proof that verifies:

- toolbar remains unscaled and above Lab chrome;
- hover and click highlight the Full frame at `1x` and maximum display scale;
- a production DOM overlay (for example queue badge/popover) remains selectable;
- Compact resolves to the semantic Lab stage wrapper at `1x` and maximum scale;
- area annotation can describe a WebGL region and a Compact eye/body region;
- activating annotation mode does not change pointer origin or scenario state;
- switching Full / Compact and changing zoom does not leave a materially misaligned live highlight;
- production build output contains no Agentation code or asset.

If any target requires production pointer or renderer changes, reject that target granularity. Keep Agentation coarse or omit it.

## Recommendation

Agentation is suitable only as an optional annotation overlay for semantic DOM/stage nodes. It is not a renderer inspector, shader picker, parameter editor, or production diagnostic authority.

The Refresh can plan a single conditional adoption slice after the core Lab layout and Preview Target model work. The dependency should be omitted if its license is not accepted or the click/scale proof fails.
