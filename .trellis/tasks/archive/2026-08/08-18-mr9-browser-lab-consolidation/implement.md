# Implementation Plan

## Preconditions

- GPT Architecture Lead approves the current PRD and technical design.
- A later user message explicitly authorizes `task.py start` and implementation.
- Continue in `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`; do not create another worktree or change authority.
- Preserve the current Thermal shader/defaults and all unrelated MR9 validation artifacts.

## Phase 1. Freeze Baselines and Consumers

- [ ] Record authoritative branch/HEAD and dirty artifact inventory without cleaning it.
- [ ] Capture the seven legacy UI Lab visual states as comparison evidence before removal.
- [ ] Reconfirm every consumer of `/ui-lab`, `openUiLab`, `dev_ui_lab_apply_scenario`, UI Lab reset/override/lifecycle state, and docs screenshot hooks.
- [ ] Add static architecture tests asserting that the Browser Lab remains independent of Electron/desktop runtime and production build inputs.

Rollback point: no production behavior changed.

## Phase 2. Chinese-First Lab Shell

- [ ] Initialize Lab i18n directly with `zh-CN` and no desktop bridge.
- [ ] Add paired `lab` locale resources and register the namespace only for the Lab entry.
- [ ] Reorganize the left preset navigation into the six approved categories.
- [ ] Keep the center preview and right Inspector compact, scenario-specific, keyboard accessible, and production-token based.
- [ ] Preserve all existing MR9 scenario behavior and tests.

Validation: Chinese-first browser startup, locale parity, keyboard/focus checks, reload, HMR, and production bundle exclusion.

Rollback point: existing Browser Lab behavior remains available behind the same entry.

## Phase 3. Extract Shared Production Presentation UI

- [ ] Identify the exact App-owned inline JSX for primary progress pill, queue badge/popover rows, runtime indicator, and center outcome overlay.
- [ ] Extract one browser-safe presentational component per real existing visual responsibility; avoid umbrella view models and generic component systems.
- [ ] Move only pure progress-formatting helpers required by those components.
- [ ] Replace App inline rendering with the shared components while retaining all App subscriptions, commands, refs, timers, and lifecycle ownership.
- [ ] Add component tests proving equivalent props, text, progress, z-index/pointer behavior, and accessibility output.

Validation: existing App suites, architecture import guards, focused component snapshots, and before/after visual comparison.

Rollback point: component extraction can be reverted independently of scenario migration.

## Phase 4. Migrate the Seven Scenarios

- [ ] Define a minimal discriminated `LabScenario` fixture model for Runtime, Download, Transcode, and Mixed states.
- [ ] Map fixtures into existing production state/payload types, then use the applicable pure selectors/helpers/projections without replaying event ingestion solely for preview.
- [ ] Add `runtime-auto-config` and `runtime-failed` using production runtime helpers and shared indicator.
- [ ] Add `download-active` and `download-queued` using Download selectors, shared queue UI, and production progress projection.
- [ ] Add `transcode-active` and `transcode-failed` from typed transcode payload snapshots using production helpers, `CircularProgressIndicator`, shared rows, and `ForegroundOutcomeOverlay`.
- [ ] Add `mixed-busy` by composing the same Download and Transcode paths.
- [ ] Make production command affordances disabled/no-op in Lab without importing bridge code.
- [ ] Add Reduced Motion coverage across relevant categories.

Validation: unit tests for fixture-to-production-input mapping and live browser assertions for all seven scenes. Reject synthetic command buses, registries, or duplicate business state.

Rollback point: each category can be reverted without affecting production authority or other categories.

## Phase 5. One-Click 4x PNG Export

- [ ] Add a small feasibility test for capturing the existing preview root, WebGL canvas, and DOM overlays at 4x.
- [ ] Prefer a browser-native implementation. If it fails the composite/fidelity checks, document the failure and add one focused dev-only rasterizer only.
- [ ] Add `导出 4× PNG` to the center preview toolbar.
- [ ] Hold the current synthetic fixture stable, render the same preview at export resolution, wait for fonts/WebGL, rasterize, download, and restore in `finally`.
- [ ] Derive the filename from the active scenario.
- [ ] Add busy/success/failure feedback and guard repeated clicks.
- [ ] Verify export never creates a second Presentation renderer/canvas and never changes Inspector/scenario state.

