# Repository-grounded planning report: Diagnostics backend lifecycle and managed yt-dlp

## Status, evidence boundary, and executive summary

This is a planning/research artifact only. Evidence was read from the current `main` checkout and current working tree on 2026-08-25. No production code, packaging script, or runtime asset was changed. The working tree was already dirty: `AGENTS.md`, `browser-extension/locales/contract.json`, `.cindy-upstream/`, `.cindy-worktrees/`, the two package-output directories, and both active task directories were present as unrelated or pre-existing changes. Those paths were not altered.

**Executive conclusion (confirmed + recommendation):** the current Electron architecture has one download authority: `electron/main.mts` composes one `AmeowElectronDownloadRuntime`, one engine registry, and the `yt-dlp`/`gallery-dl` adapters; `src/electron-runtime` owns queueing, process execution, retries, cancellation, and diagnostic classification. Current `yt-dlp` and `gallery-dl` are managed Python packages in per-tool virtual environments backed by bundled CPython; FFmpeg/FFprobe and Deno are managed per-target binaries. There is no current bundled yt-dlp executable candidate: status expects `ytDlp.source="managed"`, and the resource package contains bundled Python, not downloader binaries. That is a material contradiction with the planning invariant that a bundled yt-dlp baseline must remain immutable.

P1 read-only Diagnostics is feasible by adapting existing owners, but must not call the current path/status functions blindly: `runtimeRootFor()` creates directories during status resolution (`src/electron-runtime/runtimePaths.ts:94-105`), so current status inspection is not side-effect-free. P1 should have an application-owned read-only query that reports configured facts separately from executable/version probes, and should preserve existing allowlist/sanitization rules in the support-log projection.

P2 managed yt-dlp update/rollback is feasible only after a real bundled baseline is supplied and the selection/identity boundary is made explicit. The managed candidate must be staged and verified in user data, activated only for new jobs, pinned together with its FFmpeg/FFprobe/Deno dependency set before spawn, and retained while any process references it. It must feed the existing engine adapter/runtime; it must not add a second downloader, updater, or process authority.

## 1. Current packaging, location, launch, and consumption

### 1.1 Runtime target and packaged resource layout

**Confirmed.** Supported runtime targets in current code are Windows x64, macOS arm64, and macOS x64 (`src/electron-runtime/platform.ts:1-14`). The bundled prerequisite is CPython, resolved from repository development resources, packaged `process.resourcesPath/binaries`, packaged `process.resourcesPath/app/desktop-assets/binaries`, or the executable directory fallback (`src/electron-runtime/runtimePaths.ts:51-66`). The executable is `python.exe` on Windows and `bin/python3` on macOS (`src/electron-runtime/runtimePaths.ts:69-76`).

The source-of-truth Python manifest pins target, Python version, archive URL, size, checksum, and executable relative path (`desktop-assets/binaries/.official-python-runtimes.json:1-37`). `scripts/ensure-python-runtime.mjs:8-15` invokes the official runtime preparation, and `scripts/python-runtime.mjs:141-169` rejects a missing/stale manifest, missing executable, or mismatched pinned asset. The Electron builder includes only the selected `python-<target>` tree and the official manifest (`electron-builder.config.mjs:29-35`, `45-61`).

**Confirmed current contradiction.** The current runtime does not package a standalone/bundled yt-dlp or gallery-dl binary. The active managed-runtime contract says both are Python packages installed into managed venvs (`.trellis/spec/backend/sidecar-runtime-contracts/02-cross-platform-runtime-resolution-for-downloaders.md:27-44`), and the macOS package verifier explicitly rejects legacy standalone downloader assets (`scripts/verify-macos-python-runtime-package.mjs:340-375`). `runtimePaths.ts` resolves yt-dlp and gallery-dl only under `configDir/runtimes/<tool>/<target>/venv/...` (`src/electron-runtime/runtimePaths.ts:125-173`). The older runtime-core spec still says yt-dlp and gallery-dl are bundled (`.trellis/spec/backend/sidecar-runtime-contracts/03-electron-download-runtime-core.md:37-43`); that document is stale relative to current code and the newer managed-runtime contract.

