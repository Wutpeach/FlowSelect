# Implement — UI Lab Layout & Interaction Repair

Status: `in_progress` (final Workspace Shell pass implemented and Lead-validated 2026-08-23; see research/ui-lab-final-workspace-repair-report.md). Baseline: validated UI Lab Refresh v1 checkpoint commit `25040db9ab7887444010a70d43cd537331286721`. All paths relative to `src/lab/` unless noted.

## Phase 0 — Checkpoint (complete)
- The validated v1 baseline is committed as `25040db9ab7887444010a70d43cd537331286721` (`feat(lab): checkpoint presentation playground v1`).
- The parent task's `children` link and this planning task remain post-checkpoint planning metadata. Do not mix later implementation into the v1 checkpoint.

## Phase 1 — Scales + Auto (previewTargets.ts, tests) — SUPERSEEDED by Lead Override (Auto)
- `LabDisplayScale = "auto" | 1 | 2 | 3`; `LAB_DISPLAY_SCALES = ["auto", 1, 2, 3]`; `LAB_DISPLAY_SCALE_DEFAULT = "auto"`; `LAB_AUTO_SCALE_OPTIONS = [1, 2, 3]`.
- Pure `resolveLabAutoDisplayScale(viewportWidth, viewportHeight, logicalSize)` returns `1 | 2 | 3`: usable = `min(vw,vh) × (1 − 2×LAB_AUTO_BREATHING_RATIO) − LAB_AUTO_SAFETY_PADDING`; picks the LARGEST member of {1,2,3} whose `logicalSize × scale` fits; never below 1, never above 3; non-finite/empty geometry → 1. Explicit 1x/2x/3x values pass through unchanged. No continuous scale, no `toFixed` metadata.
- Tests: default Auto; largest-comfortable resolution; integer at desktop stage; never above 3; never below 1; guards → 1; breathing-ratio bounds.

## Phase 2 — Preview background/environment (new Lab-local)
- New `previewEnvironment.ts`: `LabPreviewEnvironment = "dark" | "light" | "checkerboard"`, `LAB_PREVIEW_ENVIRONMENTS`, `LAB_PREVIEW_ENVIRONMENT_DEFAULT = "dark"`, and a CSS builder `resolveLabPreviewEnvironmentStyle(env)` returning a screen-only chrome background style (checkerboard via `repeating-conic-gradient`, CSS-only, `pointer-events: none`). Pure + tested.
- Never reaches `ExpandedPresentationSurface`, `CompactCatCharacter`, theme, Product state, or the Full PNG export capture root. Preserve the v1 `912x912` export contract independently of the selected environment.

## Phase 3 — Segmented control + interaction model (new Lab-local)
- New `SegmentedControl.tsx`: `role="group"` + `aria-pressed` buttons, arrow-key roving (Tab into group, ←/→ move, Home/End), states from `getFieldSurfaceStyle` + `getSelectableOptionStyle` accent, and a custom keyboard `:focus-visible` ring distinct from selected. Suppress native outline only while that visible ring is active. Promote to `src/components/ui` ONLY if a second consumer appears.
- Apply to Target (`full | compact`) and Scale (`fit | 1x | 2x | 3x`); both Lab-local UI state in `PresentationLab` (v1 ownership unchanged).
- Upgrade remaining Lab buttons (Replay/Export/Reset, strip chips, Dev Tools controls) to the neon focus/hover/selected model via shared-styles factories; remove native-outline leaks.

