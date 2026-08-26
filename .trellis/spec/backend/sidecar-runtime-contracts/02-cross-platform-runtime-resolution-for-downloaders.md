## Scenario: Cross-Platform Runtime Resolution For Downloaders

### 1. Scope / Trigger

- Trigger: any change touching bundled Python packaging under `desktop-assets/binaries/`, managed runtime bootstrap, Electron runtime path resolution, or packaging scripts that prepare downloader prerequisites.
- Why this needs code-spec depth: runtime readiness now spans repo-managed bundled Python assets, packaged Electron resource layout, config-dir managed runtimes, and cross-platform process execution.

### 2. Signatures

- Runtime status/version surfaces:
  - `checkYtdlpVersion(...) -> Promise<DownloaderVersionInfo>`
  - `getGalleryDlInfo(...) -> Promise<DownloaderVersionInfo>`
  - `inspectRuntimeDependencyStatus(...) -> RuntimeDependencyStatusSnapshot`
- Bundled runtime preparation scripts:
  - `npm run runtime:ensure:python`
  - `npm run runtime:smoke:python`
  - `npm run runtime:smoke:downloaders`
  - `npm run runtime:verify:macos-package`
  - `node ./scripts/ensure-capability-probe-runtime.mjs --tool <tool>`
- Runtime bootstrap entrypoints:
  - `ensureManagedYtDlpRuntimeReady(...)`
  - `ensureManagedGalleryDlRuntimeReady(...)`
  - `ensureManagedFfmpegRuntimeReady(...)`
  - `ensureManagedDenoRuntimeReady(...)`

### 3. Contracts

- Runtime path resolution:
  - Bundled Python is the only packaged prerequisite for Python downloaders.
  - `yt-dlp` and `gallery-dl` must resolve from managed per-tool virtualenvs under `app_config_dir/runtimes/<tool>/<target>/venv/...`.
  - Official downloader provenance is represented by pinned Python package sources in `electron/managedPythonPackageManifest.mts`, not by shipping standalone downloader release binaries.
  - Scripts that need managed Python package pins must read the compiled Electron manifest through `scripts/managed-python-package-manifest.mjs`; they must not define a second downloader version/source table.
  - Managed Python venv creation must use Python's default symlink-based layout on macOS. Do not pass `--copies` for macOS python-build-standalone runtimes, because copying the interpreter out of its bundled tree can break loader/runtime lookup and abort during `ensurepip`.
  - Managed Python downloader metadata must record both `bundledPythonVersion` and the concrete `bundledPythonPath`; if either changes, rebuild that downloader venv so app moves or packaged-resource path changes do not leave stale symlinks behind.
  - Repo-managed bundled-Python ensure flows must treat official provenance as part of readiness:
    - use the unified `runtime:ensure:python` entrypoint for local dev/build/package preparation
    - presence of an arbitrary matching `python-<target>` directory is not enough if the runtime has not been stamped by the repo manifest
    - the source-of-truth manifest is `desktop-assets/binaries/.official-python-runtimes.json`
  - Electron runtime path/status resolution for Python downloaders:
    - `python.source` must resolve as `"bundled"` when ready
    - `python.expectedSource` must be `"bundled"`
    - `ytDlp.expectedSource` and `galleryDl.expectedSource` must be `"managed"`
    - downloader managed runtime target paths live under `app_config_dir/runtimes/<tool>/<target>/venv/bin/<entrypoint>` (or `venv/Scripts/<entrypoint>.exe` on Windows)
  - Bundled Python candidate order must include:
    - repo dev tree: `<repoRoot>/desktop-assets/binaries/python-<target>`
    - packaged Electron resources: `<resourceDir>/binaries/python-<target>`
    - packaged Electron app resources: `<resourceDir>/app/desktop-assets/binaries/python-<target>`
    - portable/current exe fallback: `<exeDir>/binaries/python-<target>`
  - Status inspection and bootstrap output must agree on the same managed runtime paths; do not let `runtimePaths.ts` and `managedRuntimeBootstrap.mts` drift.
  - On Windows, app-managed console binaries that stream output back into Rust or Electron (`yt-dlp`, `gallery-dl`, selection probes, version checks) must use one shared hidden-CLI spawn path instead of `tauri-plugin-shell` spawn so multi-process routes do not flash transient console windows.
  - The shared Windows helper must keep `CREATE_NO_WINDOW` intact and must not combine it with `DETACHED_PROCESS`, because that causes the no-window flag to be ignored.
  - App-managed yt-dlp invocations must include `--ignore-config` so portable builds do not inherit host-machine yt-dlp configuration files.
