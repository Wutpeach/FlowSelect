## Scenario: Electron Proxy Resolution Contract

_Part 1 of 4._


### 1. Scope / Trigger

- Trigger: Any task that changes desktop-side proxy behavior for Settings, bootstrap, update checks, Electron-owned fetch requests, or app-managed downloader CLI invocations.
- Why this needs code-spec depth: Proxy handling crosses persisted config, Electron session wiring, managed runtime bootstrap, renderer Settings state, and yt-dlp/gallery-dl child-process downloads.

### 2. Signatures

Electron main ownership:

```ts
async function applyDesktopSystemProxy(): Promise<void>

async function applyDesktopManualProxy(proxyUrl: string): Promise<void>

type EffectiveNetworkProxyPolicy =
  | { mode: "system"; reason: "user_system" | "invalid_manual" | "manual_unverified" | "manual_unavailable" }
  | { mode: "manual"; proxyUrl: string; verifiedAtMs: number };

type NetworkProxyStatePayload = {
  preferenceMode: "system" | "manual";
  configuredProxy: {
    url: string;
    scheme: "http" | "https";
    host: string;
    port: string | null;
  } | null;
  effectivePolicy: EffectiveNetworkProxyPolicy;
  validationStatus: "idle" | "validating" | "available" | "unavailable" | "invalid";
  validationResults: Array<{
    id: "github" | "deno" | "pypi";
    url: string;
    ok: boolean;
    status: number | null;
    error: string | null;
  }>;
  updatedAtMs: number;
};
```

Renderer command / event contract:

```ts
type AmeowRendererCommand = "get_network_proxy_state" | "save_config" | ...;
type AmeowAppEvent = "network-proxy-state-changed" | ...;
```

CLI proxy diagnostic helpers:

```ts
function resolveCliProxyUrlFromElectronProxyRules(
  proxyRules: string | null | undefined,
): string | null;

function resolveCliProxyUrlFromEnvironment(
  env: Record<string, string | undefined>,
): string | null;

function buildCliProxyDiagnosticFromElectronProxyRules(
  proxyRules: string | null | undefined,
  targetUrl?: string | null,
): CliProxyDiagnostic;

function buildCliProxyDiagnosticFromEnvironment(
  env: Record<string, string | undefined>,
  targetUrl?: string | null,
): CliProxyDiagnostic;
```

### 3. Contracts

