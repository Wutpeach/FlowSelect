# P1 Read-only Diagnostics — implementation report

## Scope completed

P1 adds one typed `get_read_only_diagnostics` command and a compact Settings → System & Support report. The command is registered before runtime-owning controllers, so dispatch cannot lazily construct the download runtime before this command is handled.

The report uses independent evidence origin (`configured`, `observed`, `probed`) and conclusion (`available`, `degraded`, `unavailable`, `unknown`, `not_verified`) dimensions. It reports environment/target facts; expected and observed current runtime sources; managed runtime presence and bounded version probes; the cached runtime-gate state; configured output-folder, observed presence, and read/write permission-probe facts; Browser Bridge listener/client/pending facts; queue counts; and bounded sanitized recent runtime-log facts.

The Settings projection renders only locale-owned conclusion labels and safe fact values. It never renders backend fact summaries as product copy. Its compact rows cover runtime readiness, output existence/read/write state, Browser Bridge listener/client state, and queue counts. A zero connected-client count is shown as an optional disconnected state and does not by itself downgrade an otherwise complete report.

## Architecture flow

```text
Settings report / Refresh
  -> typed desktop command `get_read_only_diagnostics`
  -> first controller-registry match: diagnosticsCommands
  -> diagnostics snapshot composer
       -> pure runtime path/status inspection (no mkdir)
       -> one shared bounded, hidden `--version` probe only for observed executables
       -> gate `peekState()` (no refresh, emit, or bootstrap)
       -> configStore no-create read + output R_OK/W_OK permission checks (no test file)
       -> existing Browser Bridge snapshot (no request or broadcast)
       -> existing queue snapshot when already instantiated
       -> bounded/sanitized runtime-log projection
  -> serializable snapshot -> Settings display
```

No diagnostic path calls bootstrap/install/fetch/download/config save/directory creation/queue enqueue/cancel/retry or emits terminal events. If an output, Bridge, queue, log, or executable-probe section cannot be read, the rest of the report remains available with an `unknown` or `degraded` fact.

## Changed files

- `src/electron-runtime/runtimePaths.ts` and tests: one canonical pure managed-path derivation for Python-package, FFmpeg/FFprobe, and Deno paths; execution resolution only layers `mkdir` over those pure results, while status inspection never creates roots.
- `electron/configStore.mts` and tests: no-create config/output-path readers.
- `electron/runtimeDependencyGate.mts` and tests: passive `peekState()` snapshot.
- `electron/extensionRequestBridge.mts` and tests: passive pending-request snapshot.
- `electron/diagnostics.mts`, `electron/diagnosticsCommands.mts`, and tests: fact composition, R_OK/W_OK permission checks without a test file, bounded probes, and one command controller.
- `electron/main.mts` and `src/types/electronBridge.ts`: composition-root wiring, typed command vocabulary, and one shared bounded/hidden/sanitized version-probe owner for Diagnostics plus downloader-version information.
- `src/types/diagnostics.ts`, `src/pages/diagnosticsPresentation.ts`, tests, and `src/pages/SettingsPage.tsx`: serializable DTOs, localized compact Settings report rows, no backend-summary rendering, and complete/partial-state projection.
- `locales/*/desktop.json` plus generated browser-extension locale mirrors: English/Chinese UI copy.
- `site/src/content/docs/{docs,en/docs}/advanced/download-dependencies.md`: public explanation of the observation-only self-check, unknown/not-verified semantics, and the limits of a non-mutating write-permission check.

## Validation evidence

- Acceptance-correction focus: `npx vitest run electron/diagnostics.test.mts electron/diagnosticsCommands.test.mts electron/downloaderVersionInfo.test.mts src/electron-runtime/runtimePaths.test.ts src/electron-runtime/service.test.ts` — 17 files, 420 tests passed. This includes a real deferred `AmeowElectronDownloadRuntime` job: Diagnostics reads its active queue state, the same task remains active and its abort signal remains false, then release produces exactly one successful terminal outcome.
- UI projection focus: `npx vitest run src/pages/diagnosticsPresentation.test.ts src/pages/SettingsPage.diagnostics.test.ts electron/diagnostics.test.mts` — 3 files, 14 tests passed. Covers all required conclusion sources, the optional zero-client policy, summary suppression, and locale-owned projection keys.
- `npm run type-check` — passed.
- Task-file ESLint over changed P1 renderer/runtime files — passed.
- `npm run build` — passed (including locale synchronization and Electron compilation).
- `npm run docs:build` — passed.
- Scoped P1 `git diff --check` — passed.

## Validation exceptions / NOT VERIFIED

- Exact `npm test` still scans untracked `.cindy-worktrees/` and fails three unrelated copies of `browser-extension/architecture-guard.test.js`; this acceptance correction instead ran the focused P1 suite above.
- `npm run lint` is blocked by the pre-existing `src/lab/OneWorksMascotInspector.tsx:147` `react-hooks/set-state-in-effect` error. Lint over all P1 `src/` files passes.
- Full-repository `git diff --check` is blocked by the pre-existing CRLF-only dirty `browser-extension/locales/contract.json`; P1 paths pass their own diff check.
- macOS packaging/execution and manual Electron visual testing are **NOT VERIFIED** on this Windows host.

## Explicit boundary confirmation

No P2 lifecycle fields or behavior were added: no managed candidate, activation generation, release identity, bundled yt-dlp fallback, updater, repair action, rollback, runtime selection, or new download/queue/Browser Bridge/config authority. No Architecture PASS, commit, push, archive, or next-stage work was performed.