- Managed runtime install contract:
  - App-owned managed runtimes install under `app_config_dir/runtimes/<component>/<target>/`.
  - `python` is a bundled prerequisite and must not enter `missingComponents` or `MANAGED_RUNTIME_BOOTSTRAP_ORDER`.
  - If bundled Python is missing or invalid, runtime gate state must fail early with a reinstall-style error instead of attempting downloader bootstrap.
  - `deno` and `ffmpeg` are resolved from this managed runtime directory, not from bundled/resource or `PATH` fallbacks.
  - Electron startup must not auto-bootstrap managed runtimes before the main window has had a chance to render.
  - Startup may inspect runtime readiness and publish gate state, and if managed runtimes are missing the app should auto-start bootstrap only after the frontend main window is visibly expanded.
  - Compact icon-mode startup does not count as "main window visible" for auto-bootstrap purposes; startup bootstrap must not interrupt the compact first reveal by forcing an immediate expand.
  - The runtime reminder UI may expose hoverable progress/details during automatic bootstrap, but explicit click-to-retry should be reserved for failed or otherwise manual-action states.
  - Runtime gate refresh commands used by Settings/status surfaces must stay inspection-only; a separate bootstrap trigger should start downloads after first paint or explicit retry.
  - Renderer startup auto-bootstrap scheduling must survive gate/status refresh re-renders until the delayed bootstrap callback actually fires; do not mark the current-session startup bootstrap as "already triggered" until the command dispatch begins.
  - If a delayed startup bootstrap callback runs but `start_runtime_dependency_bootstrap` returns `phase: "idle"` or no payload, the renderer may clear the one-shot startup latch and allow one later retry after the window becomes ready again.
  - Managed runtime download/extract temp paths may live inside the target runtime directory, so the parent directory must be created before opening temp files.
  - Managed runtime downloads must validate expected size + sha256 before install and replace the live binary atomically.
  - Electron-owned managed-runtime bootstrap HTTP requests must use Electron session / Chromium network fetch rather than Node global `fetch`, so startup bootstrap respects system proxy, PAC, and any session-level proxy overrides.
  - Downloader managed bootstrap must source Python from bundled runtime bootstrap options; do not fall back to system Python in steady state.
  - Shared Python package bootstrap must use per-tool in-flight promise joining so startup prewarm, settings refresh, and first real download converge on one venv install/rebuild flow per tool.
  - Managed `ffmpeg` and `deno` bootstrap must use component-and-target in-flight promise joining so startup prewarm, yt-dlp engine preparation, and first real download converge on one managed binary install flow per component.
