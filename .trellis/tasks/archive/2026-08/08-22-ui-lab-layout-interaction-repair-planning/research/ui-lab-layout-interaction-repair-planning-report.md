# UI Lab Layout & Interaction Repair — Planning Report

Date: 2026-08-22 · Task: `08-22-ui-lab-layout-interaction-repair-planning` (planning, child of `08-22-ui-lab-refresh-planning`).
Scope: PLANNING ONLY. No source/UI implementation, no `task.py start`, no archive, no Architecture PASS, no Agentation implementation.

## 1. Baseline & task relationship
- Baseline: validated UI Lab Refresh v1 checkpoint `25040db9ab7887444010a70d43cd537331286721` (`feat(lab): checkpoint presentation playground v1`).
- New task: `.trellis/tasks/08-22-ui-lab-layout-interaction-repair-planning/task.json` with `parent: "08-22-ui-lab-refresh-planning"`; parent `task.json` `children` lists the new task. Parent stays `in_progress`/unarchived; new task stays `planning`.

## 2. Decision: reuse existing primitives, do NOT adopt shadcn
- Evidence (research/shadcn-adoption-cost.md): `components.json` absent; zero `@radix-ui/*` deps; no `lucide-react`; Tailwind v4 exists but `index.css` is imported only by production `main.tsx`, NOT the Lab entry — adopting Tailwind utilities in the Lab requires wiring `index.css` into `lab-main.tsx` (boundary change pinned by `rendererReuse.test.ts`); every neon surface uses inline theme-token styles, so shadcn would create a second design language.
- The repo already ships a shadcn-like model: `getFieldSurfaceStyle` (normal/hover/selected/focus via `active`+`highlighted`), `getSelectableOptionStyle` (accent selected), `getPanelShellStyle`, `NeonButton`/`NeonFieldButton`/`NeonDropdownField`, `COMPACT_POPOVER_PRESENCE`, `COMPACT_EASE`.
- Missing pieces are small: a Lab-local segmented control (built from `getFieldSurfaceStyle`/`getSelectableOptionStyle`) and a background popover reusing the dropdown pattern. A small Lab-local `:focus-visible` treatment is sufficient; do not expand the production component system without a second consumer.

## 3. Fit / background state ownership
- `displayScale: "fit" | 1 | 2 | 3` and `previewBackground: "dark" | "light" | "checkerboard"` are Lab-local `PresentationLab` UI state, never scenario/reducer/production/renderer state. Fit derives the largest comfortable continuous display scale from the measured Preview Workspace after reasonable padding/safety margin. It is independent of, and not capped by, the manual 3x override; planning defines no numeric maximum. Background is a screen-only chrome layer; logical geometry and the Full 4x export contract (`912x912`) remain independent and unchanged.

## 4. Flat scenario interaction states
- The rendered page has no `Ameow UI Lab` title, subtitle, or replacement heading block. Flat Scenario Navigation is the first Main Workspace content, preserving vertical space for the Preview.
- Flat scenario buttons (no category pills/cloud, no underline-as-selected, no click-residual outline): selected = `getSelectableOptionStyle(active)` accent; hover = field-surface highlight; keyboard focus-visible = a separate custom ring. Native outline is removed only when that ring is visible. Disabled target-incompatible items keep the Full-only/Compact-only tag. `aria-pressed` remains the toggle semantic; `LAB_CATEGORY_TARGET_AVAILABILITY` remains the compatibility authority.

## 5. Shared surface language
- One surface language across Main Workspace and persistent Dev Tools: same panel background/radius/typography/interaction tokens (shared-styles factories + theme tokens). Dev Tools stays visible; the v1 narrow rule that hides it is replaced by clamped widths and horizontal overflow below the supported desktop minimum. Human-readable scenario/target/scale/RM/facts stay primary; raw composed-input/WebGL/scale-facts JSON stays behind `data-lab-advanced`.

## 6. Retained v1 boundaries (A9)
- Exactly one `ExpandedPresentationSurface`; Compact hosts the production `CompactCatCharacter` leaf; zero `<canvas` in lab sources; browser-safe imports; `rendererReuse.test.ts` invariants; logical/display/export scale separation; single derived reduced-motion value; Advanced diagnostics boundary; Full 4x PNG export contract; production build isolated to `index.html` (no Lab symbols in production bundle); no `src/lab` Electron/desktop imports; no dependency/lockfile diff; no MR0 pointer-field-writer collisions (Lab keeps its own `compactPointerField.ts` helpers).

## 7. Agentation
- Not implemented. No placeholder DOM, fake inspect button/UI, state, or authority is planned. Page-level Lab controls simply avoid the viewport bottom-right fixed-overlay area; a real integration is deferred until its license, hit-test, and layering proof is available.

## 8. Artifacts & validation status
- New task dir: task.json, prd.md, design.md, implement.md, research/ (6 leaves + this report). implement.jsonl / check.jsonl are curated seeds.
- Planning artifact validation runs after the final correction pass. Product command validation (Vitest/type-check/lint/build/Playwright) belongs to the later implementation phase and is listed in `implement.md`.

## 9. Checkpoint

- Complete at `25040db9ab7887444010a70d43cd537331286721`.
- Planning artifacts remain separate from that implementation checkpoint.

## 10. Status summary
- Checkpoint: complete. New task: `planning`, linked as child. Old task: `in_progress`, not archived. The post-checkpoint diff is planning-only under `.trellis/`; no UI implementation has begun.