## Phase 4 — Layout (PresentationLab.tsx, LabOverlayStage.tsx, CompactPreviewStage.tsx)
- Two macro regions: `MAIN_STYLE` (flex 1, column) + persistent `DEVTOOLS_STYLE` (same surface). Remove the separate `<nav>` region and do not render `appTitle`/`appSubtitle` or any `Ameow UI Lab` replacement title. Flat Scenario Navigation becomes the first Main Workspace content.
- Main flow: flat scenario strip (top) → stage (center, Fit-aware, environment layer) → below-preview controls row (Target seg, Scale seg, meta, Full-only Replay/Export). Add no Agentation placeholder; keep page-level Lab controls away from the viewport bottom-right fixed-overlay area.
- Dev Tools: concise human-readable rows (scenario/target/scale/RM/facts) + RM toggle; raw JSON stays in `data-lab-advanced` `<details>`.
- Replace the `lab.css` rule that hides Dev Tools at `≤1080px` with clamped Main/Dev Tools widths and a documented desktop minimum; below that minimum, allow horizontal page overflow. Keep `data-lab-workspace`/`data-lab-devtools`/`data-lab-stage-viewport`/`data-lab-preview-frame`/`data-lab-compact-stage` markers for tests/Playwright.

## Phase 5 — Locales + renderer reuse invariants
- `locales/en.json` + `zh-CN.json`: new keys (fit/scale, environment picker, strip, controls) — full `t()` coverage, valid JSON.
- `rendererReuse.test.ts`: add new lab sources to `labSources`; keep one-`ExpandedPresentationSurface`/no-`<canvas`/browser-safe assertions; add two-region + env-layer structural checks.

## Phase 7 — Final Workspace Shell pass (Lead Override 2026-08-22)
- PresentationLab.tsx: Workspace Shell markers `data-lab-workspace-header` (same element as `data-lab-scenario-strip`, stays FIRST content), `data-lab-workspace-body` (same element as `data-lab-stage-viewport`), `data-lab-workspace-footer` (wraps `data-lab-control-groups` + caption).
- Footer: remove per-group `getFieldSurfaceStyle` card surfaces; hairline divider + spacing between the three labeled groups (lightweight field surfaces = the segmented chips themselves). Dev Tools sections use the same hairline-divided language.
- Auto wiring: `effectiveScale` = `displayScale === "auto" ? resolveLabAutoDisplayScale(...) : displayScale`; `scaleLabel` = `t("workspace.auto", { scale })` (integer); segment id `auto`.
- Reset: `getLabResetButtonStyle(colors)` circular button at Preview top-left with `data-lab-reset`, `title`, `aria-label`; `handleReset` = re-apply current scenario + `setPointerOrigin(NEUTRAL_PRESENTATION_ORIGIN)` + `setReducedMotion(false)` + close queue — existing reducer actions only.
- Origin marker: `originMarkerVisible` prop on `LabOverlayStage`; marker rendered only when true; `originMarkerVisible = target === "full" && (activeScenarioId === "intake" || originInputFocused)` (origin inputs onFocus/onBlur).
- Export: quiet `getLabChipStyle` chip (no orange `EXPORT_BUTTON_STYLE`); success feedback stays temporary.
- Locales: `workspace.auto`/`autoLabel`/`reset`/`resetHint` (en + zh-CN), remove `fit`/`fitLabel`.
- rendererReuse.test.ts: new assertions for the three-region markers, Auto rename, conditional origin marker, Reset affordance, secondary Export.

## Phase 6 — Validation
- Complete 2026-08-23: focused Lab Vitest 118/118; type-check, lint, production build, diff check, package/lockfile isolation, and real-browser Playwright/Edge validation passed. Full suite is 1822/1823 with only the pre-existing Windows CRLF-sensitive `browser-extension/architecture-guard.test.js:277` assertion failing. See the implementation report and browser result artifact.
- Do NOT run `task.py start`; do NOT archive; do NOT claim Architecture PASS.

## Acceptance mapping (prd A1–A11)
- A1/A2: Phase 4 strip + two regions. A3/A4: Phases 1/3. A5: Phase 2. A6: Phase 4 Dev Tools. A7: Phase 3. A8: Phase 4 bottom-right clearance without a placeholder. A9: Phases 4/5 invariants. A10: Phase 6. A11: status guard.
