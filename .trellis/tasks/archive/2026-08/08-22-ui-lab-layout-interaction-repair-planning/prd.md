# PRD — UI Lab Layout & Interaction Repair

Status: `planning` (child of `08-22-ui-lab-refresh-planning`). Baseline: validated UI Lab Refresh v1 checkpoint `25040db9ab7887444010a70d43cd537331286721`. This task is PLANNING ONLY until a GPT Architecture Review passes and `task.py start` runs.

## Problem Statement

The validated UI Lab Refresh v1 delivers a Full/Compact Presentation Playground, but its page chrome still reads like a three-pane tool (left scenario nav + center preview + right inspector), the scenario picker is a category/pill cloud, controls sit above the preview, and the Lab does not yet speak the same interaction language (normal/hover/selected/focus-visible) as the rest of the app. The repair reorganizes the Lab into two macro regions with a flat, shadcn-like interaction model, adds a Fit scale and a Preview-local background/environment picker, and keeps the page bottom-right clear for a future real Agentation component. It remains UI-only, with no production or renderer changes.

## Goals

1. **Two macro regions only**: a dominant Main Workspace (vertical flow: Scenario Navigation rendered directly at the top → large Preview center → Preview/scene controls below) and a persistent right Dev Tools region using the same surface language. Do not render the `Ameow UI Lab` page title or a substitute title block.
2. **Flat scenario strip**: scenarios are flat buttons (no categories, no pill cloud, no selected underline, no click-residual outline that resembles selected); incompatible-with-target scenarios stay visible but disabled with a Full-only/Compact-only tag.
3. **shadcn-like interaction language**: distinct normal / hover / selected / focus-visible states on every interactive control, built from the repo's existing primitives; no new component system.
4. **Preview is the visual subject**: default display scale = Fit; Full/Compact in one segmented control; Fit/1x/2x/3x in another; Preview controls live below the Preview.
5. **Preview-local background/environment**: a tiny bottom-right Preview-local button opens a compact popover with Dark / Light / Checkerboard. Lab preview-environment state only, never production visual state.
6. **Persistent Dev Tools**: stays visible, uses the same surface language, shows concise human-readable scenario/target/scale/RM/facts; raw projection/WebGL/JSON stays in Advanced.
7. **Future Agentation clearance**: page-level Lab controls do not occupy the bottom-right fixed-overlay area where a future real Agentation component may render; no placeholder DOM, fake inspect button/UI, state, or authority.

## Non-Goals (hard)

- No production changes of any kind: no MR9 visuals, Product, lifecycle, native-window, production pointer, renderer, shader, `MainWindowPresentationSurface`, `CompactCatCharacter`, mascot architecture, or Agentation implementation.
- No generic Inspector; no generic parameter registry/framework; no second renderer/shader/canvas; no second Reduced-Motion authority.
- No new runtime dependency, no lockfile change, no `src/lab` import of Electron/desktop modules.
- No shadcn/Radix adoption unless a later review explicitly reverses the recommendation (research: high cost, not low).
- No Tailwind-in-Lab wiring (Lab entry stays self-contained; `index.css` remains production-only).
- No fake Agentation UI or empty placeholder/anchor this round.

## Acceptance Criteria

- A1. The Lab renders exactly two macro regions: Main Workspace + persistent Dev Tools. There is no left navigation region and no `Ameow UI Lab` page title; the flat Scenario Navigation is the first Main Workspace content.
- A2. Scenario strip is a single flat row of scenario buttons; no category pills/cloud; selected scenario has a distinct selected state and no underline/click-residual outline; incompatible scenarios are visibly disabled with the target tag.
- A3. Preview Target is a single segmented control (Full/Compact); Display scale is a single segmented control (Fit/1x/2x/3x); both live below the Preview with the other Preview controls.
- A4. Fit is the default adaptive mode and uses the Preview Workspace's current usable dimensions, after reasonable preview padding and safety margin, to produce the largest comfortable on-screen preview. Fit is not capped by the manual 3x option and may resolve above or below the fixed overrides as space requires. Implementation may bound it from actual layout measurements, but planning defines no numeric maximum. Logical geometry and export backing scale are unchanged.
- A5. A bottom-right Preview-local button opens a compact Dark/Light/Checkerboard popover; the chosen background renders only behind the on-screen Lab preview, never in production visual state or the existing Full PNG export contract; checkerboard is CSS-only.
- A6. Dev Tools remains visible across the supported desktop layout, uses the same surface language as Main Workspace, and shows concise human-readable scenario/target/scale/RM/facts; raw composed-input/WebGL JSON remains behind the Advanced disclosure. Narrow layouts may clamp region widths or scroll horizontally, but may not hide Dev Tools.
- A7. Every interactive control has distinct normal/hover/selected/focus-visible states consistent with the neon family and keyboard operability (Tab, arrows within segmented groups). Native outline suppression is permitted only while a visible custom `:focus-visible` ring is present; keyboard focus must not resemble persistent selection.
- A8. No Lab control occupies the page bottom-right fixed-overlay area; no Agentation placeholder, DOM anchor, UI, state, or inspection authority is added.
- A9. All v1 capabilities keep working and are unchanged in authority: one `ExpandedPresentationSurface`, Compact production leaf host, logical/display/export separation, single reduced-motion preview value, Advanced diagnostics boundary, Full 4x PNG export contract (`912x912`), production build isolation (`index.html` only, no Lab symbols in production bundle), `rendererReuse.test.ts` invariants.
- A10. Validation: focused Vitest suite passes; `npm run type-check` and `npm run lint` pass; production `npm run build` passes; Lab dev server runs; real-browser (Playwright/Edge) assertions pass (two regions, flat strip, Fit sizing, background picker, Dev Tools persistence, no console errors); `git diff --check` clean; no `src/lab` Electron/desktop imports; no package diff.
- A11. No task is archived; no Architecture PASS is claimed; the parent task stays `in_progress`.