### 1.2 yt-dlp and gallery-dl

**Confirmed.** `electron/managedPythonPackageManifest.mts:3-27` is the single package source/version table: yt-dlp `2026.07.04` and gallery-dl `1.32.8`, each with minimum Python requirements. The bootstrap creates a per-tool venv under the user config directory, uses the bundled Python, runs pinned `pip install`, verifies the entrypoint/version, and writes metadata (`electron/managedRuntimeBootstrap.mts:886-999`). A stale/missing metadata file, package/version/source mismatch, bundled Python version/path change, or stale directory causes a complete tool-specific rebuild (`electron/managedRuntimeBootstrap.mts:462-503`).

On Windows the entrypoints are `venv/Scripts/yt-dlp.exe` and `venv/Scripts/gallery-dl.exe`; on macOS they are `venv/bin/yt-dlp` and `venv/bin/gallery-dl` (`src/electron-runtime/runtimePaths.ts:132-173`). macOS managed Python entrypoints are chmod'd executable after installation (`electron/managedRuntimeBootstrap.mts:955-960`). The bootstrap uses per-tool in-flight promises so concurrent readiness requests do not concurrently delete/rebuild one venv (`electron/managedRuntimeBootstrap.mts:901-905`, `991-998`).

The app invokes yt-dlp through the `YtDlpEngineAdapter`, which delegates to `runYtDlpDownload` (`src/electron-runtime/ytDlpEngineAdapter.ts:15-55`). The command plan supplies `--ignore-config`, progress/report files, output template, optional `--ffmpeg-location`, cookies, and the explicit YouTube JavaScript profile (`src/electron-runtime/engineManifest.ts:178-204`; `src/electron-runtime/ytDlpCommandPlan.ts:206-261`). gallery-dl similarly runs through its adapter and command plan with `--config-ignore`, output directory/filename, cookies, and provider-selected URL (`src/electron-runtime/galleryDlEngineAdapter.ts:15-55`; `src/electron-runtime/galleryDlCommandPlan.ts:19-39`).

### 1.3 FFmpeg and FFprobe

**Confirmed.** FFmpeg and FFprobe are not packaged as app resources or assumed from host `PATH`. Their managed paths are `<userData>/runtimes/ffmpeg/<target>/real/ffmpeg(.exe)` and `ffprobe(.exe)` on Windows, and the target root on macOS (`src/electron-runtime/runtimePaths.ts:108-123`). Readiness requires both files (`src/electron-runtime/runtimePaths.ts:184-195`, `288-305`). The bootstrap downloads pinned FFmpegBin 8.0.1 archives for Windows x64, macOS arm64, and macOS x64, checks exact size/SHA-256, extracts both binaries, and chmods on non-Windows (`electron/managedRuntimeBootstrap.mts:846-883`, `1066-1136`).

yt-dlp receives the directory containing the resolved ffmpeg path through `--ffmpeg-location` (`src/electron-runtime/ytDlpCommandPlan.ts:229-237`) and prepends that directory to the child `PATH` (`src/electron-runtime/ytDlpDownload.ts:298-305`). FFmpeg/FFprobe are also injected as shared media tools for the transcode path (`src/electron-runtime/runtimePaths.ts:277-285`).

**Spec/code contradiction requiring validation.** The active sidecar spec says Windows should expose proxy-front `ffmpeg.exe`/`ffprobe.exe` and `deno.exe` at the managed root while real console binaries live in `real/` (`.trellis/spec/backend/sidecar-runtime-contracts/02-cross-platform-runtime-resolution-for-downloaders.md:80-100`). Current resolver/bootstrap code returns and writes the `real/` paths (`src/electron-runtime/runtimePaths.ts:108-123`; `electron/managedRuntimeBootstrap.mts:145-159`, `1040-1050`, `1113-1122`), and this checkout contains no corresponding proxy-front creation in those paths. This is not safe to assume resolved; P2 must first verify the packaged Windows runtime layout and hidden-child behavior.

