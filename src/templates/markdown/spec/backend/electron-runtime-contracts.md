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