- Default behavior is the system preference. `networkProxyMode` missing or `"system"` keeps the Electron session in `mode: "system"`; CLI tools receive the resolved route (system single candidate, target-resolved environment route, or explicit direct) through the shared route service instead of inheriting ambient proxy state.
- Manual proxy support is explicit and user-owned: `networkProxyMode: "manual"` plus a valid `networkProxyUrl` enables manual HTTP(S) proxy as the preferred policy. Supported manual URLs are only `http:` / `https:` with host and optional port, no credentials, path, query, hash, SOCKS, PAC, or per-site rules.
- Persisted preference and effective runtime policy are separate. Saved manual proxy remains preferred across restarts, but effective policy may fall back to system/ambient when the manual proxy is invalid, unverified, or unavailable.
- `fetchWithDesktopSession(...)` remains the shared network entrypoint for managed runtime bootstrap, update checks, and other Electron-owned desktop fetches. The default session applies either system mode or manual fixed-server mode according to the effective policy.
- Manual Electron fixed-server mode must include local bypass rules for `<local>`, `localhost`, `127.0.0.1`, and `127.0.0.1:39527` so the browser-extension WebSocket bridge is never proxied.
- Saving config through `save_config` must re-evaluate proxy policy when `networkProxyMode` or `networkProxyUrl` changes. It must not activate stale historical proxy-like keys such as `globalProxyEnabled/globalProxyUrl`.
- Manual proxy validation is automatic and fixed-target only. Settings must not ask users to paste arbitrary content URLs or click a separate test button.
- Validation targets are app infrastructure: GitHub, Deno downloads, and PyPI. Use HEAD with bounded GET fallback, short timeouts, and concurrent probes. A single target failure may be shown as partial diagnostics; all-target failure or clear local proxy connection failure means manual proxy is unavailable and future work falls back to system/ambient.
- When effective manual proxy is active, pass it only through explicit supported paths:
  - Electron default session fixed-server proxy for Electron-owned fetches.
  - Managed Python package install environment as `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, and `https_proxy`.
  - yt-dlp `proxyUrl` path, which becomes `--proxy <url>`.
  - gallery-dl child-process proxy environment.
- Network routing uses one shared precedence policy: effective manual proxy > URL-specific Electron/Chromium system result > target-resolved environment route > explicit direct. Every consumer (Electron session, yt-dlp, gallery-dl, pip/bootstrap, and runtime asset fetch) resolves through the same `NetworkRouteService` and never reads ambient proxy state itself.
- A single supported system directive (`PROXY`/`HTTP`/`HTTPS`/`SOCKS4`/`SOCKS5`/`SOCKS`) resolved for the canonical target URL may be applied to CLI downloads as the resolved route, with one exception: actual yt-dlp downloads reject SOCKS4/SOCKS5 before spawn because yt-dlp may delegate the remote transfer to FFmpegFD (live HLS, `m3u8` protocol, native-HLS fallback, or `--download-sections`, all selected inside yt-dlp after spawn) and ffmpeg cannot use SOCKS proxies. gallery-dl and the non-downloading yt-dlp quality probe keep one `--proxy <socks-url>`. The route and its diagnostics record `resolvedFor` and must not be described as a guarantee for every downstream host (PAC single-candidate provenance limitation stays explicit).
- System results that are multiple candidates, malformed, or unsupported become an explicit complex route with a typed diagnostic; they are never collapsed into a CLI proxy and never silently fall through to the environment tier. Complex routes fail before engine spawn with `NETWORK_PROXY_UNSUPPORTED`.
- An explicit system `DIRECT` is a final direct route with source `system`; the target-resolved environment tier is never evaluated after it. The environment tier is evaluated only when the system tier is unavailable/not-applicable. `NO_PROXY`/`no_proxy` is evaluated for the canonical target first; a match produces an explicit direct route. Environment precedence is `HTTPS_PROXY > https_proxy > ALL_PROXY > all_proxy > HTTP_PROXY > http_proxy` for HTTPS targets and `HTTP_PROXY > http_proxy > ALL_PROXY > all_proxy` for HTTP targets; the first non-empty authoritative value wins, and a malformed/unsupported authoritative value is complex rather than silently downgraded.
- Engine child environments remove every upper/lower HTTP(S)/ALL/NO proxy key before applying the selected route as CLI arguments. yt-dlp direct is the explicit `--proxy ""`; gallery-dl direct is `--proxy ""` plus `-o extractor.*.proxy-env=false` on every invocation, so Requests cannot discover a second routing authority from the environment or the Windows Registry.
- Each queued download Job resolves its base network route once into a stable `DownloadExecutionContext`; engine retry, engine fallback, and auth recovery reuse it. Route refresh requires an explicit rebuild with a new context identity; P0 exposes no implicit refresh. Runtime bootstrap resolves its own per-target contexts through the same service.
- Electron `resolveProxy(...)` and HTTP(S)/ALL proxy environment variables are no longer diagnostics-only: they feed the unified route resolution. Diagnostics entries include the sanitized `resolvedFor` target host/origin, source, route mode, proxy protocol, resolution status, consumer, applied flag, and failure classification; credentials, cookies, tokens, and raw rules are never logged.
- Proxy-shaped failures while effective manual proxy is active should mark manual proxy suspect, switch future work to system/ambient, and revalidate the saved manual proxy through an isolated manual-proxy validation session. Do not fallback for HTTP 403/404/412/416/429, auth/login/cookie failures, private or region-limited content, extractor/site-rule failures, or ffmpeg merge/transcode failures.
- Diagnostics and support logs may include sanitized manual proxy scheme, host, and port. They must not log credentials, cookies, or raw unparsed proxy rules.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Desktop app startup with no proxy config | Electron session apply | Desktop session uses system proxy mode | Continue shared session-backed fetch flow |
| Desktop app startup with saved valid manual proxy | policy controller | Apply manual fixed-server proxy immediately, then validate in background | Keep manual if validation succeeds; fallback if unavailable |
| Manual proxy URL has credentials/path/query/hash/SOCKS | config parser / Settings | Treat as invalid manual config | Save only valid URLs from Settings; effective policy uses system |
| `save_config` receives valid `networkProxyMode/manual` and `networkProxyUrl` | config save | Reconfigure session and start validation | Emit `network-proxy-state-changed` |
| `save_config` receives stale `globalProxyEnabled/globalProxyUrl` keys | config save | Persist as ordinary unknown config only; do not apply as proxy | Keep current canonical policy |
| Manual proxy validation has one success and two failures | validation controller | Manual proxy remains available | Show partial diagnostic status without disabling manual |
| Manual proxy validation has all failures | validation controller | Effective policy becomes system/manual_unavailable | Use system/ambient for future requests |
| Manual proxy effective and yt-dlp reports `ERR_PROXY_CONNECTION_FAILED` | failure feedback | Mark manual proxy suspect and revalidate | Fallback to system/ambient while revalidating |
| Manual proxy effective and content site returns HTTP 403 | failure feedback | Do not mark proxy unavailable | Continue normal download troubleshooting |
| `session.resolveProxy(...)` returns `PROXY 127.0.0.1:7897; DIRECT` | route service | Apply the single system proxy route for the canonical target to CLI via the engine adapter | Sanitized `resolvedFor` diagnostics; downstream-host PAC equivalence is not claimed |
| `session.resolveProxy(...)` returns `SOCKS5 127.0.0.1:7891` | route service | Map to a socks5 route; gallery-dl and the yt-dlp probe apply one `--proxy` socks URL, actual yt-dlp downloads fail closed with `NETWORK_PROXY_UNSUPPORTED` (FFmpegFD cannot use SOCKS) | SOCKS from system/environment is supported where the engine can consume it; no manual SOCKS setting is added |
| `session.resolveProxy(...)` returns `PROXY a; PROXY b` or malformed output | route service | Produce an explicit complex route with typed diagnostic; never collapse or fall through to environment | Engines fail before spawn with `NETWORK_PROXY_UNSUPPORTED` |
| yt-dlp context receives a resolved route | yt-dlp adapter | Include exactly one `--proxy` (empty string for direct); scrub all proxy env keys | Complex routes rejected before spawn |
| gallery-dl context receives a resolved route | gallery-dl adapter | Always add `-o extractor.*.proxy-env=false`; exactly one `--proxy` (empty string for direct); scrub all proxy env keys | Windows Registry/environment auto-discovery cannot become a second routing authority |

### 5. Good / Base / Bad Cases

- Good: user enables TUN/global/VPN mode in their proxy tool, leaves Ameow on system proxy, and Electron, yt-dlp, gallery-dl, Python, Deno, and update/bootstrap traffic share the same ambient network route.
- Good: user selects manual proxy `http://127.0.0.1:7890`; Electron session, pip install, yt-dlp, and gallery-dl use that proxy while validation succeeds.
- Good: a saved manual proxy is down on restart; Ameow attempts it first, validation fails, and future work falls back to system/ambient without the user clearing the saved preference.
- Base: Electron resolves `PROXY 127.0.0.1:7897` for the canonical YouTube page URL, the route service records the sanitized route with `resolvedFor` scope, and yt-dlp receives exactly one `--proxy http://127.0.0.1:7897` with a scrubbed environment.
- Base: user types an invalid manual proxy value in Settings; the value is not applied, and effective policy remains system with unified route resolution.
- Bad: one feature uses a hand-written proxy setting while another uses Electron/system proxy resolution.
- Bad: Ameow presents a single-page `resolveProxy(...)` route as a guarantee for every downstream host (`googlevideo.com`, `ytimg.com`, remote component endpoints) without the `resolvedFor` scope limitation in diagnostics.
- Bad: stale persisted `globalProxyEnabled/globalProxyUrl` changes downloader behavior after the Settings UI has removed proxy controls.
- Bad: Settings adds arbitrary content-link testing or failure-screen deep links as part of proxy setup.
- Bad: HTTP 403 or login-required content disables the user-selected manual proxy.