### 1.4 Process launch and cancellation

**Confirmed.** All managed downloader launches use `runStreamingCommand`, which calls Node `spawn` with piped streams and `windowsHide: true` (`src/electron-runtime/processRunner.ts:104-117`). Windows cancellation uses `taskkill /PID /T /F` and falls back to kill/SIGKILL if needed (`src/electron-runtime/processRunner.ts:76-101`). Abort listeners are removed after process close (`src/electron-runtime/processRunner.ts:123-150`). Version probes use a separate but compatible hidden spawn in Electron main (`electron/main.mts:1832-1858`); this is a small duplicated probe helper, not a second download execution authority.

yt-dlp owns bounded same-engine retries for transient network failures and YouTube section-format fallback, cleans task artifacts between attempts, and will not retry after cancellation (`src/electron-runtime/ytDlpDownload.ts:157-179`, `456-503`). Terminal stderr/stdout evidence is sanitized and classified before becoming typed runtime errors (`src/electron-runtime/ytDlpDownload.ts:505-558`; `src/electron-runtime/engineErrorClassifier.ts:7-18`, `82-118`).

## 2. Ownership of identity, availability, execution, and failure facts

| Fact or responsibility | Current owner | What is actually proven today |
|---|---|---|
| Runtime path and file-presence status | `src/electron-runtime/runtimePaths.ts` | `state`, `source`, expected source, path, and error are derived from existence checks. yt-dlp/gallery-dl are marked managed; FFmpeg readiness checks both files (`runtimePaths.ts:184-214`, `288-305`). |
| Package identity/version metadata | `electron/managedPythonPackageManifest.mts`, managed `metadata.json` | Pinned package source/version/min Python are configured facts; installed metadata records package, Python, target, paths, timestamps, and probed versions (`managedRuntimeBootstrap.mts:416-453`, `962-987`). |
| Actual yt-dlp version probe | `electron/downloaderVersionInfo.mts` + `electron/main.mts` | `checkYtdlpVersion` runs the current status path with `--version`; it reports `current`, pinned `latest`, source, Python facts, and comparison (`downloaderVersionInfo.mts:105-149`; `main.mts:1832-1870`). This is a runtime probe, unlike mere existence status. |
| Runtime installation/rebuild | `electron/managedRuntimeBootstrap.mts` | Owns Python venv creation, pip installation, artifact download/checksum/extraction, chmod, replacement, metadata, and per-tool/component in-flight joining (`managedRuntimeBootstrap.mts:738-800`, `886-999`, `1001-1136`). |
| Gate state and bootstrap order | Electron main `runtimeDependencyGate.mts` | Owns missing-component aggregation, phase/activity state, and ordered bootstrap `ytDlp -> galleryDl -> ffmpeg -> deno` (`electron/runtimeDependencyGate.mts:55-60`, `87-120`, `236-264`). |
| Download queue/execution authority | `AmeowElectronDownloadRuntime` + application `DownloadJobService` + engine registry | One runtime owns pending/active tasks, one `DownloadJobService` executes the prepared job, and one engine registry/orchestrator routes attempts (`src/electron-runtime/service.ts:294-353`, `1371-1384`, `1432-1564`). |
| Concrete engine identity and process command | `electron/main.mts` composition plus Infrastructure adapters/runners | Main creates exactly one yt-dlp and one gallery-dl adapter and asserts bindings cover engine IDs (`electron/main.mts:1362-1379`); adapters delegate to the existing download runners. |
| Failure classification | Infrastructure engine adapters/runners | Raw evidence becomes stable `DownloadFailureClassification` and diagnostic category before application fallback policy (`src/electron-runtime/engineErrorClassifier.ts:7-13`, `82-118`). |
| Per-job diagnostic facts | Application `download-diagnostics.ts`, runtime log sink | Recorder owns attempt identity/history and exactly-one terminal event; the current Electron sink writes allowlisted events to runtime logs (`src/application/download-diagnostics.ts:9-16`, `43-143`; `src/electron-runtime/downloadDiagnosticSink.ts:7-14`). |
| Safe support export | `electron/supportLogSnapshot.mts` and `supportLogExport.mts` | Existing export allowlists environment/settings/runtime state and records path presence, not raw paths (`supportLogSnapshot.mts:7-12`, `87-111`, `140-163`; `supportLogExport.mts:28-73`). |

