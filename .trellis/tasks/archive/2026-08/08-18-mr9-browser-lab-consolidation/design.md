# Technical Design

## 1. Architecture Summary

The consolidated Browser Lab is one dev-only browser entry with multiple typed visual fixtures. It does not host an App replica.

```text
Lab scenario fixture
  -> production typed state/payload
  -> applicable production selector / helper / projection
  -> shared production presentational component or ExpandedPresentationTarget
  -> existing ExpandedPresentationSurface / DOM presentation
  -> browser pixels
```

The Lab owns only the selected preset, Inspector values, local replay/export state, and ephemeral synthetic fixtures. Production modules continue to own rendering and presentation semantics.

## 2. Entry and Build Isolation

- Keep `lab.html`, `src/lab/lab-main.tsx`, and `vite.lab.config.ts` as the only Browser Lab entry path.
- Keep the separate `dev:lab` command and local Vite port.
- Keep the production Vite input pinned to `index.html`.
- Do not register a production `/ui-lab` or `/presentation-lab` route in the Electron renderer.
- Static tests must reject Electron/preload/desktop imports from `src/lab/` and the extracted browser-safe presentational modules.

## 3. Lab Information Architecture

### Left: 场景

Group presets by task rather than by implementation module:

1. 全屏激活: Intake 本地源点、中心源点、Folder Anchor/Lock、Replay.
2. 下载与进度: 0/25/50/75/100、任意进度、不确定、同 trace 向下修订、新 trace 替换、active、queued.
3. 运行环境: 自动配置、失败.
4. 转码: 进行中、失败.
5. 混合忙碌: Download + Transcode concurrency.
6. 减弱动态: Intake、Folder and state-component audits.

Each category has a local reset action. It resets Lab fixture state only.

### Center: 实时预览

- Use one 200x200 production-like stage.
- Keep the existing `ExpandedPresentationSurface` mounted exactly once.
- Compose extracted production DOM overlays above or beside the canvas according to current App z-index and pointer/accessibility contracts.
- Preserve click-to-origin only for activation scenes.
- Provide a compact preview toolbar with Replay when applicable and `导出 4× PNG`.

### Right: 检查器

Controls are scenario-specific and map to implemented production inputs only:

- Activation: origin, Replay, Reduced Motion, current shader uniform readout.
- Download: trace, queue stage, progress, count, speed, ETA.
- Transcode: stage, progress, count, failure diagnostic.
- Runtime: phase, managed components, progress, error/manual action.
- Mixed: Download and Transcode fixture fields.

Do not add a generic parameter registry or controls for nonexistent shader/runtime inputs.

## 4. Production Component Extraction

`src/App.tsx` remains Electron-owned and must not be imported by the Lab. Only stateless visual subtrees are extracted:

- primary task progress pill;
- Download/Transcode queue badge and popover rows;
- runtime dependency indicator;
- center outcome overlay composition;
- progress text/percent presentation helpers currently inline near `getDownloadQueueTaskProgressText` and `getDownloadQueueTaskProgressPercent`.

Extraction rules:

- Props are already-projected production display facts, callbacks, and accessibility labels.
- App remains owner of subscriptions, refs, timers, commands, lifecycle, and optimistic rollback.
- Lab provides synthetic facts and no-op/disabled actions.
- App and Lab import the same extracted component. No duplicated JSX or alternate styling recipe is allowed.
- Components remain browser-safe and may depend on Theme/i18n/UI primitives, not desktop runtime.

## 5. Scenario Data Contracts

### Static fixture first

The seven legacy scenes are static visual states. Represent them with a small discriminated Lab-only fixture union and convert them to existing production model/payload types. Run those values through the applicable existing pure path; do not replay event ingestion solely for visual preview:

- Download: typed `DownloadQueueState`, model/selectors, and `resolveDownloadProgressTarget`.
- Transcode: typed transcode payload snapshots and `downloadViewHelpers.ts`.
- Runtime: pure helpers in `runtimeDependencyGate.ts`.
- Presentation: `ExpandedPresentationTarget` and the existing runtime.

Do not introduce a synthetic event bus, command registry, durable queue, or parallel controller. The existing browser-testable Download client seam is reserved for a future event-ordering requirement and is not needed for these seven presets.

### Scenario mapping

| Legacy scene | Production visual path | Electron-only behavior intentionally excluded |
| --- | --- | --- |
| `runtime-auto-config` | runtime gate helpers + shared runtime indicator | actual managed-runtime download and full-window lock |
| `runtime-failed` | manual-action/error helpers + shared error presentation | native runtime inspection and retry execution |
| `download-active` | Download selectors + progress projection + shared pill/badge/rows + Expanded Presentation | downloader process, real ETA, cancel |
| `download-queued` | queue selectors + shared queued row/badge | real enqueue and IPC ordering |
| `transcode-active` | typed transcode payload + production helpers + `CircularProgressIndicator` + shared row/pill | ffmpeg and command execution |
| `transcode-failed` | typed transcode payload + production helpers + `ForegroundOutcomeOverlay` + shared failed row | native failure source, retry/remove |
| `mixed-busy` | composition of the same Download and Transcode paths | real engine concurrency |