### 6. Tests Required

- `src/config/networkProxy.test.ts`: manual URL validation rejects credentials, paths, query, hash, SOCKS, and stale historical keys.
- `electron/desktopProxy.test.mts`: system mode, manual fixed-server mode, and local bypass rules including `127.0.0.1:39527`.
- `electron/networkProxyPolicy.test.mts`: startup manual preference, partial validation success, all-target fallback, and proxy-shaped failure feedback.
- `electron/managedRuntimeBootstrap.test.mts`: managed Python package env includes proxy variables only when effective manual proxy is present.
- `src/electron-runtime/service.test.ts`: default path has no proxy, explicit/effective manual path populates execution context, and failed proxy resolution degrades to null.
- `src/electron-runtime/galleryDlDownload.test.ts`: gallery-dl gets proxy env only with effective manual proxy.
- `src/config/cliProxy.test.ts`: Electron/environment proxy samples remain diagnostics and are not default CLI proxy injection.
- `npm run type-check`, `npm run lint`, `npm test`, `npm run docs:build`, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
const proxyRules = await session.defaultSession.resolveProxy(targetUrl);
const proxyUrl = resolveCliProxyUrlFromElectronProxyRules(proxyRules);
args.push("--proxy", proxyUrl);
```

#### Wrong (pre-P0 diagnostics-only sampling)

```ts
const effectiveProxy = networkProxyPolicyController.resolveProxyUrl();
if (effectiveProxy) {
  args.push("--proxy", effectiveProxy);
}
```

#### Correct

```ts
const resolution = await networkRouteService.resolveRoute({ targetUrl, consumer });
const application = buildYtDlpNetworkApplication(resolution.route);
args.push(...application.args);
```

Why correct:
- `resolveProxy(...)` results are resolved through the unified precedence policy; a single supported directive for the canonical target may be applied, while multiple/malformed/unsupported results become explicit complex routes with diagnostics and never collapse into a global CLI proxy. Engine adapters own CLI conversion; manual-only injection would silently drop system and environment routes.

### 6. Tests Required

- `electron/managedRuntimeBootstrap.test.mts`: target/path resolution, pinned metadata, unsupported tool guard, asset selection, Deno/FFmpeg artifact specs, cache writing, and file replacement behavior when touched.
- `src/electron-runtime/runtimePaths.test.ts`: managed runtime status paths remain aligned with bootstrap install paths.
- `npx tsc -p tsconfig.electron.json --noEmit`: validates `.mts` imports and new module types despite `electron/main.mts` using `// @ts-nocheck`.
- Full pre-commit verification for this boundary: `npm test`, `npm run type-check`, `npm run lint`, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
// electron/managedRuntimeBootstrap.mts
import { app } from "electron";