**Configured vs probed distinction:** package manifest pins, expected source, target, configured output path, and existence-derived readiness are configured/observed filesystem facts. `--version` output, Python compatibility, and a real download process are runtime probes. Current status does not execute `--version`, validate metadata, verify dependency identity, test executable permissions, or prove a successful download; P1 must not label those facts healthy from `state="ready"` alone.

## 3. Reusable facts and missing P1 facts

### Reusable without a new authority

- Runtime status/gate DTOs and Electron command bridge already expose status, gate state, refresh, and explicit bootstrap commands (`src/types/runtimeDependencies.ts:1-55`; `electron/videoDownloadCommands.mts:31-95`). P1 should add a read-only diagnostics query alongside this command boundary, not bypass preload/main.
- Existing version probes can be reused for yt-dlp/gallery-dl, but Diagnostics must report probe outcome separately from status (`electron/downloaderVersionInfo.mts:23-53`, `105-193`).
- Queue facts (`active`, `pending`, phase, trace ID), cancellation, and terminal completion already exist (`src/electron-runtime/service.ts:376-417`, `526-588`, `1696-1707`). They can provide current queue/in-flight constraints without a second tracker.
- Error classifier, bounded stderr tails, per-job attempts, network route diagnostic metadata, telemetry, and runtime log sink are reusable (`src/electron-runtime/service.ts:140-159`, `1629-1633`, `1737-1797`; `src/application/download-diagnostics.ts:176-203`).
- Browser Bridge is Electron main's fixed loopback WebSocket server at `127.0.0.1:39527`, with connected-client tracking and request/response correlation (`electron/main.mts:3369-3416`; `electron/extensionRequestBridge.mts:101-106`, `136-199`). Site-session registry/cookie-sync facts are also available through this bridge.
- Config and output facts are owned by `configStore`: `settings.json` is under Electron `userData`, while `outputPath` falls back to the desktop `Ameow_Received` directory (`electron/configStore.mts:77-110`, `175-181`). Runtime resolves and creates the output directory before a job (`src/electron-runtime/runtimeUtils.ts:57-68`).
- Platform/package facts are already composed in `buildElectronRuntimeEnvironment`, including platform, arch, packaged state/resource directory, executable directory, desktop directory, temp directory, and session fetch (`electron/main.mts:1264-1275`).
- Application updater is separate and currently Windows-packaged-only (`electron/main.mts:307-354`; `electron/appUpdateController.mts:115-124`). Its temporary installer and portable update behavior should be observed as a separate lifecycle, not reused as a backend updater.

### Facts absent or unsafe to infer today

1. No bundled yt-dlp executable/version/hash/eligibility fact exists in current runtime status. `RuntimeDependencySource` supports bundled/managed, but `ytDlp.expectedSource` is currently managed and no fallback fields are populated (`src/types/runtimeDependencies.ts:1-20`; `src/electron-runtime/runtimePaths.ts:197-214`).
2. No candidate identity (version, immutable directory, package hash, dependency bundle hash, or activation generation) is attached to a download attempt. Current engine dependencies are static paths injected when the main runtime is composed (`electron/main.mts:1362-1379`).
3. No runtime probe reports FFmpeg/FFprobe or Deno version, architecture, executable permission, codesign/quarantine state, or compatibility with the selected yt-dlp candidate; status only checks presence (`runtimePaths.ts:184-195`, `288-305`).
4. No generic Browser Bridge health snapshot exposes client count/last handshake/protocol version/request timeout/error counters. The bridge has internal count and pending maps but no read-only fact DTO (`extensionRequestBridge.mts:136-182`).
5. No diagnostic fact proves output directory writable, free space, path accessibility, or whether the configured path is a removable/network/read-only location; `resolveOutputDir` creates it, which is inappropriate for a read-only probe (`runtimeUtils.ts:57-68`).
6. No persistent backend selection, activation, rollback, downgrade policy, or garbage-collection state exists. `fallbackSource`/`fallbackPath` are type affordances only; current resolvers do not populate them (`src/types/runtimeDependencies.ts:5-13`; `runtimePaths.ts:197-214`, `288-305`).
7. No lifecycle lock ties managed runtime replacement to active processes. Existing in-flight promise joining protects concurrent bootstrap calls, not replacement versus a running download (`managedRuntimeBootstrap.mts:121-123`, `901-905`, `1056-1063`).

