# Implementation Report — UI Lab Final Workspace Shell Repair (Lead Override pass)

- Task: `ui-lab-layout-interaction-repair-planning` (status `in_progress`)
- Baseline: current uncommitted state (visual-fidelity pass, browser-validated by Lead: two regions, 5-scenario strip, fill 0.815, 912×912 export, 1/0 canvas, focus-visible, no console errors)
- Branch/worktree: `planning/ui-lab-refresh` @ `D:\Ameow\.cindy-worktrees\ui-lab-refresh-planning`
- Date: 2026-08-23
- Implementation: Orca worker `kth8r8qhn3qk7vbzu23yvor7`
- Simplification, automated validation, and browser visual review: Cindy Lead

## Scope

Small, Lab-only implementation of the Lead's final Workspace decisions on top of the current uncommitted state. No architecture change: Full + Compact renderer reuse, one `ExpandedPresentationSurface`, zero Compact canvas, one Reduced Motion authority, Background isolation, 912×912 Full export, production build isolation, no MR9/renderer/lifecycle/Product/native-window/mascot changes, no dependency/lockfile change, no shadcn/Agentation/generic-inspector/registry/plugin, no page title, no fake Inspect UI, no empty control group. No commits, no archive, no Architecture PASS claim.

## Lead decisions → implementation mapping

| # | Decision | Implemented in |
|---|----------|----------------|
| 1 | Exactly two primary surfaces (Workspace Shell + Dev Tools) | unchanged `main`/`aside`; same surface language preserved |
| 2 | Workspace Shell three regions, one outer boundary, no three large cards | `data-lab-workspace-header` (on the scenario-strip element, stays FIRST content), `data-lab-workspace-body` (stage viewport), `data-lab-workspace-footer` (wraps `data-lab-control-groups` + caption); per-group `getFieldSurfaceStyle` card removed → hairline dividers + spacing (chips remain the lightweight field surfaces) |
| 3 | Fit → Auto; discrete {1,2,3}, never <1 or >3; integer metadata | `previewTargets.ts`: `LAB_DISPLAY_SCALES = ["auto",1,2,3]`, default `"auto"`, `LAB_AUTO_SCALE_OPTIONS=[1,2,3]`, `resolveLabAutoDisplayScale` (pure, largest comfortable member ≤ usable, guards→1); `PresentationLab`: `scaleLabel = t("workspace.auto", { scale })` integer, no `toFixed` |
| 4 | Low-weight circular Reset in a Preview corner (tooltip + accessible label), existing state/actions only | `getLabResetButtonStyle` circular button at stage top-left (`data-lab-reset`, `title`, `aria-label`); `handleReset` = re-apply current scenario + `setPointerOrigin(NEUTRAL_PRESENTATION_ORIGIN)` + `setReducedMotion(false)` + close queue — existing reducer actions only |
| 5 | Conditional origin marker | `LabOverlayStage` new required `originMarkerVisible` prop; marker rendered only when true; `originMarkerVisible = target === "full" && (activeScenarioId === "intake" || originInputFocused)` (origin inputs onFocus/onBlur) |
| 6 | Replay + Export secondary; no persistent orange Export | orange `EXPORT_BUTTON_STYLE`/`EXPORT_BUTTON_DISABLED_STYLE` removed; export now a quiet `getLabChipStyle` chip; success feedback stays temporary (`EXPORT_FEEDBACK_MS`) |
| 7 | Dev Tools same language; sections hairline-divided like the footer | `devToolsSectionStyle` drops the per-section field-surface card; uses the same hairline divider + spacing |

## Changed files

- `src/lab/previewTargets.ts` — Auto model (rename + discrete resolver).
- `src/lab/previewTargets.test.ts` — Auto tests: default Auto; largest-comfortable resolution (1200×800/80→3, 900×700/200→2, 200×200/200→1); desktop integer (1122×521 → Full 2×, Compact 3×); never >3 (1600×1000/80→3, 2000×1400/200→3); never <1 (160×140/200→1, 100×200/200→1); guards→1; ratio bounds.
- `src/lab/PresentationLab.tsx` — three-region markers, footer/DevTools hairline dividers, Auto wiring, Reset, conditional origin marker, secondary export, header/footer doc updates.
- `src/lab/LabOverlayStage.tsx` — `originMarkerVisible` prop + conditional `data-lab-chrome` marker.
- `src/lab/rendererReuse.test.ts` — new assertions: three-region markers (incl. strip=header first content, body=stage, footer wraps controls), Auto rename (no stale `fit`, no `toFixed`), conditional origin marker, Reset affordance, secondary Export (no `EXPORT_BUTTON_STYLE`, no `#b56a4a`).
- `src/lab/locales/en.json` + `zh-CN.json` — `workspace.auto` / `autoLabel` / `reset` / `resetHint`; removed `fit`/`fitLabel`; valid JSON, mirrored.
- `.trellis/tasks/08-22-ui-lab-layout-interaction-repair-planning/prd.md` — Lead Overrides section (supersedes A4; adds A1′/A3′/A5′/A7′).
- `.trellis/tasks/08-22-ui-lab-layout-interaction-repair-planning/design.md` — section 4 → Auto model; new section 5 Final Workspace Shell pass; renumbered.
- `.trellis/tasks/08-22-ui-lab-layout-interaction-repair-planning/implement.md` — Phase 1 superseded by Auto; new Phase 7; status updated.
- `.trellis/tasks/08-22-ui-lab-layout-interaction-repair-planning/artifacts/validate-final-repair.cjs` — new Playwright/Edge validation script for the Lead (asserts every decision + captures `final-layout-repair-{full,compact,export}.png` + `browser-final-repair-result.json`).