- Runtime contract for `ffmpeg` used by yt-dlp/internal post-processing:
  - `ffmpeg` is no longer bundled into the Windows portable ZIP or treated as a system `PATH` dependency.
  - Runtime must bootstrap `ffmpeg` into `app_config_dir/runtimes/ffmpeg/<target>/` from a pinned FFmpegBin release asset when missing.
  - Current pinned managed asset set is FFmpegBin `8.0.1`:
    - Windows x64 -> `ffmpeg-windows-x64.zip`
    - macOS arm64 -> `ffmpeg-osx-arm64.zip`
    - macOS x64 -> `ffmpeg-osx-x64.zip`
  - The downloaded archive must be checksum/size validated before extracting the required `ffmpeg` and `ffprobe` entries.
  - The install flow should stage both binaries first, then replace the runtime directory so partial writes do not become the steady-state runtime.
  - On Windows, the extracted console binaries under `app_config_dir/runtimes/ffmpeg/<target>/real/ffmpeg.exe` and `real/ffprobe.exe` are the only managed paths; do not add root proxy-front executables.
  - yt-dlp invocations that rely on merged A/V streams must pass `--ffmpeg-location` using the resolved managed runtime path instead of assuming `PATH`.
  - On Windows, `--ffmpeg-location` and the bounded FFmpeg `PATH` prepend must point at the authoritative `real/` directory. Hidden-window behavior remains owned by the Node process runner, not by forwarding executables.
  - Internal Rust ffmpeg invocations (AE normalization, slicing, encoder probe) must use the same managed runtime path and must ensure bootstrap before spawn.
  - On Windows, internal CLI launches for ffmpeg/ffprobe probes and post-processing must use hidden-window process flags so AE-friendly normalization does not flash a transient console window.
  - Failure/cancel paths must remove captured yt-dlp split-stream artifacts such as `*.f30112.mp4` and `*.f30280.m4a`.
  - If the main yt-dlp route fails with `HTTP Error 416` / `Requested Range Not Satisfiable`, runtime must clean stale resume artifacts and retry exactly once with `--no-continue --no-part`.
  - If the initial yt-dlp extraction fails with a clearly transient TLS/SSL/connection failure such as `UNEXPECTED_EOF_WHILE_READING`, `SSLError`, `EOF occurred in violation of protocol`, connection reset, or read timeout, runtime must clean task artifacts and retry the same yt-dlp plan exactly once.
  - Transient yt-dlp network retry must not apply after cancellation and must not mask terminal availability errors such as private/unavailable videos, login/auth failures, region restrictions, or HTTP 403/404/412/416/429 responses.
- Runtime contract for `deno` managed runtime:
  - `deno` is no longer bundled as a packaged Tauri resource or portable helper binary.
  - Runtime must bootstrap `deno` into `app_config_dir/runtimes/deno/<target>/deno(.exe)` from a pinned upstream asset when missing.
  - On Windows, the extracted console binary at `app_config_dir/runtimes/deno/<target>/real/deno.exe` is the only managed path; do not add a root proxy-front executable.
  - Current pinned managed asset set is Deno `2.7.1`:
    - Windows x64 -> `deno-x86_64-pc-windows-msvc.zip`
    - macOS arm64 -> `deno-aarch64-apple-darwin.zip`
    - macOS x64 -> `deno-x86_64-apple-darwin.zip`
  - Download source order should prefer official `dl.deno.land/release/...` URLs and fall back to the matching GitHub release asset if the CDN path fails.
  - The downloaded archive must be checksum/size validated before extracting the single `deno` / `deno.exe` entry.
  - Extraction/install should retry transient failures in the same bootstrap run before surfacing a terminal error to the user.
  - yt-dlp paths that rely on JavaScript runtimes must ensure managed `deno` is ready before spawn and pass exactly `--js-runtimes deno:<absolute-managed-deno-path>`; Deno is never discovered through `PATH`.
- Runtime contract for YouTube route:
  - YouTube runs must start with the extended extractor path: `--extractor-args youtube:player_js_variant=tv`.
  - The runtime must not start public/default YouTube runs with light extractor args such as `youtube:player_client=android,web`; that path can succeed while exposing only low-resolution progressive MP4 formats.
  - Do not enable `--remote-components ejs:github`; the exact app-owned managed package set includes `yt-dlp-ejs`.
  - Pass only the explicit managed Deno runtime (`--js-runtimes deno:<absolute-managed-deno-path>`); do not pass bare `deno`, `node`, or a machine/runtime `PATH` fallback.
  - Pass `--ignore-config --no-plugin-dirs` so user configuration and plugin directories cannot alter baseline execution.
  - `pageUrl`, `selectionScope == "current_item"`, cookies, and legacy YouTube extension mode hints must not change the extractor profile away from the extended path.
  - Retired payload fields such as `forceExtended` / `allowCookies` may be tolerated as ignored compatibility input, but they are not active runtime mode switches.
  - If extension cookie file exists, attach it for YouTube URLs as well (`youtube.com`, `youtu.be`) to improve fetch success on 403-prone routes.
  - App-managed yt-dlp and ffmpeg executions default to the user's ambient network route. Ameow must not silently translate a single Electron `session.resolveProxy(...)` result or HTTP(S) proxy environment value into a default yt-dlp `--proxy`.
  - Electron `resolveProxy(...)` and HTTP(S)/ALL proxy environment values may be sampled for diagnostics only. For YouTube/GitHub network failures, user-facing guidance should prefer proxy-tool TUN/global/VPN mode because yt-dlp and ffmpeg may contact multiple hosts during one download.
  - Automatically detected SOCKS/PAC/rule-based proxy setups should be logged as diagnostics rather than passed into the YouTube section-download ffmpeg path.
  - Temporary Netscape cookie files created from extension-provided cookies must be written under the OS temp directory (`tmpdir()` or equivalent), not `process.cwd()` or packaged resource paths, because packaged macOS apps can run with a read-only current working directory.
