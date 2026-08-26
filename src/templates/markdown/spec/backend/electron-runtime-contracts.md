# Electron Runtime Contracts Sync

Tracked snapshot of the Xiaohongshu drag-resolution contract added during the 2026-04 waterfall-video debugging session.

## Renderer Command: `resolve_xiaohongshu_drag_media`

### Request Fields

- `url`
- `pageUrl?`
- `detailUrl?`
- `sourcePageUrl?`
- `token?`
- `noteId?`
- `imageUrl?`
- `mediaType?`
- `videoIntentConfidence?`
- `videoIntentSources?`
- `cookies?`

### Response Fields

- `kind: "video" | "image" | "unknown"`
- `pageUrl`
- `detailUrl?`
- `sourcePageUrl?`
- `imageUrl`
- `videoUrl`
- `videoCandidates`
- `videoIntentConfidence?`
- `videoIntentSources?`

## Xiaohongshu Drag Contract

- `browser-extension/xiaohongshu-page-bridge.js` must stay in MV3 `web_accessible_resources`.
- `browser-extension/xiaohongshu-contextmenu-guard.js` must inject the page bridge at `document_start`.
- The page bridge must capture note-linked tokenized detail URLs from feed/search/user responses and publish `noteId -> detailUrl/xsecToken/xsecSource`.
- `browser-extension/xiaohongshu-detector.js` must prefer cached tokenized `detailUrl` over bare `/explore/<noteId>` or profile-note URLs.
- `electron/main.mts` must forward `detailUrl` end-to-end when requesting extension-side drag resolution and hidden-detail fallback.

## Hidden Detail Fallback Rule

If no usable direct video URL/candidate exists yet, hidden detail fallback is still allowed when:

- request `mediaType === "video"`, or
- resolved media `kind === "video"`, or
- request/resolved confidence `>= 0.7`, or
- tokenized `detailUrl` exists and request or resolved confidence is at least `0.5`

Implication:
- tokenized `detailUrl` + medium video intent is enough to keep probing
- do not finalize a cover-image download while that higher-trust note hint still exists

## Regression Checks

- A cached tokenized `detailUrl` survives drag payload parsing and reaches Electron.
- Extension/direct resolver returning `kind: "image"` does not immediately force cover-image download when tokenized `detailUrl` and video intent still exist.
- Hidden detail fallback still runs for waterfall video drags that expose note context but not direct media bytes.

## Added Lesson: Compact Passthrough Native Settle Must Not Call `blur()`

When `src/App.tsx` finishes compact collapse and calls `currentWindow.setInteractionMode("compact-passthrough")`, the Electron main handler may only use:

- `win.setIgnoreMouseEvents(true, { forward: true })`
- `win.setFocusable(false)`

Do not call:

- `win.blur()`

Why:
- In the transparent main BrowserWindow, the flash can happen after the renderer motion is already visually complete.
- Renderer-side experiments on shell motion, icon ownership, and content fade may appear ineffective because the real regression is the native focus-state handoff.

Debug rule:
- If a transparent-window compact flash appears at the end of the animation, temporarily disable the native interaction settle first.
- Re-enable native calls one by one (`ignoreMouseEvents` -> `setFocusable` -> `blur`) to isolate the real trigger before changing renderer motion.

## Added Lesson: Electron ESM Main Initialization Order

`electron/main.mts` is an ESM entrypoint. Top-level controller construction must not read `const` or `let` bindings declared later in the file, because the emitted main file can compile successfully and still fail during Electron load with `ReferenceError: Cannot access '<name>' before initialization`.

Rules:
- Import every Node helper used directly at top level. `// @ts-nocheck` means missing imports such as `dirname` are not caught by `npm run type-check`.
- Create controllers after immediately-read dependencies are initialized.
- Function declarations are safe to pass before their declaration, but later `const`/`let` bindings are not.
- If a controller needs a later `const`/`let` binding, pass a lazy callback and ensure the callback is not invoked during construction.

Wrong:

```ts
const appUpdateController = createAppUpdateController({
  readConfigObject,
});

const configStore = createConfigStore(...);
const readConfigObject = configStore.readConfigObject;
```

Correct:

```ts
const configStore = createConfigStore(...);
const readConfigObject = configStore.readConfigObject;

const appUpdateController = createAppUpdateController({
  readConfigObject,
});
```

Wrong:

```ts
const configStore = createConfigStore({
  refreshTrayMenu: updateTrayMenu,
});

const updateTrayMenu = trayMenuController.updateTrayMenu;
```

Correct:

```ts
const configStore = createConfigStore({
  refreshTrayMenu(startupConfigSnapshot) {
    return updateTrayMenu(startupConfigSnapshot);
  },
});

const updateTrayMenu = trayMenuController.updateTrayMenu;
```

