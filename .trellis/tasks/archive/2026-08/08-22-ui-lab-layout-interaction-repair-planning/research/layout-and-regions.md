# Layout & Regions (two macro regions) + Dev Tools surface language + Agentation clearance

## Two macro regions only
- **Main Workspace** (flex column, dominant) + **persistent right Dev Tools** (fixed width). The v1 three-column layout (268px left nav + flexible center + 320px right) is collapsed to two: the scenario strip moves INTO the Main Workspace top, the left nav disappears entirely, and Dev Tools keeps its own surface.
- No page title: do not render `Ameow UI Lab`, `appTitle`/`appSubtitle`, or a replacement heading block. Flat Scenario Navigation is the first Main Workspace content, followed by the large Preview and then Preview/scene controls.

## Main Workspace vertical flow
1. **Flat scenario strip** (top): a few flat scenario buttons, one row. No categories, no old pill cloud, no selected underline, no click-residual outline. Scenario grouping for the repair is reduced to the *visible, useful* set (e.g. Activation presets, Download/Progress, Runtime, Transcode, Mixed, Reduced Motion, Compact) rendered as flat chips/buttons; target-incompatible scenarios stay visible but disabled (v1 `LAB_CATEGORY_TARGET_AVAILABILITY` remains the authority). Selected = accent field-surface treatment (from `getSelectableOptionStyle`), hover = field hover ring, focus = shared ring. A compact "Reset" lives at the strip's right end.
2. **Preview** (center, dominant): the preview host (Full `LabOverlayStage` or Compact `CompactPreviewStage`) inside the stage viewport with the display-scale transform and the Preview-local background layer.
3. **Preview / scene controls** (below): one row with Target segmented control (Full/Compact), Scale segmented control (Fit/1x/2x/3x), scale meta text, Full-only Replay/Export, and (bottom-right of the preview frame) the environment picker button.

## Persistent Dev Tools
- Stays visible at every supported desktop width and uses the **same page/surface/background language as the Main Workspace**: same panel surface (`getPanelShellStyle`-derived, `#1d1b22`-class background), same corner radius, same typography scale, same interaction tokens. Retire the v1 `≤1080px` hide rule; clamp both region widths and allow horizontal page overflow below the documented desktop minimum.
- Content is concise and human-readable: current scenario, target (Full/Compact), scale (Fit or Nx), reduced-motion state, and relevant human-readable scenario facts. Raw projection/WebGL/JSON stay in the Advanced disclosure (`data-lab-advanced`) — the v1 diagnostics boundary is preserved.
- No generic Inspector; no fake inspect button.

## Flat scenario compatibility presentation
- The strip uses `LAB_CATEGORY_TARGET_AVAILABILITY` (`scenarios.ts:420+`) to show which scenarios apply to the current target; incompatible ones are visibly disabled with the Full-only / Compact-only tag (v1 `TAG_STYLE`). Compact scenarios render only the current Compact renderer's capability (neutral / pointer attention / Reduced Motion) — never fake Full business states.

## Agentation bottom-right clearance (no implementation this round)
- The user decision: no Agentation implementation; Layout only preserves future bottom-right room for Agentation's real component behavior. No fake inspect button/UI/authority.
- Concretely: add no Agentation-specific element, attribute, state, or control. Keep page-level Lab controls away from the viewport bottom-right fixed-overlay area. The environment picker remains anchored to the Preview stage, so a future real component can be integrated only after its actual license, hit-test, and layering behavior is known.

## Layout invariants to preserve from v1
- Preview Target + display scale are Lab-local UI, separate from scenario reducer state.
- Logical / display / export scale separation; geometry from production constants.
- Single derived reduced-motion value drives both targets.
- Full keeps exactly one `ExpandedPresentationSurface`, Compact keeps the production `CompactCatCharacter` leaf, zero `<canvas` in Compact, no second renderer/shader.
- Advanced diagnostics boundary; export contract (`912x912` Full PNG); production isolation (no Electron/desktop imports in `src/lab`, production build pinned to `index.html`).
- Dev Tools never disappears; clamped widths and horizontal overflow are the bounded narrow-layout behavior.