const configDir = app.getPath("userData");
await updateRuntimeDependencyGateDownloadActivity(...);
```

#### Correct

```ts
// electron/main.mts
function buildManagedRuntimeBootstrapOptions(missingComponents = []) {
  return {
    configDir: getUserDataDir(),
    platform: process.platform,
    arch: process.arch,
    fetch: fetchWithDesktopSession,
    onActivity(activity) {
      return updateRuntimeDependencyGateDownloadActivity(
        missingComponents,
        activity.component,
        activity.stage,
        activity.downloadedBytes ?? null,
        activity.totalBytes ?? null,
      );
    },
  };
}
```

### Design Decision: Internal CLI Engine Manifests

**Context**: Ameow borrows the useful part of `media-downloader`'s multi-engine model by centralizing static CLI engine knowledge, but engine selection still belongs to Ameow providers/orchestration.

**Decision**: Static CLI invocation data for internal engines lives in `src/electron-runtime/engineManifest.ts`. Runtime modules such as `ytDlpDownload.ts` and `galleryDlDownload.ts` may keep execution-specific behavior, progress parsing, retry policy, cleanup, and output normalization, but should not reintroduce duplicated static flags or format profiles.

**Contracts**:
- `yt-dlp` manifest owns config isolation (`--ignore-config`), base/progress/encoding flags, `after_move` print keys, YouTube light/extended extractor args, remote component args, retry activity token, and quality format profiles.
- `gallery-dl` manifest owns config isolation (`--config-ignore`), base metadata flags, output filename/directory flags, sidecar extensions, line-tail limit, and default resolving activity token.
- Manifests are internal and versioned with the app; they are not user-installable engine plugins.
- Engine manifests must not own provider routing, browser-extension payload compatibility, runtime dependency bootstrap, cancellation semantics, or terminal completion-event behavior.
- Command planning modules (`src/electron-runtime/ytDlpCommandPlan.ts`, `src/electron-runtime/galleryDlCommandPlan.ts`) own pure argument/output planning derived from manifests and execution context. Download runtime modules still own cookie temp-file lifecycle, process spawning, stdout/stderr progress parsing, retry policy, cleanup, and result normalization.
- Command planning validation failures must throw `InvalidCommandPlanError` from `src/electron-runtime/commandPlanErrors.ts`.
- Runtime downloaders must map expected `InvalidCommandPlanError` failures to `DownloadRuntimeError("E_INVALID_ENGINE_PLAN", ...)` before spawning a CLI or issuing a direct network request.
- Runtime downloaders must preserve existing `DownloadRuntimeError` instances after local cleanup so orchestrator fallback/classification logic can use the original `code` and `classification`.
- If `yt-dlp` exits successfully but does not report an `after_move:filepath`, `runYtDlpDownload(...)` must throw `DownloadRuntimeError("E_OUTPUT_NOT_FOUND", ...)`, not a plain `Error`.

**Tests Required**:
- Manifest tests must assert host-config isolation flags remain present.
- Existing runtime tests must continue asserting generated yt-dlp/gallery-dl command arguments for YouTube modes, cookies, output templates, and progress behavior.
- Command-plan tests must cover argument order, platform-specific YouTube JS runtime ordering, clip download section formatting/output stems, source URL validation, and sidecar classification.
- Runtime tests must assert invalid command plans do not spawn sidecars and surface `E_INVALID_ENGINE_PLAN`.
- Runtime tests must assert direct/yt-dlp paths preserve `DownloadRuntimeError` codes after cleanup.

#### Wrong

```ts
const args = ["--ignore-config", "--encoding", "utf-8", "--progress"];
```

#### Correct

```ts
const manifest = getCliEngineManifest("yt-dlp");
const args = [
  ...manifest.configIsolationArgs,
  ...manifest.encodingArgs,
  ...manifest.progressArgs,
];
```

```ts
try {
  commandPlan = createYtdlpCommandPlan(context);
} catch (error) {
  if (!(error instanceof InvalidCommandPlanError)) {
    throw error;
  }
  throw new DownloadRuntimeError("E_INVALID_ENGINE_PLAN", error.message);
}
```

### 1. Scope / Trigger

- Trigger: Any change to downloader runtime packaging, `yt-dlp` / `gallery-dl` bootstrap, or runtime dependency gate behavior.
- Why this needs code-spec depth: The flow spans release packaging, Electron main, shared runtime status types, renderer recovery UI, and download execution. A stale bundled/runtime assumption can ship missing downloaders or expose unsupported manual update commands.

### 2. Signatures

Managed runtime component ids:

```ts
type RuntimeDependencyManagedComponent =
  | "ytDlp"
  | "galleryDl"
  | "ffmpeg"
  | "deno";