- Clipboard contract:
  - `get_clipboard_files()` uses `clipboard-win` only on Windows.
  - On non-Windows: return error string, do not panic/compile-fail.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| bundled `python-<target>` directory missing from packaged resources | runtime status inspection / package smoke | runtime gate fails before downloader bootstrap | rerun `npm run runtime:ensure:python` and repackage |
| non-Windows build imports `clipboard-win` directly | Rust compile step | Compile error unresolved import | Guard import/function logic with `#[cfg(windows)]` |
| bundled Python executable loses exec bit on Unix | runtime process spawn | `Permission denied` on bootstrap or smoke check | restore executable mode during ensure/extract |
| portable package leaves duplicate helper executables at root | package inspection + runtime version check | users can observe stale duplicate files after update | ship helper executables only under `binaries/` |
| installer/resource layout omits `desktop-assets/binaries/python-<target>` | runtime status / startup gate | Python downloaders cannot bootstrap | include the current target bundled Python directory in packaged resources |
| host machine has custom yt-dlp config | packaged download runtime | portable build behaves differently across machines | pass `--ignore-config` on app-managed yt-dlp invocations |
| Electron main-process HTTP downloads use Node global `fetch` instead of Electron session fetch | managed runtime bootstrap / updater / version checks | proxy-configured users bypass system/session proxy settings and remote downloads can appear unusually slow or fail | route requests through Electron session / Chromium network fetch |
| Windows managed downloader path uses a generic shell/plugin spawn | highest-quality or retry-heavy download runtime | one or more transient console windows can flash even though the main app is GUI-only | route the process through the shared native hidden-CLI helper |
| yt-dlp exits 0 after reusing an existing file | packaged/runtime completion normalization | app reports false failure because no final path was captured from stdout | recover final path from `after_move:filepath` report and keep stdout parsing only as fallback |
| non-host packaging prepare tries to execute foreign Python | cross-target packaging prepare | packaging fails on the host before artifact assembly | skip runtime smoke execution for non-host targets while still verifying checksum/extract/manifest |
| managed `deno` runtime missing | app startup / yt-dlp spawn | YouTube-capable yt-dlp path cannot start JS runtime | bootstrap `deno` into `app_config_dir/runtimes/...` before yt-dlp spawn |
| managed `deno` archive checksum mismatch | runtime bootstrap | corrupted runtime would be installed | reject archive and keep runtime missing |
| managed `deno` archive extracted from unvalidated asset | runtime bootstrap | runtime provenance is unclear | validate archive size + sha256 before extraction |
| managed runtime temp archive path lives under a missing target directory | runtime bootstrap temp-file creation | bootstrap fails before the HTTP download actually starts | create the temp path parent directory before opening the temp file |
| managed `ffmpeg` runtime missing | app startup / yt-dlp merge / AE normalize / slicing | download or post-processing cannot spawn media tools | bootstrap `ffmpeg` into `app_config_dir/runtimes/...` before spawn |
| managed `ffmpeg` archive checksum mismatch | runtime bootstrap | corrupted runtime would be installed | reject archive and keep runtime missing |
| managed `ffmpeg` archive is missing `ffmpeg` or `ffprobe` | runtime bootstrap | runtime would be only partially usable | fail install and keep runtime missing until both files are present |
| app launches into compact icon mode with missing managed runtimes | startup bootstrap timing | compact first reveal regresses into an unsolicited main-window expand | defer startup bootstrap until the renderer is in the expanded main-window state |
| startup auto-bootstrap timer is scheduled before gate/status refresh completes | renderer startup timing | effect cleanup can clear the pending timer and the UI stays stuck in missing-runtime `idle` state | keep the delayed timer alive across refresh-driven re-renders and set the one-shot latch only when dispatch begins |
| YouTube returns 403 while non-YouTube works | route-specific runtime behavior | YouTube media fetch fails after extraction | verify `--js-runtimes` arg shape and attach extension cookies when available |
| YouTube path uses light extractor args such as `youtube:player_client=android,web` | initial public-video resolve / format discovery | run can succeed while exposing only low-resolution progressive MP4 formats | keep YouTube on the extended extractor path |
| retired YouTube mode hint fields are treated as active switches | queue normalization / runtime planning | stale extension payloads can imply behavior that no longer exists | accept old fields only as ignored compatibility input |
| extension cookie temp file is created relative to `process.cwd()` in a packaged macOS app | app-managed YouTube download startup | writing `<trace>-cookies.txt` fails with `EROFS` before yt-dlp starts | write cookie temp files under `tmpdir()` and clean them up after the run |
| Windows ffmpeg/ffprobe launches use default console flags | AE-friendly post-processing runtime | transient black console window appears during normalization/probing | apply hidden-window flags on Windows CLI child launches |
| stale `.part` / `.ytdl` resume state exists | packaged Bilibili/generic yt-dlp download runtime | retry can fail with HTTP 416 on one machine but not another | clean temp artifacts and retry once without resume support |
| Bilibili/generic yt-dlp extraction hits transient TLS EOF / `SSLError` before producing output | packaged Bilibili/generic yt-dlp download runtime | one transient network blip does not become a terminal user-visible failure | clean task artifacts and retry the same yt-dlp plan once |