## 4. Authority, lifecycle, and dependency boundary for a managed yt-dlp candidate

**Recommended boundary (inference/recommendation):** keep candidate management in an Electron-owned runtime-candidate module, but make the existing `electron/main.mts` composition root the only place that injects a candidate resolver into `YtDlpEngineAdapter`/`AmeowElectronDownloadRuntime`. The resolver should be called at the existing `buildAttemptContext` gate, before engine spawn (`src/electron-runtime/service.ts:1514-1564`), and should return a complete immutable candidate identity: yt-dlp executable, Python/venv identity, FFmpeg and FFprobe identity, Deno identity, target, version, and activation generation.

The existing boundaries must remain:

- Domain/Application still selects provider/engine plans; managed state must never rewrite URLs, provider plans, or feature routing. The downloader-owned URL contract explicitly forbids runtime-side short-link expansion and keeps provider routing authoritative (`.trellis/spec/backend/electron-runtime-contracts/10-downloader-owned-url-extraction-contract.md:18-43`).
- `AmeowElectronDownloadRuntime` remains the sole queue/process orchestration authority. The engine registry remains the sole concrete engine dispatch (`service.ts:320-332`; `main.mts:1370-1377`).
- `runYtDlpDownload`, `processRunner`, existing cancellation, retry, and error classification remain the sole yt-dlp execution/failure path. A managed updater must never invoke yt-dlp through a new command path.
- FFmpeg/FFprobe/Deno must be selected as the dependency set belonging to the candidate. A yt-dlp-only swap is unsafe because yt-dlp command construction explicitly consumes FFmpeg and Deno (`engineExecutionContext.ts:10-14`; `ytDlpCommandPlan.ts:235-258`).
- Diagnostics must observe resolver output and activation state; Repair/update must be a separate explicit command with no implicit call from status/diagnostics. Current bootstrap is already exposed as a distinct `start_runtime_dependency_bootstrap` command (`videoDownloadCommands.mts:31-41`, `83-92`).

This preserves exactly one download execution authority and prevents feature/domain bypass. Any design that adds a new “managed yt-dlp downloader service”, direct CLI command from Diagnostics, or second engine registry is a duplicate-authority rejection.

## 5. Recommended bundled-vs-managed selection, fallback, and rollback

This is a recommendation for P2, not current behavior.