Validation: 912x912 transparent output for the 200x200 preview plus 14px gutter per side, 800x800 content at a 56px backing-pixel inset, nonblank pixels, readable Chinese, rounded-corner/shadow alpha, DOM/WebGL composition, cross-DPR geometry, animation-frame capture, state restoration, repeated export, and production bundle exclusion.

Rollback point: export is Lab-local and can be removed without affecting preview rendering.

## Phase 6. Replace Documentation Screenshot Workflow

- [ ] Export the required Download-active and Transcode-active production previews from Browser Lab using scenario-derived filenames.
- [ ] Confirm the new framing and resolution are accepted for documentation assets.
- [ ] Update any contributor instructions that reference the legacy screenshot script.
- [ ] Remove `scripts/capture-docs-screenshots.mjs` and the Electron docs screenshot mapping/apply/delay path once no consumer remains.
- [ ] Run the docs build if repository documentation or assets change.

Rollback point: do not delete the old screenshot path until the exported assets and docs workflow are accepted.

## Phase 7. Retire Legacy Settings/Electron UI Lab

- [ ] Remove the Settings developer entry and UI Lab prefetch.
- [ ] Remove `UiLabPage`, its dev route, and secondary-route registration.
- [ ] Remove Electron UI Lab window routing, metrics, preload exposure, and bridge label/types.
- [ ] Remove the scenario controller, `dev_ui_lab_apply_scenario`, App reset/preview state, runtime overrides, and `uiLab` lifecycle lock.
- [ ] Remove obsolete locale keys and dedicated tests with their owning paths.
- [ ] Preserve generic Electron infrastructure and production runtime/download/transcode logic.
- [ ] Run a zero-reference audit for all retired names and files.

Rollback point: perform retirement as one reviewable stage after Browser parity; revert the stage as a unit if any consumer was missed.

## Phase 8. Full Validation and Stop

- [ ] Run focused Lab, Presentation, Download, Transcode, Runtime, lifecycle, window-routing, i18n, and docs tests.
- [ ] Run `npm run type-check`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build` and confirm production `dist/` has no Lab or screenshot code.
- [ ] Run the Browser Lab Playwright suite for Chinese startup, all categories, one-canvas/program reuse, origins, Replay, progress semantics, Reduced Motion, export, reload, and HMR.
- [ ] Run Electron integration smoke checks for real IPC/native/window authority without restoring any preview override.
- [ ] Run `git diff --check` and audit the final dirty-file scope.
- [ ] Return implementation and validation reports, then stop for user/GPT review.

Do not tune Thermal FX, repair downloader environments, delete validation junctions, merge/archive MR9, or enter another MR.

## Review Gates

1. Architecture approval before `task.py start`.
2. Shared-component extraction parity before adding migrated fixtures.
3. All seven Browser scenarios and screenshot export accepted before legacy deletion.
4. Documentation screenshot replacement accepted before deleting the old script/hook.
5. Zero-consumer evidence and full validation before reporting retirement complete.

## Follow-up round (lead review): three user-observed export defects — DONE

- Removed the lower-left "200×200" debug label from the preview and from exports (`LabOverlayStage.tsx` + `sizeLabel` locale key deleted).
- Export button returns to idle ~2 s after success OR failure (`EXPORT_FEEDBACK_MS` timer, cancelled up front on re-export, cleaned on unmount); repeated exports keep working; no permanent success/loading label.
- Export is now a transparent 912×912 PNG: content 200×200 at a 56 backing-px inset, 14 CSS px symmetric gutter per side = `MAIN_WINDOW_FULL_SHADOW_GUTTER` (the production shadow gutter), rounded shell at the preview's real border-radius. The shared `panelShadow` token is reproduced with Canvas2D native shadow API (html2canvas external box-shadow is broken: offset-10000 + clipped) via a narrow adapter that fails loudly on unsupported layer syntax. Panel backdrop fill + WebGL + DOM composite inside the rounded clip; `ExportLayerFailure` now covers webgl/dom/shadow.
- Durable validation strengthened → 70/70 (alpha-bounds audit incl. transparent-exterior + nonzero-shadow-outside-shell, badge landmark at live+gutter in 912-space and 228-downsample, success/failure feedback lifecycle + repeatability + no-partial-download, failure contract incl. unsupported-shadow, DPR 2/1.25 exact 912).
- Evidence regenerated at the new transparent contract; `validation-report.md` updated; gates re-run (tsc/lint/build/docs/vitest 1694 pass/1 baseline-unrelated/live 70/70/git diff --check exit 0).