### 5. Good / Base / Bad Cases

- Good:
  - `npm run runtime:ensure:python` prepares the official bundled Python runtime for the active package target.
  - `node ./scripts/smoke-python-runtime.mjs` passes and proves `venv`, `pip`, `sqlite3`, and `ssl` are usable from the bundled runtime.
  - `checkYtdlpVersion(...)` reports managed `yt-dlp` plus bundled Python metadata.
  - Windows portable ZIP contains helper executables only under `binaries/`.
  - On Windows, `highest` downloads, YouTube cookie-free probes, and `gallery-dl` runs complete without flashing transient console windows.
  - A clean config directory bootstraps `ffmpeg` into `app_config_dir/runtimes/ffmpeg/<target>/`, and Windows packaged builds can merge yt-dlp split streams without any system-installed ffmpeg.
  - The same managed yt-dlp package set behaves identically on two Windows machines even if one host has custom yt-dlp config files installed.
  - A prior interrupted Bilibili `highest` download recovers automatically on the next attempt instead of surfacing raw HTTP 416 to the user.
  - A Bilibili extraction that fails once with `[SSL: UNEXPECTED_EOF_WHILE_READING]` retries once and succeeds without changing the user's selected quality.
- Base:
  - `yt-dlp` route works for generic platforms while direct path handles Douyin/Xiaohongshu CDN URLs.
- Bad:
  - Bundled Python is missing from packaged resources.
  - Update/download behavior depends on a user-installed Python or shell PATH state.
  - Windows-only crate imports break non-Windows compilation.
  - Download behavior depends on developer machine `PATH` state because managed `ffmpeg` bootstrap never runs.

### 6. Tests Required (with assertion points)

- Build assertions:
  - `npm run build` succeeds.
  - `npm run runtime:ensure:python` succeeds.