## Constraints

- Planning-only for this task until review. No source/UI edits while planning.
- Preserve every v1 boundary listed in A9 and the research leaves.
- Reuse existing primitives (`NeonButton`, `NeonFieldButton`, `NeonDropdownField`, `getFieldSurfaceStyle`, `getSelectableOptionStyle`, `getPanelShellStyle`, `COMPACT_POPOVER_PRESENCE`); only add a segmented control and (if genuinely reusable) a popover, Lab-local or small shared additions.
- Replace the v1 narrow-window rule that hides Dev Tools with bounded desktop behavior that keeps both macro regions visible, using clamped widths and/or horizontal overflow without altering Preview geometry.

## Lead Overrides (2026-08-22, final Workspace pass) — supersede A4 and refine A1/A3/A5/A7/A9

These decisions were issued after the visual-fidelity pass and are implemented on top of the current uncommitted state. They do not restart planning and do not redesign the validated architecture.

1. **Exactly two primary visual surfaces**: one unified Workspace Shell + persistent Dev Tools.
2. **Workspace Shell = one outer boundary + one surface language, three internal regions**: Header (centered, spacious, small scenario set; no separate large card), Body (dominant Preview with comfortable breathing room; no mismatched large card boundary), Footer (Target / Auto/1x/2x/3x / only applicable context actions, organized with spacing, hairline dividers, and lightweight field surfaces — NOT three large cards).
3. **Fit renamed to Auto**: Auto is default and resolves to the largest comfortable member of {1, 2, 3} that fits the measured stage; never below 1, never above 3. Manual 1x/2x/3x remain overrides. Metadata reads like “自动 · 2×” (integer), never a continuous decimal. Logical geometry and export/backing scale unchanged.
4. **Low-weight circular Reset icon** in a Preview corner with native/title tooltip + accessible label; reuses current Lab state/actions; reset narrowly = restore the current preview/scenario to baseline (re-apply scenario, recenter origin, Reduced Motion off); no new authority.
5. **Conditional origin marker**: visible only for origin-relevant Full scenarios (Intake) or while actively editing origin; hidden for Heatmap / Download / Transcode / Mixed / Compact. Lab chrome only; no production rendering change.
6. **Replay and Export secondary**: remove the persistent orange Export hierarchy; success feedback lightweight and temporary (not a primary CTA).
7. **Dev Tools** stays the second first-level surface with the same page/surface/background/typography/spacing language; human-readable facts primary; raw JSON/WebGL/projection stays Advanced.

New acceptance criteria replacing A4 (and extending A1/A3/A5/A7/A9):
- A4′. Auto is default; `LabDisplayScale = "auto" | 1 | 2 | 3`; Auto resolves only to {1,2,3} (largest comfortable that fits, bounded by the breathing margin + safety floor), never below 1 or above 3; metadata integer (“Auto · 2×”).
- A1′. Workspace Shell carries `data-lab-workspace-header` (the first content, same element as the scenario strip), `data-lab-workspace-body` (the stage viewport), and `data-lab-workspace-footer` (grouped controls + caption) markers.
- A3′. Footer groups are hairline-divided labeled rows (lightweight field surfaces), not three large cards; Reset button present with `data-lab-reset`, `title`, `aria-label`; Export uses the quiet chip language.
- A5′. Origin marker (`data-lab-chrome`) rendered only when `originMarkerVisible` (Intake or origin editing), Lab-only.
- A7′. Export success feedback stays temporary (EXPORT_FEEDBACK_MS) and secondary; no persistent orange export button.
