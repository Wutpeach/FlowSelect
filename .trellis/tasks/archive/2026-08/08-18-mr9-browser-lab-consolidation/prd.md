# MR9 Browser Lab Consolidation and Legacy UI Lab Retirement

## Goal

Make the dev-only Browser Presentation Lab Ameow's single visual and state playground. Migrate the useful visual intent of the legacy Electron UI Lab into browser-accessible production previews, default the Lab to Chinese, add one-click high-resolution preview export, and fully retire the Settings/Electron UI Lab after parity and dependency validation.

## User Value

- Visual inspection no longer depends on Electron, downloader runtimes, Python, ffmpeg, deno, or the Browser Extension.
- One place exposes MR9 Presentation effects and the main runtime/download/transcode states developers actually need to inspect.
- A clean 4x PNG can be exported directly from the production-like preview for visual review and documentation.
- Legacy preview overrides no longer mutate the live application event stream or keep hidden compatibility infrastructure alive.

## Background and Confirmed Repository Facts

- The authoritative implementation remains `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx` on `motion/mr9-fullscreen-activation-fx`; no new worktree is required.
- The existing Browser Lab already mounts the production `ExpandedPresentationSurface`, runtime, WebGL2 program, targets, and `THERMAL_PALETTE` through `lab.html` and `vite.lab.config.ts`.
- `src/App.tsx` cannot be mounted in a pure browser because it imports `src/desktop/runtime.ts`; several useful main-window visual subtrees remain inline in `App.tsx`.
- The legacy `src/pages/UiLabPage.tsx` drives seven scenarios through `dev_ui_lab_apply_scenario`, Electron main-process overrides, App lifecycle locks, and live application events.
- `scripts/capture-docs-screenshots.mjs` is the remaining non-page consumer of `dev_ui_lab_apply_scenario` through Electron screenshot hooks.
- Browser-safe production logic already exists in `src/features/download/`, `src/presentation/main-window/`, `src/utils/downloadEventReducers.ts`, `src/utils/downloadViewHelpers.ts`, and `src/utils/runtimeDependencyGate.ts`.
- The repository currently has Playwright for validation but no browser DOM screenshot/rasterization dependency.
- The current Thermal Activation appearance has been rejected for later visual repair. This task must not tune or replace the shader.

## Requirements

### R1. Single Dev Playground

- Browser Lab becomes the only dev visual/state playground.
- It remains a dev-only harness and must stay excluded from the production Electron renderer/package.
- The existing Settings UI Lab stays operational until Browser coverage, screenshot export, and retirement validation are complete.

### R2. Production Rendering Reuse

- Synthetic Lab fixtures must be expressed as existing production model/payload types, then flow through the applicable production selectors, helpers, projections, Presentation targets, and UI components before rendering. A fixture need not replay the production event-ingestion reducer when its visual contract begins from an already-typed state snapshot.
- The Lab must continue to mount the one production `ExpandedPresentationSurface`, runtime, and WebGL2 program.
- Inline stateless UI in `App.tsx` may be mechanically extracted so App and Lab share one implementation.
- The task must not copy renderer JSX, shaders, runtime code, queue formatting, or state projection logic.

### R3. Scenario Coverage

The Browser Lab must cover the visual intent of:

- `runtime-auto-config`
- `runtime-failed`
- `download-active`
- `download-queued`
- `transcode-active`
- `transcode-failed`
- `mixed-busy`

It must retain the existing MR9 Fullscreen Activation, Download/Progress, trace revision/replacement, Replay, origin, and Reduced Motion scenarios.

### R4. Synthetic Authority Boundary

- Lab state is transient, in-memory preview input only.
- Static typed fixtures start from production `DownloadQueueState`, runtime-gate payloads, or transcode payload snapshots and then use the applicable pure production selectors/helpers/projections. The seven migration scenarios do not justify a synthetic command bus or second controller/state machine.
- The Lab must not write real Product, Download, Transcode, lifecycle, config, or durable queue state.
- It must not call Electron download/transcode/runtime commands or `dev_ui_lab_apply_scenario`.
- Interactive production commands shown in a preview must be absent, disabled, or Lab-local no-ops with no bridge calls.

### R5. Chinese-First Information Architecture