- Runtime assertions:
  - `npm run runtime:smoke:python` exits 0 on the host target.
  - `node ./scripts/smoke-python-runtime.mjs --mac zip` fails clearly on a Windows host instead of executing foreign-target Python; use `node ./scripts/ensure-python-runtime.mjs --mac zip` for cross-target preparation.
  - `npm run runtime:smoke:downloaders` exits 0 and verifies fresh per-tool venv creation plus pinned versions for `yt-dlp` and `gallery-dl`.
  - `npm run runtime:smoke:downloaders` also exercises local HTTP fixture downloads for managed `yt-dlp` and `gallery-dl`, proving those venv entrypoints can produce output files without relying on external sites.
  - `node ./scripts/ensure-capability-probe-runtime.mjs --tool yt-dlp` exits 0.
  - `npm run package:win:dir` and `npm run package:portable:skip-build` succeed on Windows host verification.
  - Packaged Electron resources include `desktop-assets/binaries/python-<target>` for the current target.
  - On macOS package verification, `npm run runtime:verify:macos-package -- <arm64|x64> require-execution require-downloader-bootstrap require-relocation-rebuild` must pass against the built `.app` bundle. This verifies the `.app/Contents/Resources/app/desktop-assets/binaries/python-<target>` layout, Python runtime manifest provenance, compiled `managedPythonPackageManifest.mjs`, packaged `main.mjs` resource-dir wiring, absence of old standalone downloader assets, packaged Python venv/pip execution, fresh packaged `yt-dlp` / `gallery-dl` venv bootstrap, pinned downloader versions, and bundled-Python-path-change rebuild behavior on the matching host architecture.
  - Launch the packaged/main app with missing managed runtimes and assert the first visible window appears before any managed-runtime download starts.
  - Launch the app into compact icon mode with missing managed runtimes and assert startup bootstrap waits until the expanded main window is visible instead of forcing an unsolicited first-launch expand.
  - With missing managed runtimes on Electron/macOS startup, allow the initial status/gate refresh to settle and assert the delayed startup bootstrap still transitions from `idle` to `checking`/`downloading` without requiring a manual retry click.
  - Open Settings with missing runtimes and assert status refresh does not start a managed-runtime bootstrap by itself.
  - On a clean config directory without managed runtimes, startup or first yt-dlp JS-runtime use bootstraps `deno` into `app_config_dir/runtimes/deno/<target>/`.
  - On a clean config directory without managed runtimes, startup or first media-tool use bootstraps `ffmpeg` into `app_config_dir/runtimes/ffmpeg/<target>/` with both `ffmpeg` and `ffprobe`.
  - On a Windows portable package without external tooling installed, a merged yt-dlp download produces a single final file and no `.f*` residue.
  - A mocked Bilibili yt-dlp run that first emits `UNEXPECTED_EOF_WHILE_READING` and exits non-zero is retried once with the same format profile after task artifact cleanup.
  - On Windows, a `highest` download path that triggers extra yt-dlp probe/retry work still completes without transient console windows.
  - Trigger a public injected YouTube download with no cookies and assert the first yt-dlp attempt includes `youtube:player_js_variant=tv`, `--js-runtimes deno:<absolute-managed-deno-path>`, `--no-plugin-dirs`, and no remote component argument.
  - Pass legacy YouTube extension mode hint fields through queue normalization and assert they are ignored rather than preserved as active runtime hints.
  - On Windows with `AE-Friendly Format` enabled, ffmpeg-backed post-processing completes without showing a transient console window.
  - When yt-dlp reports `has already been downloaded`, the app still resolves the existing final file path and emits success instead of `E_OUTPUT_NORMALIZATION_FAILED`.
  - Inspect the Windows portable ZIP and assert bundled Python remains under packaged resources while `ffmpeg` is absent from the artifact because it now bootstraps on first use.

### 7. Wrong vs Correct

#### Wrong

```ts
return childProcess.spawn("python3", ["-m", "venv", targetDir]);
```

```ts
return path.join(resourceDir, "binaries", "yt-dlp.exe");
```

#### Correct

```ts
const bundledPythonPath = resolveBundledPythonRuntime(environment).executable;
await runUtilityCommand(bundledPythonPath, ["-m", "venv", targetDir]);
```

```ts
const bundledPython = resolveBundledPythonRuntime(environment);
const ytDlp = resolveManagedYtDlpRuntimePaths(environment).entrypoint;
```

---