1. **Bundled baseline:** ship a real, target-specific yt-dlp baseline (and declared compatible dependency set) inside immutable packaged resources. Never overwrite or delete it. P2 cannot claim the required fallback invariant until this asset and its packaging/verification contract exist; current package verification deliberately rejects standalone downloader assets (`verify-macos-python-runtime-package.mjs:360-375`).
2. **Managed versions:** store each candidate in a versioned, user-writable directory below `app.getPath("userData")/runtimes/yt-dlp/<target>/versions/<identity>/`, with its own venv/dependencies and metadata. Stage to a temporary sibling, verify exact target/version/hash/signature policy, probe `--version`, verify required dependency paths, then mark eligible. Never install into `process.resourcesPath` or the app bundle.
3. **Selection:** persist one small selection record containing active candidate identity and generation. For each new execution, resolve active managed candidate only if it is eligible and dependency-complete; otherwise resolve the immutable bundled baseline and report the managed failure/degraded reason. Missing/corrupt selection metadata fails closed to bundled.
4. **Activation:** activation changes the candidate for new jobs only. `buildAttemptContext` must resolve and pin the identity before the first child spawn. The per-job context and diagnostic attempt should carry the identity/generation, while the current engine/feature routing is unchanged.
5. **Execution failure:** do not silently switch executable underneath a running attempt. If managed execution fails, preserve the existing typed failure and retry policy; only an explicit new attempt after artifact cleanup may resolve the bundled baseline, and that policy must be narrowly specified/tested rather than becoming a second fallback engine ladder.
6. **Rollback:** rollback selection to the prior eligible managed candidate or bundled baseline for new jobs. Do not delete any candidate referenced by active jobs. If the managed candidate is invalid, retain evidence/metadata for Diagnostics and quarantine or garbage-collect it only after no active references remain.
7. **Downgrade/security:** reject unsigned/unverified assets and silent downgrades. Existing exact SHA/size verification for managed binary archives (`managedRuntimeBootstrap.mts:748-800`) is reusable, but pip installation of a package version alone is not a sufficient authenticity policy for a future release updater.

## 6. Update/activation/rollback and in-flight download constraints

**Confirmed current lifecycle:** each queued task gets an `AbortController` and enters the active map before `runTask` (`src/electron-runtime/service.ts:1371-1384`). The existing child process is killed recursively on Windows and retries are suppressed after abort (`processRunner.ts:76-101`; `ytDlpDownload.ts:169-179`). App shutdown also requests cancellation for active downloads (`electron/main.mts:3431-3442`).

**Required P2 lifecycle rules (recommendation):**

- Do not replace a live executable or its venv/dependencies in place. Current managed Python rebuild removes the entire tool root before recreating it (`managedRuntimeBootstrap.mts:914-920`); that behavior is acceptable for an explicit maintenance operation only when no job is pinned to that root, and is unsafe as an activation mechanism for active downloads.
- Resolve candidate + dependency identity once per attempt before spawn. The current runtime calls `ensureEngineRuntimeReady` before each attempt but adapters hold path strings from composition (`service.ts:1514-1564`; `main.mts:1370-1374`), so P2 must add identity pinning rather than rely on a mutable same-path file.
- Activation must be atomic at the selection-record level, not by mutating the app bundle or replacing an executable path used by a running process. Staged candidates should use immutable version directories; cleanup waits for reference counts/jobs to settle.
- Cancellation must release the candidate reference only after the process tree is confirmed settled. Retry must either remain on the same pinned candidate for the attempt policy or explicitly create a new attempt with a newly resolved candidate; it must not accidentally mix yt-dlp from one release with FFmpeg/Deno from another.
- App update is independent: the existing controller downloads/opens a Windows installer or invokes portable replacement and then quits (`electron/appUpdateController.mts:188-230`). P2 must define what happens if app update is pending while a backend activation is staged; recommended behavior is no implicit backend activation during app update and no deletion of managed candidates until the app process has exited and reference state is durable.
- Probe/version checks and Diagnostics must never activate, delete, rebuild, or cancel. Existing `checkYtdlpVersion` is a probe, while `start_runtime_dependency_bootstrap` is an explicit mutation command; retain that separation (`electron/main.mts:1861-1881`; `videoDownloadCommands.mts:79-92`).

## 7. Windows/macOS packaging and security evidence

### Windows

**Confirmed:** electron-builder is unpacked (`asar: false`), includes the bundled Python target, and builds an x64 NSIS installer (`electron-builder.config.mjs:45-72`). NSIS is per-user (`perMachine: false`) and permits changing installation directory (`electron-builder.config.mjs:73-77`). The portable script copies the unpacked app tree and packages it into a ZIP with `Compress-Archive`, falling back to `tar`; it also extracts the ZIP for verification (`scripts/package-portable.ps1:73-165`). Current release CI runs both NSIS and portable packaging (`.github/workflows/release.yml:49-69`).

