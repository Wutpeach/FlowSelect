# Fit Model + Preview-local Background / Environment Boundary

## Fit model (new, minimal)
- Today the workspace only has display scales `1x/2x/3x` (`LAB_DISPLAY_SCALES = [1,2,3]` in `previewTargets.ts`); the default is `1x`.
- Repair: `Fit` becomes the default display-scale option and is a *derived* adaptive mode, not a stored pixel scale. It uses the current Preview Workspace dimensions after reasonable preview padding/safety margin to obtain the largest comfortable on-screen preview. It is not capped by the manual 3x option and may resolve above or below the fixed overrides. Planning intentionally defines no numeric maximum.
- State ownership (keep v1 separation): `displayScale: "fit" | 1 | 2 | 3` is Lab-local UI state. Fit resolves to a concrete CSS scale at render time from measured layout space (for example, a `ResizeObserver` on the stage viewport). The Develop Worker may implement a layout-derived bound to avoid clipping or control overlap, but must not write the result into logical geometry, backing/export scale, scenario state, or production constants.
- Segmented control: one control for Preview Target (Full/Compact), a second for scale (Fit/1x/2x/3x). They remain separate segments (per user decision) and both are Preview-local UI, never written into scenario/reducer/renderer state.
- Narrow window: retire the `lab.css` rule that hides Dev Tools. Fit keeps Preview content inside its available workspace while the two macro regions use clamped widths; below the supported desktop minimum, horizontal page overflow is preferable to hiding diagnostics.

## Preview-local background / environment (new, strict boundary)
- Requirement: a tiny bottom-right Preview-local button opening a compact popover with **Dark / Light / Checkerboard**. This is Lab preview-environment state only — NEVER production visual state.
- Where it lives: inside the Preview Workspace, anchored bottom-right of the Preview stage area (not inside the 200x200 logical frame; not in Dev Tools; not in production).
- State: `previewBackground: "dark" | "light" | "checkerboard"` — one Lab-local `useState` in `PresentationLab` (or a Lab-local preview-context). Default `"dark"` (preserves current `#1b1920` look).
- Rendering: the background is a **screen-only chrome layer behind the preview host**, not a change to the host:
  - Full: an environment layer outside the Full export capture root provides dark, light, or CSS checkerboard. The shader/canvas visuals and captured frame remain untouched.
  - Compact: the `data-lab-compact-stage` outer frame background becomes the chosen environment (the 60px shell keeps production `panelShadowCompact`/gradient).
- Boundary proof points for validation:
  - No production file imports or knows `previewBackground`; it never reaches `ExpandedPresentationSurface`, `CompactCatCharacter`, or any theme/Product state.
  - The checkerboard is a plain CSS background on Lab chrome only; no image asset, no canvas, no dependency.
  - Export preserves the v1 Full 4x PNG contract and `912x912` output independently of the selected environment. Environment-aware export is out of scope unless explicitly requested later.

## Control placement (below Preview)
- Preview controls move BELOW the preview: the segmented controls (Target, Scale), the environment picker button, and the scale meta line sit in a single compact "Preview controls" row under the stage. Replay/Export remain preview actions but move into the same below-preview controls row (Full-only), keeping the workspace uncluttered.
- The environment picker is anchored to the Preview stage, not to the viewport. Page-level Lab controls stay away from the viewport bottom-right fixed-overlay area; no Agentation placeholder or anchor is added.