Regression check:
- `npm run dev` must reach normal Electron startup logs such as `>>> [WS] Server started: ws://127.0.0.1:39527` without `App threw an error during load`.

## Added Lesson: YouTube Must Start In Extended Mode

Some YouTube videos expose only a 640x360 progressive MP4 when `yt-dlp` runs with the light extractor args:

```txt
--extractor-args youtube:player_client=android,web
```

That can make a download succeed at a lower quality than the selected profile even though adaptive formats exist. For YouTube:

- all quality profiles must start in extended mode.
- cookies and legacy YouTube extension mode hints do not switch the extractor profile away from the extended path.
- retired fields such as `extensionData.youtube.forceExtended` may be accepted as ignored compatibility input, but they are not active runtime mode switches.

Extended mode uses:

```txt
--extractor-args youtube:player_js_variant=tv --js-runtimes deno:<absolute-managed-deno-path> --ignore-config --no-plugin-dirs
```

The exact `yt-dlp-ejs` package is part of Ameow's app-owned managed yt-dlp
package set; do not enable remote EJS components or machine JavaScript runtime
fallbacks.

Regression check:
- `npm test -- src/electron-runtime/ytDlpDownload.test.ts`
- `yt-dlp --simulate` for `https://www.youtube.com/watch?v=UBqh6ud5LqY` with the balanced selector and extended args should select an adaptive 1080p format such as `299+140`, not `18`.

## Added Lesson: yt-dlp Quality Profiles Are Site-Scoped

The UI-level quality values stay simple:

- `best`
- `balanced`
- `data_saver`

The implementation maps those values through `YTDLP_SITE_FORMAT_PROFILES` in `src/electron-runtime/engineManifest.ts`.

Rules:
- `default` must define all three quality profiles.
- Each site override, such as `youtube`, must define all three quality profiles.
- Unknown site ids fall back to `default`.
- URL-level YouTube detection may force the `youtube` profile even if `siteId` is missing or generic.
- Add new site-specific balanced/data-saver behavior by adding a profile table entry, not by adding switch branches to command planning.

Regression check:
- `npm test -- src/electron-runtime/engineManifest.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts`
- `npm run type-check`

## Added Lesson: Proxy Ownership Belongs To The User Proxy Tool

YouTube downloads can fail on Windows with `ffmpeg exited with code 4294967158 (-138)`, `Requested format is not available`, or similar network-shaped errors when only some Ameow processes are covered by the user's proxy path. This is not a cookies issue when the same URL works after enabling TUN/global/VPN mode.

Do not collapse a single Electron `session.resolveProxy(targetUrl)` result into a default yt-dlp `--proxy`. yt-dlp and ffmpeg may contact YouTube pages, `googlevideo.com`, `ytimg.com`, and remote component endpoints during one download, and rule/PAC proxy tools may route those hosts differently.

Rules:
- Settings should not expose a first-run or failure-time proxy form. Keep proxy setup guidance in documentation.
- Ameow should not expose or consume manual `globalProxyEnabled/globalProxyUrl` configuration for this path.
- Electron-owned fetches should keep using desktop/session defaults.
- App-managed yt-dlp and ffmpeg should default to the user's ambient network route, not an automatically inferred `--proxy`.
- Electron `resolveProxy(...)` and HTTP(S)/ALL proxy environment variables may be sampled for diagnostics only.
- Proxy diagnostics must include the sampled target host and classify direct, HTTP/HTTPS, SOCKS-unsupported, mixed/PAC-like, malformed, environment, skipped-non-yt-dlp, and resolution-failed cases.
- Prefer TUN/global/VPN coverage or documentation-level troubleshooting for SOCKS/PAC/rule-based setups that Ameow cannot safely translate.
- Do not add a full-video download plus local crop fallback for section downloads.

Regression check:
- `npm test -- src/config/cliProxy.test.ts src/electron-runtime/service.test.ts src/electron-runtime/ytDlpDownload.test.ts`
- `npm run electron:build`
- `npm run type-check`

## Added Lesson: Douyin Temporary yt-dlp Strategy

Douyin is temporarily routed through `yt-dlp` only so we can validate whether the sidecar path is stable enough for this site.

Rules:
- `src/download-capabilities/runtime-site-strategies.ts` uses `strategyKind: "single_engine"` and `engineOrder: ["yt-dlp"]` for `douyin`.
- `src/assets/capabilities-manual.json` must mirror the same strategy so the capability registry stays aligned.
- `src/sites/douyin.ts` may still detect direct media candidates, but the strategy order should prevent direct engine plans while this validation mode is active.

Regression check:
- `npm test -- src/sites/providers.test.ts src/download-capabilities/runtime-site-strategies.test.ts src/download-capabilities/provider-alignment.test.ts`