- Default language is `zh-CN`, resolved without Electron config or desktop bridge.
- The Lab keeps a compact Three-pane structure: categorized presets on the left, production-like preview in the center, and scene-specific Inspector controls on the right.
- Categories include Fullscreen Activation, Download/Progress, Runtime, Transcode, Mixed/Busy, and Reduced Motion.
- Production strings reuse existing browser-compatible locales; Lab chrome uses a dedicated Lab namespace rather than legacy `settings.uiLab.*` keys.

### R6. High-Resolution Preview Export

- A visible `导出 4× PNG` action exports only the center production preview, not Lab navigation or Inspector chrome.
- A 200x200 preview exports with the production 14px shadow gutter on every side: the 228x228 CSS-pixel capture becomes a 912x912 transparent PNG at 4x, preserving rounded corners and shadow without clipping.
- Export uses the existing single production preview and must not mount a second Presentation renderer or second WebGL canvas.
- The default filename identifies the active scenario and scale.
- Export is ephemeral, does not persist settings, and restores the exact Lab state after success or failure.
- WebGL and DOM overlays must be composited in the exported PNG. A single focused dev-only rasterizer is permitted only if a browser-native spike proves insufficient; no screenshot framework or server is allowed.

### R7. Legacy Retirement

After migration parity is accepted, remove the Settings entry, `/ui-lab` page/route, Electron UI Lab window and preload exposure, scenario controller, `dev_ui_lab_apply_scenario`, preview overrides, reset/lifecycle lock, obsolete locale keys, dedicated tests, and old screenshot automation.

Deletion must be based on zero remaining consumers. Generic Electron commands, window routing, runtime dependency logic, Download/Transcode logic, and shared production UI remain.

### R8. Validation Boundary

- Browser validation proves synthetic visual/state presentation, component reuse, screenshot export, Reduced Motion, and build isolation.
- Electron validation remains responsible for real IPC ordering, native processes, window lifecycle/composition, command behavior, GPU/OS differences, and Product authority.
- No hidden compatibility path or renamed UI Lab override may remain after retirement.

## Acceptance Criteria

- [ ] `npm run dev:lab` opens the consolidated Lab without Electron or downloader runtimes and defaults to Chinese.
- [ ] The left navigation, center preview, and right Inspector expose all required categories without becoming a generic design-system studio.
- [ ] All seven legacy scenarios start from typed production state/payload fixtures and render through the applicable production selectors/helpers/projections and shared production components.
- [ ] Existing MR9 activation/progress scenarios, Replay, local origin, trace downward revision/replacement, and Reduced Motion continue to work.
- [ ] The page owns exactly one MR9 WebGL canvas and uses the production program/shader/runtime.
- [ ] No Lab source imports Electron main/preload modules or `src/desktop/runtime.ts`, invokes real Download/Transcode commands, or calls `dev_ui_lab_apply_scenario`.
- [ ] `导出 4× PNG` exports the 200x200 center preview with a 14px transparent shadow gutter on every side as a 912x912 PNG, with nonblank WebGL pixels, DOM overlays, readable Chinese text, rounded corners, shadow, and a scenario-derived filename.
- [ ] Screenshot export leaves the selected scenario, Inspector values, animation inputs, canvas count, and preview operation unchanged.
- [ ] Documentation screenshot assets can be refreshed through the Browser Lab export workflow without the legacy script or Electron screenshot hook.
- [ ] Repository search confirms zero remaining consumers before each legacy UI Lab symbol/file is deleted.
- [ ] Production `dist/` contains no Lab entry, locale namespace, screenshot dependency, or Lab references.
- [ ] Type-check, lint, relevant unit/component tests, production build, and Browser Lab Playwright validation pass. Real Electron smoke remains an MR9 Final Closure integration gate after Thermal visual acceptance.
- [ ] The current Thermal shader/default recipe is unchanged; visual tuning remains deferred.
- [ ] Root `main`, old M3 worktree, downloader environment, validation junctions, and other MRs remain untouched.

## Out of Scope

- Thermal Activation shader tuning or visual repair.
- Product, Download, Transcode, runtime dependency, or lifecycle semantic changes.
- A generic simulation/state bus, Motion framework, scene system, parameter registry, screenshot service, or asset manager.
- Automated native downloader/ffmpeg/runtime setup for Browser Lab.
- Final Electron visual acceptance, MR9 merge/archive, or the next MR.

## Planning Status

Requirements are converged. There are no blocking product questions. This task remains `planning` and must not be started until GPT Architecture Lead approves the latest `prd.md`, `design.md`, and `implement.md`.