## Validation

### Lead automated checks (2026-08-23)

- `npm run test -- --run src/lab`: PASS, 11 files / 118 tests.
- `npm run type-check`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS, including locale sync, renderer production build, and Electron build.
- Production bundle isolation: PASS; built assets contain none of `PresentationLab`, `data-lab-workspace`, `LAB_DISPLAY_SCALES`, or `PreviewEnvironmentPicker`.
- `git diff --check`: PASS.
- `package.json` / `package-lock.json`: no diff.
- Production source outside `src/lab`: no task diff from checkpoint `25040db9`.
- Full repository `npm test`: 1822/1823. The sole failure remains the pre-existing Windows CRLF-sensitive assertion at `browser-extension/architecture-guard.test.js:277`; this task does not modify that file or runtime path.

The Lead simplification pass found and repaired one brittle static test that coupled the Workspace Footer assertion to exact JSX line wrapping. It now checks marker order/containment instead; no product behavior changed.

### Real Edge / Playwright validation (1600×900)

- Script: `artifacts/validate-final-repair.cjs`.
- Result: PASS with no console or page errors; raw result stored in `artifacts/browser-final-repair-result.json`.
- Exactly two first-level surfaces; Workspace 1152px wide, Dev Tools 384px wide, identical computed surface color.
- Workspace Header/Body/Footer markers resolve to the scenario strip, stage viewport, and grouped footer; five scenario buttons remain on one row with exactly one selected.
- Full Auto resolves to 2× (400px preview; stage fill ratio 0.684), preserves 200px logical CSS geometry, and mounts exactly one canvas.
- Compact Auto resolves to 3× (240px displayed host), preserves 80px outer / 60px shell geometry, mounts zero canvases, and shows exactly one target/scenario selection.
- Auto metadata is integer (`自动 · 2×`); no continuous decimal scale appears.
- Reset has title + accessible label and recenters origin X to 0.5.
- Origin marker appears for Intake and while editing origin; it is absent for Heatmap, Download, Transcode, Mixed, and Compact.
- Background popover switches the screen-only environment without wrapping the Full export capture root.
- Export remains visually secondary, produces 912×912 PNG, and returns from success feedback to its idle label after the bounded interval.
- Keyboard focus-visible ring is present; Advanced Diagnostics starts collapsed.
- Final screenshots: `artifacts/final-layout-repair-full.png` and `artifacts/final-layout-repair-compact.png`.

## Remaining visual differences vs reference (intentional)

- Header keeps 5 curated selectors (Intake/Heatmap/Download/Transcode/Mixed) vs the reference's 4 — preserves the capability set, still calm.
- Footer groups carry the repo's quiet uppercase labels + hairline dividers (the reference shows a flatter mock layout); segmented controls are the repo field-surface language.
- Dev Tools keeps origin + determinate slider + RM checkbox (validated capabilities); reference mock omits some.
- Compact row only on the Compact target; reference is Full-only.

## Stop state

Child task remains `in_progress`; no commit, archive, or Architecture PASS claim. Implementation changes remain Lab-local plus task docs/artifacts; production architecture and package manifests are untouched.

## Remaining visual differences

1. The final shell intentionally keeps five curated Full scenarios rather than the reference's four, so Download remains directly reachable without reintroducing a dense scenario cloud.
2. Auto is now discrete by requirement. At 1600×900 Full resolves to 2×, visibly smaller than the old continuous Fit mock, while Compact reaches the 3× ceiling.
3. Dev Tools retains the validated origin, determinate-progress, and Reduced Motion controls; it is denser than the visual reference but now shares the Workspace surface, divider, spacing, and typography language.
4. The final screenshots show the valid Light preview environment selected during background isolation validation; this does not change the surrounding Workspace/Dev Tools surface language or production renderer state.