## 6. Localization

- Initialize the Lab with `initializeI18n("zh-CN")` before React render.
- Do not mount `I18nRuntimeBridge` or read persisted desktop language.
- Existing production components continue to use their current `desktop` translation keys.
- Add a dedicated `lab` namespace in `zh-CN` and `en` for Lab navigation, Inspector labels, export status, and errors.
- Remove legacy `settings.uiLab.*` keys only after `UiLabPage` and Settings consumers are gone and locale parity tests pass.
- No language switch is required in the first consolidated Lab.

## 7. High-Resolution PNG Export

### User contract

- One click exports the center preview only.
- Default scale is 4x. The 200x200 content plus the production 14px shadow gutter on every side produces a 912x912 transparent PNG, preserving the rounded silhouette and shadow.
- The filename is derived from the active scenario, for example `ameow-lab-download-active-4x.png`.
- The control exposes busy/success/failure feedback in Chinese and prevents duplicate capture while running.

### Technical boundary

- Add one Lab-local export utility that accepts the existing preview root, scale, production shadow recipe, and a readback from the existing production canvas.
- Hold the current Lab fixture and capture inputs stable for the export transaction; `backingScale` and `redrawEpoch` are narrow transient capture inputs on the existing surface and remain unused by the normal production call path.
- Keep the preview at 200x200 CSS pixels, synchronously redraw the one production WebGL canvas at an absolute 4 backing pixels per CSS pixel, read it back, rasterize the DOM overlay at 4x, then composite both inside the rounded shell with a Canvas2D shadow derived from the production token and a 14px transparent gutter.
- Download through a Blob URL, revoke the URL after download starts, and restore capture state in `finally`.
- Do not mount a hidden second renderer/canvas, persist capture state, or add a Vite/Electron screenshot service.
- Start implementation with a focused native-browser feasibility spike. If native APIs cannot reliably composite WebGL and DOM, add one narrowly scoped dev-only rasterizer. It must stay reachable only from the Lab entry and must not enter production chunks.

The capture utility is not a screenshot framework: no gallery, templates, storage, batch queue, metadata database, or plugin API.

## 8. Legacy Retirement Plan

Retirement occurs only after Browser parity and screenshot acceptance.

### Remove

- Settings dev section button/preload for UI Lab.
- `src/pages/UiLabPage.tsx` and `/ui-lab` route/bootstrap entry.
- UI Lab window label/routing/metrics/open preload exposure.
- `electron/uiLabScenarios.mts` and dedicated tests.
- `dev_ui_lab_apply_scenario`, controller wiring, runtime overrides, reset event, App preview state, and `uiLab` lifecycle lock.
- UI Lab-specific bridge types and locale keys.
- `scripts/capture-docs-screenshots.mjs`, docs screenshot Electron scenario mapping/apply hook, and delay constants after Browser export is accepted as the replacement workflow.

### Retain

- Generic command invocation and secondary-window infrastructure used elsewhere.
- Production runtime dependency gate and Download/Transcode authority.
- Shared reducers, selectors, helpers, UI primitives, and extracted production components.
- Browser Lab Playwright validation scripts that validate the new Lab rather than capture legacy Electron docs scenes.

### Zero-consumer gate

Before deleting each symbol or file, search definitions and consumers. Removal is invalid if any non-test consumer remains. Tests are deleted or rewritten only with their owning production path.

## 9. Validation Responsibility

Browser Lab validates synthetic presentation, production component reuse, localization, screenshot output, WebGL/DOM composition, and Reduced Motion.

Electron integration validates real IPC events, native runtimes, command actions, transparent-window composition, lifecycle locks, OS/GPU differences, and authority ordering. The retirement must not preserve a hidden preview override solely to make Electron tests easier.

## 10. Compatibility, Risks, and Rollback

- App extraction drift: compare App visual/component snapshots before and after each mechanical extraction.
- Screenshot fidelity: verify 912x912 dimensions, 800x800 content inset by 56 backing pixels, nonblank WebGL, fonts, overlays, transparent exterior pixels, shadow alpha, rounded corners, cross-DPR invariance, and state restoration in Chromium.
- Animation capture: capture the current Lab frame without changing production timing semantics; any capture hold is Lab-local and bounded to the transaction.
- Locale drift: preserve paired locale keys and run locale parity tests.
- Premature retirement: keep the old UI Lab until Browser parity and screenshot workflow are accepted, then remove it atomically.
- Thermal quality: do not mix shader repair into consolidation. The renderer remains the current production baseline.

Each implementation stage ends with passing focused tests. Git commits, if later authorized, should preserve clear rollback points between component extraction, scenario migration, screenshot export, and legacy deletion.
