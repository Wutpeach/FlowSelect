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

function ensureManagedYtDlpRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
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
- `ytDlp` and `galleryDl` are managed Python packages bootstrapped from the bundled CPython runtime into per-tool venvs; neither may fall back to direct binary release downloads or system Python in steady state. The managed yt-dlp package set includes exact app-owned `yt-dlp` and `yt-dlp-ejs` pins.
- Managed Python downloader package pins must have one app-owned source of truth: `electron/managedPythonPackageManifest.mts`. Scripts that need those pins must read the compiled Electron manifest instead of defining duplicate version/source constants.
- `ensureMissingManagedRuntimesReady(...)` must call managed bootstrap functions in `MANAGED_RUNTIME_BOOTSTRAP_ORDER`-compatible dependency order: `ytDlp`, `galleryDl`, `ffmpeg`, then `deno`, with a fresh runtime status snapshot between components.
- Runtime path helpers in `managedRuntimeBootstrap.mts` must stay consistent with `src/electron-runtime/runtimePaths.ts` so status inspection and installer output point at the same `real/` files.
- `resolvePinnedManagedPythonPackage(...)` must throw for unsupported downloader tool ids instead of returning `undefined`.
- Shared Python package bootstrap must use per-tool in-flight promise joining so concurrent ensure calls for the same downloader reuse one install/rebuild flow instead of racing `rm`/`venv`/`pip install`.
- Managed `ffmpeg` and `deno` bootstrap must use component-and-target in-flight promise joining so startup prewarm and first real download do not download/extract the same managed binary concurrently.
- `replaceFile(...)` must preserve the old Electron main algorithm: try `unlink(target)`, then `rename(temp, target)`, and fall back to `copyFile(temp, target)` plus cleanup.
- Electron main must route every bootstrap/repair/reinstall mutation through one target-scoped runtime-set coordinator. A download attempt, advanced yt-dlp probe, FFprobe analysis, or FFmpeg transcode acquires a lease atomically with readiness and releases it only after its child process tree settles; a mutation while leased fails busy instead of replacing a referenced path.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Existing managed runtime binary exists | `ensureManaged*RuntimeReady(...)` | Return existing path without rebuilding | Keep gate state unchanged except later refreshed status |
| Missing Deno/FFmpeg runtime | `select*RuntimeArtifactSpec(...)` + download/extract | Download pinned archive, verify size/checksum, extract executable(s), chmod on non-Windows, replace final file | Surface activity stages through `onActivity` |
| Missing `yt-dlp` / `gallery-dl` managed runtime | `ensureManaged*RuntimeReady(...)` | Create per-tool venv from bundled Python, install the exact pinned package set, chmod entrypoints, write metadata | Report `checking`/`installing`/`verifying` through `onActivity` |
| Metadata missing, layout version mismatch, stale `real/` dir, entrypoint missing, pinned package set changed, or bundled Python version changed | `shouldRebuildManagedPythonRuntime(...)` | Remove stale runtime root and rebuild that downloader venv from scratch | Leave other downloader venvs untouched |
| Unsupported platform/arch | `currentManagedRuntimeTarget(...)` | Throw unsupported managed runtime target error | Gate surfaces bootstrap failure |
| Unsupported downloader tool id | `resolvePinnedManagedPythonPackage(...)` | Throw `Unsupported managed Python package tool: <id>` | Do not continue with undefined metadata |
| Download stalls or all fallback URLs fail | `downloadRuntimeAssetWithFallbacks(...)` | Remove temp file and throw `Failed to download managed <component> runtime: ...` | Gate remains recoverable for retry |
| Checksum or size mismatch | `verifyDownloadedRuntimeAsset(...)` | Throw mismatch error before replacing final binary | Leave existing final binary untouched |

### 5. Good / Base / Bad Cases

- Good: `electron/main.mts` creates options once per component install and the bootstrap module reports `downloading`, `verifying`, and `installing` through `onActivity`.
- Base: all runtimes already exist, so bootstrap functions return paths and no network request is made.
- Bad: importing `app.getPath(...)` or `updateRuntimeDependencyGateDownloadActivity(...)` inside `managedRuntimeBootstrap.mts`, which would couple installer logic back to Electron main state.
- Bad: changing `managedYtDlpPaths(...)` without updating `runtimePaths.ts`, causing status inspection to report missing while installer wrote a different path.
