## Scenario: Electron Managed Runtime Bootstrap Module Contract

### 1. Scope / Trigger

- Trigger: Any task that changes managed runtime path resolution, pinned runtime downloads, checksum verification, runtime install steps, or the Electron runtime dependency gate bootstrap callback path.
- Why this needs code-spec depth: The flow crosses Electron main, managed runtime installers, runtime status inspection, renderer recovery UI, network download behavior, filesystem replacement, and release-pinned checksum policy.

### 2. Signatures

Bootstrap module:

```ts
// electron/managedRuntimeBootstrap.mts
type ManagedRuntimeStage = "checking" | "downloading" | "installing" | "verifying";

type ManagedRuntimeActivity = {
  component: RuntimeDependencyManagedComponent;
  stage: ManagedRuntimeStage;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
};

type ManagedRuntimeBootstrapOptions = {
  configDir: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  fetch: typeof fetch;
  log?(message: string): void;
  onActivity?(activity: ManagedRuntimeActivity): void | Promise<void>;
  now?(): number;
};

function currentManagedRuntimeTarget(
  platform?: NodeJS.Platform,
  arch?: NodeJS.Architecture,
): string;

// electron/ytDlpBaseline.mts
function ensureBundledYtDlpBaselineReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { baselineRoot: string },
): Promise<string>;

function ensureManagedGalleryDlRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string>;

function ensureManagedFfmpegRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string>;

function ensureManagedDenoRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string>;
```

Electron main adapter:

```ts
// electron/main.mts
function buildManagedRuntimeBootstrapOptions(
  missingComponents?: RuntimeDependencyManagedComponent[],
): ManagedRuntimeBootstrapOptions;
```

### 3. Contracts

- `electron/main.mts` owns runtime dependency gate state, UI Lab overrides, IPC command entrypoints, log routing, and event emission.
- `electron/managedRuntimeBootstrap.mts` owns managed runtime target/path helpers, bundled-Python-backed downloader venv bootstrap, Deno/FFmpeg artifact specs, runtime asset download, checksum verification, archive extraction, executable chmod, and file replacement.
- Bootstrap functions must receive Electron-specific dependencies through `ManagedRuntimeBootstrapOptions`; they must not import `app`, `BrowserWindow`, IPC handlers, or renderer event emitters.
- `buildManagedRuntimeBootstrapOptions(...)` must pass `configDir: getUserDataDir()`, `platform: process.platform`, `arch: process.arch`, `fetch: fetchWithDesktopSession`, bundled Python paths, `logInfo`, and an `onActivity` adapter into `updateRuntimeDependencyGateDownloadActivity(...)`.
- `ytDlp` is an immutable packaged wheel baseline (`yt-dlp` plus `yt-dlp-ejs`) materialized offline into `<userData>/runtimes/yt-dlp/<target>/baseline/`; `galleryDl` remains a managed Python package. Neither may fall back to direct binary releases, system Python, machine JavaScript, or a network package install during yt-dlp baseline materialization.
- Managed Python downloader package pins must have one app-owned source of truth: `electron/managedPythonPackageManifest.mts`. Scripts that need those pins must read the compiled Electron manifest instead of defining duplicate version/source constants.
- The packaged yt-dlp manifest and exact two wheels are mechanically checked against `managedPythonPackageManifest.mts` before packaging and from each packaged artifact. Runtime only rehashes local packaged bytes; it performs no release discovery or baseline download.
- `ensureMissingManagedRuntimesReady(...)` must prepare the bundled yt-dlp baseline, then `galleryDl`, `ffmpeg`, and `deno`, with a fresh runtime status snapshot between components.
- Runtime path helpers in `ytDlpBaseline.mts`, `managedRuntimeBootstrap.mts`, and `src/electron-runtime/runtimePaths.ts` must agree on the baseline cache and shared `real/` paths.
- `resolvePinnedManagedPythonPackage(...)` must throw for unsupported downloader tool ids instead of returning `undefined`.
- Shared Python package bootstrap must use per-tool in-flight promise joining so concurrent ensure calls for the same downloader reuse one install/rebuild flow instead of racing `rm`/`venv`/`pip install`.
- Managed `ffmpeg` and `deno` bootstrap must use component-and-target in-flight promise joining so startup prewarm and first real download do not download/extract the same managed binary concurrently.
- `replaceFile(...)` must preserve the old Electron main algorithm: try `unlink(target)`, then `rename(temp, target)`, and fall back to `copyFile(temp, target)` plus cleanup.
- Electron main must route every bootstrap/repair/reinstall mutation through one target-scoped runtime-set coordinator. A download attempt, advanced yt-dlp probe, FFprobe analysis, or FFmpeg transcode acquires a lease atomically with readiness and releases it only after its child process tree settles; a mutation while leased fails busy instead of replacing a referenced path.
- `buildAttemptContext` is the yt-dlp pin boundary: it receives one `{ lease, binaries, identity }` binding after the baseline and shared FFmpeg/FFprobe/Deno facts are verified. Internal runner retries reuse that binding; a new engine attempt resolves another binding. A binding error releases any acquired lease before it escapes.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Existing committed yt-dlp baseline cache | `ensureBundledYtDlpBaselineReady(...)` | Return its entrypoint only when `baseline.json`, Python identity, package set, and probe match | Keep gate state unchanged except later refreshed status |
| Missing Deno/FFmpeg runtime | `select*RuntimeArtifactSpec(...)` + download/extract | Download pinned archive, verify size/checksum, extract executable(s), chmod on non-Windows, replace final file | Surface activity stages through `onActivity` |
| Missing/corrupt yt-dlp baseline cache | `ensureBundledYtDlpBaselineReady(...)` | Rebuild a staging venv from verified packaged wheels using offline hash-locked pip, then write `baseline.json` last | Do not execute a partial/stale cache or contact the network |
| Missing gallery-dl runtime, stale baseline marker, package/Python/layout mismatch, or entrypoint missing | relevant ensure function | Rebuild only the affected cache/venv under the mutation coordinator | Leave unrelated runtime roots untouched |
| Unsupported platform/arch | `currentManagedRuntimeTarget(...)` | Throw unsupported managed runtime target error | Gate surfaces bootstrap failure |
| Unsupported downloader tool id | `resolvePinnedManagedPythonPackage(...)` | Throw `Unsupported managed Python package tool: <id>` | Do not continue with undefined metadata |
| Download stalls or all fallback URLs fail | `downloadRuntimeAssetWithFallbacks(...)` | Remove temp file and throw `Failed to download managed <component> runtime: ...` | Gate remains recoverable for retry |
| Checksum or size mismatch | `verifyDownloadedRuntimeAsset(...)` | Throw mismatch error before replacing final binary | Leave existing final binary untouched |

### 5. Good / Base / Bad Cases

- Good: `electron/main.mts` materializes the checked packaged yt-dlp wheel set offline and reports `checking`, `installing`, and `verifying` through `onActivity`.
- Base: all runtimes already exist, so bootstrap functions return paths and no network request is made.
- Bad: importing `app.getPath(...)` or `updateRuntimeDependencyGateDownloadActivity(...)` inside `managedRuntimeBootstrap.mts`, which would couple installer logic back to Electron main state.
- Bad: changing baseline cache paths or packaged-wheel verification without updating `runtimePaths.ts`, causing status inspection to disagree with the attempt binding.
