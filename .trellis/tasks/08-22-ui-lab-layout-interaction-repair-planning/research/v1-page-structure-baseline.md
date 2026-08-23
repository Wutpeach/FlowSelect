# v1 Page Structure Baseline (UI Lab Refresh, validated)

Date: 2026-08-22 · Baseline: validated UI Lab Refresh v1 checkpoint `25040db9ab7887444010a70d43cd537331286721`. Source of truth for this leaf: `src/lab/PresentationLab.tsx`, `src/lab/LabOverlayStage.tsx`, `src/lab/CompactPreviewStage.tsx`, `src/lab/lab.css`, `src/lab/previewTargets.ts`.

## Current three-region layout (v1)

`PresentationLab` renders one flex row (`PAGE_STYLE`, `PresentationLab.tsx:178`):

- Left `<nav>` — Scenario Navigation (`NAV_STYLE` `:189-202`, width 268, surface `#1d1b22`, radius 12, `maxHeight: calc(100vh - 32px)`, `overflowY: auto`).
- Center `<main>` — Preview Workspace (`WORKSPACE_STYLE` `:204-214`, `flex: 1`, column, `padding: 14px 10px`; `data-lab-workspace`).
- Right `<aside>` — Dev Tools (`DEVTOOLS_STYLE` `:216-229`, width 320, same surface, `data-lab-devtools`).

### Left nav contents
- `appTitle` / `appSubtitle` (no explicit page title styling beyond `TITLE_STYLE`/`SUBTITLE_STYLE`).
- Flat category pills (`CATEGORIES` list, `PresentationLab.tsx:498`; `CATEGORY_PILL_STYLE` `:291-300` / `ACTIVE_CATEGORY_PILL_STYLE` `:302-308`). Pills are flat (no hierarchy) with `aria-pressed` and `aria-disabled` for target-incompatible groups.
- Per-category scenario buttons (`BUTTON_STYLE` `:271-283` / `ACTIVE_BUTTON_STYLE` `:285-289`), including the Compact category (`LAB_COMPACT_SCENARIOS`, `data-lab-compact-preset`) and Full categories (`data-lab-preset`, `data-lab-action`).
- Full-only / Compact-only tags (`TAG_STYLE` `:369-380`).
- `Reset` button + `nav.resetHint`.

### Center Preview Workspace
- Toolbar (`WORKSPACE_TOOLBAR_STYLE` `:231-238`, `flexWrap: wrap`, `maxWidth: 900`): Preview Target tabs Full/Compact (`TAB_STYLE`/`ACTIVE_TAB_STYLE` `:326-343`), display scale 1x/2x/3x (`SCALE_STYLE`/`ACTIVE_SCALE_STYLE` `:345-361`), scale meta text (`META_STYLE` `:363-367`), then Full-only Replay + Export buttons (`EXPORT_BUTTON_STYLE` `:431-447`).
- Stage viewport (`STAGE_WRAPPER_STYLE` `:240-246`, `data-lab-stage-viewport`): a layout-reserving wrapper of `logicalSize × displayScale` containing an absolutely-positioned, `transform: scale(displayScale)` inner wrapper. Full renders `LabOverlayStage` (200×200, radius 16, `LabOverlayStage.tsx` `PREVIEW_FRAME_STYLE`), Compact renders `CompactPreviewStage` (80/60/56, `data-lab-compact-stage`/`data-lab-compact-shell`).
- Caption below (`PREVIEW_CAPTION_STYLE` `:382-390`).

### Right Dev Tools
- Target + single Reduced-Motion summary rows, RM toggle, then either Compact facts / scenario facts / origin+determinate controls.
- Advanced Diagnostics (`DISCLOSURE_STYLE` `:449-455`, `DISCLOSURE_SUMMARY_STYLE` `:457+`, `data-lab-advanced`): a native `<details>` disclosure holding scale facts + (Full-only) composed-input JSON + WebGL readout JSON.

### Narrow window
- `lab.css`: `@media (max-width: 1080px) { [data-lab-devtools] { display: none !important; } }` — the only bounded narrow-window behavior.

## State ownership (v1, keep unchanged)
- Preview Target `full | compact` + display scale are Lab-local UI state in `PresentationLab` (`useState<LabPreviewTarget>("full")`, `useState<LabDisplayScale>(LAB_DISPLAY_SCALE_DEFAULT)`), separate from scenario reducer state (`reduceLabPresentation`).
- One derived reduced-motion value: `resolveLabPreviewReducedMotion(state, target, compactScenario, projectionActive)` (`scenarios.ts:496`+).
- Logical vs display vs export scale separation documented in `previewTargets.ts`; geometry derives from production constants (`windowMetrics`, `characterRecipe`, `geometry`).

## What v1 does NOT have (the repair gap)
- No page title in the center region (title sits in the left nav only).
- Category pills + scenario list consume the left column; the Preview is center-dominant but the left nav is a first-class region.
- No Preview-local background/environment picker; preview frame background is a fixed `#1b1920` (`LabOverlayStage.tsx` PREVIEW_FRAME_STYLE / `CompactPreviewStage.tsx` `COMPACT_STAGE_FRAME_STYLE`).
- No Fit scale option (only 1x/2x/3x).
- Focus-visible: buttons rely on native browser focus (no consistent ring); the neon family uses JS `isFocused` + box-shadow ring (`outline: none`).
- No reserved bottom-right Agentation slot in the workspace.
- Raw Dev Tools and nav use the same panel surface as the app shell, but the two macro regions are three columns with distinct widths (268 / flexible / 320).