The runtime config directory is obtained from Electron `app.getPath("userData")` (`electron/main.mts:267-280`, `1264-1275`), so managed candidates must live there rather than beside the installed executable. Exact `%APPDATA%`/portable data path behavior is **NOT VERIFIED** by repository code; `getPortableRootPath` exists for app updates but does not prove backend runtime storage policy (`electron/appUpdateController.mts:150-168`).

Managed console launches use `windowsHide: true`, including `taskkill` (`processRunner.ts:81-117`). Code-signing/Authenticode configuration for installer or downloaded managed executables is not present in the inspected builder/workflow files: **NOT VERIFIED / security gap**. The current spec's proxy-front requirement versus current `real/` paths is a separate **NOT VERIFIED packaging/runtime gap** noted above.

### macOS

**Confirmed:** builder targets ZIP, sets `identity: null`, disables hardened runtime, and disables Gatekeeper assessment (`electron-builder.config.mjs:78-86`). The public release workflow builds an arm64 macOS artifact, installs `create-dmg`, packages the app, and runs a relocation/runtime verification script (`.github/workflows/release.yml:71-149`). The custom DMG copies `Ameow.app` into staging, adds the Applications link/install guide, and creates an unsigned custom DMG (`scripts/package-macos-open-source-dmg.mjs:216-310`). The install guide explicitly documents first-launch Privacy & Security approval and `xattr -dr com.apple.quarantine` for the installed app (`distribution/macos/install-guide.txt:1-14`).

Managed macOS entrypoints and FFmpeg/Deno are chmod'd `0755` after installation (`managedRuntimeBootstrap.mts:946-960`, `1044-1049`, `1113-1118`). The active spec also requires macOS venv symlink layout and warns against `--copies` (`.trellis/spec/backend/sidecar-runtime-contracts/02-cross-platform-runtime-resolution-for-downloaders.md:45-52`), while the package verifier checks executable/resource/relocation behavior (`scripts/verify-macos-python-runtime-package.mjs:329-390`).

There is no signing identity, notarization step, stapling step, managed-binary quarantine-clearing step, or policy for downloaded executable Gatekeeper behavior in the repository: **NOT VERIFIED / blocking validation gap**. The install guide only proves an app-bundle manual repair path, not that a post-install managed binary can execute after quarantine. The release matrix currently shows arm64 only (`release.yml:71-80`), although code paths and the DMG script support x64; x64 release verification is **NOT VERIFIED**.

## 8. Recommended P1/P2 boundary, risks, feasibility, and validations

### P1 — read-only Diagnostics

P1 should own one structured read-only application query that composes, without mutation:

- configured facts: expected source, package pin, selected/activation metadata, output-path configured flag, app update state, and user proxy preference presence;
- filesystem facts: candidate paths/presence/size/permissions and output path existence/writability/free-space result;
- runtime probes: yt-dlp/gallery-dl/FFmpeg/FFprobe/Deno `--version` and exit/error summaries, plus dependency compatibility;
- execution facts: active/pending queue, active candidate identity/generation, last bounded failure categories/attempts, and cancellation state;
- Browser Bridge facts: loopback listener state, connected client count, pending request counts/timeouts, and last bridge error (only if an owner exposes them); otherwise report unknown, not healthy;
- platform/package facts: OS/arch, packaged state, resource/config/temp locations (redacted paths or presence-only in exported support output), and executable permission/signing/quarantine probe results where platform APIs permit.

P1 must not call `start_runtime_dependency_bootstrap`, run a download, replace files, delete stale runtime roots, mutate selection, write config, or create directories. It must avoid `runtimeRootFor`'s `mkdirSync` side effect or introduce a non-creating status path (current behavior: `runtimePaths.ts:94-105`). Repair/update remains explicit, separately authorized, and P2-owned.

### P2 — managed yt-dlp update/rollback