```

Renderer commands:

```ts
type AmeowRendererCommand =
  | "check_ytdlp_version"
  | "get_gallery_dl_info"
  | "get_runtime_dependency_status"
  | "get_runtime_dependency_gate_state"
  | "refresh_runtime_dependency_gate_state"
  | "start_runtime_dependency_bootstrap";
```

Downloader info payloads:

```ts
type YtdlpVersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
  source?: "managed" | "missing";
  path?: string | null;
  pythonVersion?: string | null;
  pythonPath?: string | null;
  pythonSupportsLatestStable?: boolean | null;
  updateChannel?: "managed_python_package" | "unavailable";
};

type GalleryDlInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
  source: "managed" | "missing";
  path: string | null;
  updateChannel: "managed_python_package" | "unavailable";
};
```

### 3. Contracts

- Installers must not package standalone `yt-dlp` / `gallery-dl` release binaries as managed downloader payloads.
- Release workflows must not pre-download legacy downloader binaries for first-run bootstrap.
- `electron/managedPythonPackageManifest.mts` owns the pinned Python downloader package versions; `electron/main.mts` and `electron/managedRuntimeBootstrap.mts` consume those pins through the bundled-Python bootstrap contract.
- `inspectRuntimeDependencyStatus(...)` must report both `ytDlp` and `galleryDl` as `expectedSource: "managed"` when absent.
- `start_runtime_dependency_bootstrap` must include missing `ytDlp` and `galleryDl` in `missingComponents`, then create/configure them from bundled Python plus pinned package sources.
- Settings must not expose downloader cards, downloader versions, or manual downloader update commands. Recovery stays in the main-window runtime gate.
- The preload command union must not expose `update_ytdlp` or `update_gallery_dl`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Fresh install has no downloader venvs | `inspectRuntimeDependencyStatus(...)` | `ytDlp` / `galleryDl` are `missing`, `expectedSource: "managed"` | Runtime gate can bootstrap both |
| Runtime bootstrap starts with missing downloaders | `start_runtime_dependency_bootstrap` | Gate enters `downloading`, current/next component uses `ytDlp` / `galleryDl` ids | Create venvs from bundled Python and install pinned packages |
| Bundled Python missing | `inspectRuntimeDependencyStatus(...)` / gate sync | Gate fails before managed bootstrap | User sees reinstall/fix-runtime guidance instead of partial downloader bootstrap |
| Settings page renders | `src/pages/SettingsPage.tsx` | No downloader management section appears | User cannot manually update downloaders |
| Renderer attempts obsolete update command | `src/types/electronBridge.ts` / `handleCommand` | Type union rejects it; runtime throws unsupported command if manually invoked | Use runtime bootstrap instead |
| Package build runs | packaging workflow / bundled resources | App package contains bundled Python plus app assets, not legacy downloader binaries | First launch prepares downloader venvs |

### 5. Good/Base/Bad Cases

- Good: `galleryDl` missing -> `missingComponents: ["galleryDl"]` -> main window starts bootstrap -> bundled Python creates `userData/runtimes/gallery-dl/<target>/venv` and installs `gallery-dl==1.32.1`.
- Base: all managed runtimes exist -> gate reports `ready`; no downloader network request is made.
- Bad: reintroducing standalone downloader binary packaging or system-Python fallback makes packaging pass locally but breaks the first-launch managed-runtime contract.
- Bad: exposing `update_ytdlp` in `AmeowRendererCommand` reintroduces a user-managed update surface that bypasses release-pinned runtime policy.

### 6. Tests Required

- `src/electron-runtime/runtimePaths.test.ts`: assert missing/ready `ytDlp` and `galleryDl` use managed venv entrypoints and `expectedSource: "managed"`.
- `src/electron-runtime/runtimeDependencyGate.test.ts`: assert missing managed downloader components keep the gate recoverable, not fatal.
- `src/utils/runtimeDependencyGate.test.ts`: assert frontend startup bootstrap detection includes managed Python downloaders.
- `npm run type-check`: catches preload/type drift after command union or payload changes.
- `npm run lint`: catches frontend dead code after removing settings surfaces.

### 7. Wrong vs Correct

#### Wrong

```ts
type AmeowRendererCommand =
  | "start_runtime_dependency_bootstrap"
  | "update_ytdlp"
  | "update_gallery_dl";
```

#### Correct

```ts
type AmeowRendererCommand =
  | "get_runtime_dependency_status"
  | "start_runtime_dependency_bootstrap";
```

#### Wrong

```js
files: [
  "desktop-assets/binaries/yt-dlp-*",
  "desktop-assets/binaries/gallery-dl-*",
];
```

#### Correct

```js
files: [
  "dist/**/*",
  "dist-electron/**/*",
  "locales/**/*",
];
```
- Contract:
  - Do not treat `shell.openPath(...)` as throw-only. A non-empty return value is a command failure and must be converted into a thrown error for the preload/renderer caller.
  - `open_current_output_folder` must resolve the configured output directory and ensure the directory exists before trying to open it, so first-use macOS flows can still reveal the folder in Finder.
  - `open_folder` must reject blank paths instead of silently passing `""` to Electron.
- Validation and error matrix:
  - Existing directory + empty `openPath` result: command succeeds and Finder/File Explorer opens the folder.
  - Missing default output directory + `open_current_output_folder`: command creates the directory and then opens it successfully.
  - Non-empty `openPath` result such as `"The file doesn’t exist."`: command throws a descriptive error instead of silently doing nothing.
  - Blank folder path: command throws `Path is required`.
- Required tests:
  - Unit test the helper that wraps `shell.openPath(...)` and assert empty-string success vs non-empty-string failure.

#### Compact Passthrough Interaction Contract

- Renderer entry point:
  - `src/App.tsx`
  - collapse settle path calls `desktopCurrentWindow.setInteractionMode("compact-passthrough")`
- Main-process IPC handler:
  - `electron/main.mts`
  - channel: `ameow:current-window:set-interaction-mode`
- Allowed native calls for `"compact-passthrough"`:
  - `win.setIgnoreMouseEvents(true, { forward: true })`
  - `win.setFocusable(false)`
- Forbidden native call for `"compact-passthrough"`:
  - `win.blur()`

Why:
- On the transparent main BrowserWindow, `blur()` can introduce a post-animation native flash after the renderer collapse motion has already finished.
- `setIgnoreMouseEvents(true, { forward: true })` and `setFocusable(false)` preserve passthrough behavior without reintroducing that flash in current Windows/macOS validation.

Validation and error matrix:

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Collapse motion finishes, then compact passthrough is applied with `ignoreMouseEvents + setFocusable(false)` | No end-frame flash; transparent gutter clicks pass through | Allowed path |
| Compact passthrough additionally calls `win.blur()` | Main window may flash after the motion appears complete | Reject / remove `blur()` |
| Renderer motion still flashes when native interaction settle is disabled | Root cause is not the native settle path | Continue renderer/compositor debugging |

Good / Base / Bad cases:
- Good:
  - Compact collapse stays visually stable and passthrough still works.
  - Compact hotspot entry still expands correctly after `setFocusable(false)`.
- Base:
  - The window no longer steals pointer input in transparent gutter areas.
- Bad:
  - Collapse appears stable until the native settle runs, then the whole compact shell flashes once.
  - Engineers keep tuning renderer motion while the real regression lives in the native interaction handoff.

Required tests:
- Manual:
  - collapse to compact with passthrough enabled and confirm no post-animation flash
  - compact transparent-area click-through still works
  - compact hotspot hover-expand still works after `setFocusable(false)`
- Automated:
  - `npm run test -- compactPointerHotspot startupWindowState mainWindowSurfacePolicy`
  - Unit test the “ensure directory first” path used by `open_current_output_folder`.
  - Manual macOS check: double-clicking the main panel opens the configured/default output folder even when it has not been created before.

#### Main Window Pointer Boundary Contract

- Renderer entry point:
  - `src/App.tsx`
  - subscribes to `desktopCurrentWindow.onPointerBoundaryChanged(...)`
- Main-process source:
  - `electron/mainWindowPointerBoundary.mts`
  - channel: `ameow:current-window:pointer-boundary`
- Allowed native facts:
  - `screen.getCursorScreenPoint()`
  - `BrowserWindow.getBounds()`
  - `BrowserWindow.isVisible()`
- Ownership rule:
  - Electron main may only emit `{ inside: boolean }` when the OS cursor crosses the main BrowserWindow bounds.
  - Renderer state machine remains the owner of compact/full decisions.
- Lifecycle:
  - start polling when the main window enters `"interactive"` mode
  - stop polling when the main window enters `"compact-passthrough"` mode
  - dispose polling on main-window close

Why:
- DOM `mouseenter` / `mouseleave` can be missed after transparent-window compact/full morphs on Windows.
- Native boundary polling makes pointer leave an explicit renderer input without moving shell state ownership into Electron main.

Required tests:
- Unit test inside/outside edge emission and interval cleanup in `electron/mainWindowPointerBoundary.test.mts`.
- Manual Windows check: compact icon -> full panel -> move cursor outside the panel without changing app focus; the panel must collapse to icon through the reducer's short leave path.
| `getCurrentWindow()` / `currentMonitor()` / `PhysicalPosition` | Renderer | `window.ameow.currentWindow.*` + `window.ameow.system.currentMonitor()` | Keep logical-coordinate contract at renderer boundary. |
| `plugin-dialog.open(...)` | Renderer plugin call | `window.ameow.system.openDialog(...)` | Dialogs stay main-owned. |
| `plugin-opener.openUrl(...)` | Renderer plugin call | `window.ameow.system.openExternal(...)` | External opens stay main-owned. |
| `plugin-process.relaunch()` | Renderer plugin call | `window.ameow.system.relaunch()` | Relaunch stays main-owned. |
| `plugin-updater.check()` / `Update.downloadAndInstall(...)` | Renderer plugin call | `window.ameow.updater.check()` / `downloadAndInstall()` | Do not leak raw Electron updater handles into renderer. |
| `plugin-clipboard-manager.readImage()` | Renderer plugin call | `window.ameow.clipboard.readImage()` | Return serializable pixel payload only. |
| Tauri tray/plugin runtime | Rust/Tauri | Electron main (`Tray`, `Menu`, `globalShortcut`, login-item/autostart, single-instance lock, dialog, shell, ws`) | Preserve user-visible behavior unless this spec documents an intentional break. |