P2 owns release manifest/authenticity policy, download-to-temp, verification, immutable versioned staging, eligibility probes, selection/activation, rollback, reference retention, and user-triggered repair/update reporting. It must call the existing yt-dlp engine through the current runtime authority. It must not generalize into an FFmpeg/gallery-dl universal updater, and it must not alter provider routing or introduce a second process runner.

### Key risks

- **Baseline contradiction:** no bundled yt-dlp candidate currently exists, despite the planning invariant.
- **Read-only violation:** status/path inspection creates managed runtime directories.
- **Duplicate authority:** a new updater/downloader or direct Diagnostic spawn could bypass the engine registry and Application job lifecycle.
- **Mutable identity:** same-path replacement can mix candidate/dependencies or break active jobs.
- **Integrity/authenticity:** current binary bootstrap has size/SHA checks; package install and future release metadata need an approved authenticity/downgrade policy.
- **Windows hidden-process/layout:** active spec requires proxy-front binaries but current code resolves `real/`; verify actual packaged child behavior.
- **macOS trust:** app is deliberately unsigned/non-notarized, and repo only documents quarantine repair for the app bundle.
- **Path/storage:** exact installed vs portable user-data locations and writable semantics are not proven for backend candidates.
- **Concurrency/cleanup:** current per-tool in-flight promise joins do not protect replacement against active process references.

### Feasibility conclusion

P1 is feasible now with a carefully read-only adapter over existing owners, after eliminating/avoiding directory creation during status collection. P2 is conditionally feasible and should remain unstarted until the bundled baseline, candidate identity contract, authenticity policy, cross-platform packaging proof, and active-job reference/activation rules are reviewed. Managed yt-dlp can be an execution candidate, but current code is not yet a bundled-vs-managed selector and must not be described as one.

### Concrete pre-implementation validations

1. Build/package Windows NSIS and portable artifacts; inspect exact bundled baseline, Python, managed runtime, FFmpeg/FFprobe/Deno, proxy-front/`real/`, and executable paths.
2. On Windows, run a real yt-dlp download, version probe, FFmpeg merge, Deno-assisted YouTube path, cancellation, retry, and concurrent downloads while confirming no console flash and stable candidate identity.
3. On macOS x64 and arm64, build/relocate the app, inspect symlink/executable bits, run version probes/download/FFmpeg merge/cancel, and verify unsigned-app first launch plus managed binary execution after quarantine conditions.
4. Prove whether `app.getPath("userData")` is writable and stable for installed NSIS, portable, and macOS DMG installs; define portable persistence and upgrade behavior.
5. Add a no-side-effect test around Diagnostics: no directory creation, network request, process termination, file write/delete, bootstrap, activation, or config mutation.
6. Define and test a candidate manifest authenticity chain, exact hash/size/signature policy, redirect/source allowlist, downgrade policy, and rollback behavior before any network updater code.
7. Add a candidate identity/activation-generation trace to one job, including yt-dlp, Python, FFmpeg, FFprobe, and Deno; verify retries never mix generations.
8. Test failed download, checksum/signature failure, failed version probe, missing dependency, managed execution failure, fallback to bundled, rollback, app update coexistence, cancellation, process-tree settlement, and cleanup retention.
9. Reconcile the stale bundled-downloader language in `.trellis/spec/backend/sidecar-runtime-contracts/03-electron-download-runtime-core.md:37-43` and the current Windows proxy-front requirement with implementation before Architecture Review.
10. Verify Browser Bridge diagnostic facts and privacy boundaries: listener/client count, pending request timeout, protocol/version, and sanitized errors must be exposed by the existing loopback owner or explicitly reported NOT VERIFIED.

## Evidence classification note

Claims labeled **Confirmed** are directly present in current code/config/spec evidence. “Recommended”, “should”, and “must” under P1/P2 are architecture recommendations derived from the task invariants and the observed ownership boundaries. Items labeled **NOT VERIFIED** are intentionally not inferred from repository configuration, especially signing/notarization/quarantine of managed executables, exact portable user-data paths, Windows proxy-front behavior, and x64 macOS release verification.
