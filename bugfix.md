# Bugfix Loop Log

## Cycle 1

- Defect: `src/electron-runtime/ytDlpProgress.ts` ignored yt-dlp finalization lines such as `Embedding metadata` and `Deleting original file`, so the runtime never emitted `post_processing` progress for those cases.
- Root cause: `stageFromLine()` recognized `post-process`, but `parseYtDlpProgressLine()` returned `null` for any line without a numeric percent unless it contained `merging`. The parser also missed other real finalization phrases already handled elsewhere in the codebase.
- Tests:
  - Added regression coverage in `src/electron-runtime/ytDlpProgress.test.ts` for metadata finalization and cleanup finalization lines.
  - Confirmed the new tests failed before the fix and passed after it.
- Fix:
  - Added a shared post-processing detector for `post-process`, `embedding metadata`, and `deleting original file`.
  - Allowed those finalization lines to produce a `post_processing` payload with `percent: 100`.
- Verification:
  - `npx vitest run src/electron-runtime/ytDlpProgress.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 2

- Defect: `src/electron-runtime/commandRouter.ts` accepted arbitrary trimmed `videoUrl` and `videoCandidates` strings, including `blob:`, `data:`, `javascript:`, and `ftp:` values, and forwarded them into the download runtime.
- Root cause: Queue-request normalization only trimmed strings; it did not validate optional hint URLs at the Electron runtime boundary even though adjacent layers already filter those hints.
- Tests:
  - Added regression coverage in `src/electron-runtime/commandRouter.test.ts` to ensure invalid hint URLs are dropped before dispatch.
  - Confirmed the new test failed before the fix and passed after it.
- Fix:
  - Added HTTP(S)-only normalization for optional `videoUrl` and `videoCandidates`.
  - Rejected `blob:`, `data:`, `file:`, malformed, and non-HTTP(S) hint URLs while preserving the existing required primary `url` field behavior.
- Verification:
  - `npx vitest run src/electron-runtime/commandRouter.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 3

- Defect: The production Electron main-process queueing path in `electron/main.mts` still accepted invalid `videoUrl` and `videoCandidates`, even after the renderer/runtime command router path had been fixed.
- Root cause: `enqueueElectronVideoDownload()` used `normalizeOptionalString()` and a local `normalizeVideoCandidateUrls()` helper that only trimmed and deduped values. Because `resolveQueuedVideoSourceUrl()` prefers `videoUrl` and then the first candidate, invalid `blob:` or other non-HTTP(S) hints could override valid fallback URLs and break the actual download route.
- Tests:
  - Added `electron/videoHintNormalization.test.mts` to cover valid HTTP(S) hints, rejection of non-HTTP(S) hints, and candidate filtering/deduping behavior in the production main-process path.
  - Confirmed the new tests failed before the fix and passed after it.
- Fix:
  - Extracted main-process hint normalization into `electron/videoHintNormalization.mts`.
  - Enforced HTTP(S)-only normalization for `videoUrl` and `videoCandidates`.
  - Updated `electron/main.mts` to consume the tested helper instead of its previous trim-only local logic.
- Verification:
  - `npx vitest run electron/videoHintNormalization.test.mts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 4

- Defect: The required primary download `url` still accepted non-HTTP(S) values in both `src/electron-runtime/commandRouter.ts` and the production queueing path in `electron/main.mts`.
- Root cause: Earlier fixes only sanitized optional hint fields (`videoUrl`, `videoCandidates`). The required route key still used trim-only normalization, so values like `javascript:` could be queued and then steer download routing incorrectly.
- Tests:
  - Added a regression test in `src/electron-runtime/commandRouter.test.ts` asserting that `queue_video_download` rejects an invalid primary `url` and never calls `runtime.queueVideoDownload(...)`.
  - Added regression coverage in `electron/videoHintNormalization.test.mts` for required primary route URLs.
  - Confirmed the new tests failed before the fix and passed after it.
- Fix:
  - Added `readRequiredHttpUrlString(...)` in `src/electron-runtime/commandRouter.ts` and used it for the required `url` field.
  - Added `normalizeRequiredVideoRouteUrl(...)` in `electron/videoHintNormalization.mts`.
  - Updated `electron/main.mts` to reject missing or invalid primary route URLs before enqueuing a task.
- Verification:
  - `npx vitest run src/electron-runtime/commandRouter.test.ts`
  - `npx vitest run electron/videoHintNormalization.test.mts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 5

- Defect: After scheme filtering was added, `videoUrl` and `videoCandidates` could still accept ordinary HTTP(S) page or image URLs and treat them as Pinterest video hints.
- Root cause: Hint normalization only validated transport scheme. It did not require the URL itself to look like a real Pinterest video asset, so page URLs and image URLs could still outrank the canonical route key and poison `resolveQueuedVideoSourceUrl(...)` / sidecar routing.
- Tests:
  - Added a regression test in `src/electron-runtime/commandRouter.test.ts` proving that HTTP(S) page/image hints are dropped while a real `expmp4` candidate is preserved.
  - Expanded `electron/videoHintNormalization.test.mts` to reject non-video HTTP(S) hints and filter mixed candidate lists accordingly.
  - Confirmed the new tests failed before the fix and passed after it.
- Fix:
  - Tightened `src/electron-runtime/commandRouter.ts` so optional `videoUrl`, `videoCandidates`, and diagnostic `videoUrl` only keep Pinterest-style video asset URLs (`mp4`, `m3u8`, `cmfv`, known `iht` paths).
  - Updated `electron/videoHintNormalization.mts` to use the same video-hint predicate, while keeping `normalizeRequiredVideoRouteUrl(...)` generic for the primary route key.
- Verification:
  - `npx vitest run src/electron-runtime/commandRouter.test.ts`
  - `npx vitest run electron/videoHintNormalization.test.mts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 6

- Defect: Even after invalid hint URLs were filtered, the production Electron main-process path still preserved `videoCandidates` in input order, so a lower-quality manifest candidate could outrank a direct MP4 candidate.
- Root cause: `electron/videoHintNormalization.mts` deduped and filtered candidates but did not apply the same priority rule already used in `src/electron-runtime/commandRouter.ts`, leaving the main-process path behaviorally inconsistent.
- Tests:
  - Updated `electron/videoHintNormalization.test.mts` so a mixed candidate list must return direct MP4 URLs before manifest URLs.
  - Confirmed the revised test failed before the fix and passed after it.
- Fix:
  - Added a candidate-priority scorer in `electron/videoHintNormalization.mts`.
  - Sorted normalized candidates so direct MP4 hints outrank manifest-like hints, while preserving original order for equal-priority items.
- Verification:
  - `npx vitest run electron/videoHintNormalization.test.mts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 7

- Defect: `pageUrl` still used trim-only normalization in both `src/electron-runtime/commandRouter.ts` and `electron/main.mts`, so invalid values could flow into runtime routing and `Referer`-style behavior.
- Root cause: Earlier rounds tightened the primary route key and video hints, but `pageUrl` was still treated as an opaque optional string instead of a generic HTTP(S) page URL.
- Tests:
  - Added a regression test in `src/electron-runtime/commandRouter.test.ts` asserting invalid `pageUrl` values are dropped before queue dispatch.
  - Added `normalizeVideoPageUrl(...)` coverage in `electron/videoHintNormalization.test.mts`.
  - Confirmed the new tests failed before the fix and passed after it.
- Fix:
  - Updated `src/electron-runtime/commandRouter.ts` to normalize `pageUrl` through optional HTTP(S) URL validation.
  - Added `normalizeVideoPageUrl(...)` to `electron/videoHintNormalization.mts`.
  - Updated `electron/main.mts` to use the same page-URL normalization before enqueuing a task.
- Verification:
  - `npx vitest run src/electron-runtime/commandRouter.test.ts`
  - `npx vitest run electron/videoHintNormalization.test.mts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 8

- Defect: `src/utils/outputPath.ts` crashed when `get_config` returned invalid JSON, which could break output-folder updates from the main window or Settings instead of recovering safely.
- Root cause: `saveOutputPath()` parsed the config string with a direct `JSON.parse(...)` and had no fallback path, even though adjacent config readers already recover to `{}` on malformed persisted config.
- Tests:
  - Added `src/utils/outputPath.test.ts` covering invalid config JSON recovery, unchanged output-path no-op behavior, and rename-counter reset failure handling.
  - Confirmed the invalid-config regression test failed before the fix and passed after it.
- Fix:
  - Added a local guarded `parseConfig()` helper in `src/utils/outputPath.ts`.
  - Changed `saveOutputPath()` to recover to an empty config object when stored config JSON is malformed or not an object.
- Verification:
  - `npx vitest run src/utils/outputPath.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 9

- Defect: `src/utils/videoUrl.ts` rejected valid pasted or dropped video URLs when they contained surrounding whitespace or used uppercase `HTTP`/`HTTPS` schemes.
- Root cause: `isVideoUrl()` checked `startsWith("http://")` / `startsWith("https://")` against the raw input string before any trimming or case-insensitive normalization, even though the actual platform patterns are already case-insensitive.
- Tests:
  - Added `src/utils/videoUrl.test.ts` covering normal-path recognition, whitespace trimming, uppercase schemes, and unsupported URL rejection.
  - Confirmed the whitespace and uppercase-scheme regression tests failed before the fix and passed after it.
- Fix:
  - Trimmed the input before validation in `isVideoUrl()`.
  - Replaced the case-sensitive prefix check with a case-insensitive HTTP(S) regex while preserving the existing supported-platform pattern table.
- Verification:
  - `npx vitest run src/utils/videoUrl.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 10

- Defect: `src/electron-runtime/processRunner.ts` could resolve `runStreamingCommand(...)` before async `onStdoutLine` / `onStderrLine` handlers had finished, creating a race between streamed progress handling and the final completion path.
- Root cause: `attachLineStream(...)` invoked line handlers with `void onLine(...)` and `runStreamingCommand(...)` waited only for the child-process close event, not for the async handler chain to drain.
- Tests:
  - Added `src/electron-runtime/processRunner.test.ts` to prove the command promise must not resolve until an async stdout line handler finishes.
  - Confirmed the new regression test failed before the fix and passed after it.
- Fix:
  - Changed `attachLineStream(...)` to return a promise that tracks ordered async line-handler completion.
  - Updated `runStreamingCommand(...)` to await both stdout/stderr handler drains after child-process close.
- Verification:
  - `npx vitest run src/electron-runtime/processRunner.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 11

- Defect: `src/electron-runtime/commandRouter.ts` preserved duplicate `videoCandidates` after URL normalization, so the Electron runtime path could still forward repeated Pinterest hints even though the main-process normalization path already deduped them.
- Root cause: `normalizeVideoCandidates(...)` validated and sorted candidates but never deduped by normalized URL.
- Tests:
  - Extended `src/electron-runtime/commandRouter.test.ts` with regression coverage asserting repeated normalized video candidates are collapsed before dispatch.
  - Confirmed the new test failed before the fix and passed after it.
- Fix:
  - Added normalized-URL deduplication in `normalizeVideoCandidates(...)` while preserving the first surviving candidate and existing priority sorting.
- Verification:
  - `npx vitest run src/electron-runtime/commandRouter.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 12

- Defect: `src/electron-runtime/runtimeUtils.ts` derived output stems from raw URL path segments, leaving percent-encoded text like `%20` and `%28` in the final download filename.
- Root cause: `buildOutputStem(...)` used the last pathname segment directly and stripped the extension without attempting URL decoding first.
- Tests:
  - Added `src/electron-runtime/runtimeUtils.test.ts` with regression coverage proving percent-escaped path segments should decode into a readable output stem.
  - Confirmed the new test failed before the fix and passed after it.
- Fix:
  - Updated `buildOutputStem(...)` to attempt `decodeURIComponent(...)` on the final pathname segment and fall back to the raw segment if decoding fails.
- Verification:
  - `npx vitest run src/electron-runtime/runtimeUtils.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 13

- Defect: `src/electron-runtime/runtimeUtils.ts` allowed reserved Windows device names such as `CON` and `LPT1` to survive filename sanitization, which can make the eventual output write fail on Windows.
- Root cause: `sanitizeFileStem(...)` stripped unsafe characters and trailing dots/spaces, but it never checked the final stem against Windows reserved device-name rules.
- Tests:
  - Expanded `src/electron-runtime/runtimeUtils.test.ts` with regression coverage for reserved Windows device names.
  - Confirmed the new reserved-name test failed before the fix and passed after it.
- Fix:
  - Added a Windows reserved-device-name guard in `sanitizeFileStem(...)` that appends `_` when the sanitized stem matches a reserved name.
- Verification:
  - `npx vitest run src/electron-runtime/runtimeUtils.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 14

- Defect: `src/electron-runtime/commandRouter.ts` accepted raw trimmed `dragDiagnostic.imageUrl` strings, including invalid values like `javascript:...`, and forwarded them into the normalized queue request.
- Root cause: `normalizeDragDiagnostic(...)` used `readOptionalTrimmedString(...)` for `imageUrl` instead of the existing HTTP(S)-only URL normalization path used elsewhere in the command boundary.
- Tests:
  - Expanded `src/electron-runtime/commandRouter.test.ts` with regression coverage asserting invalid drag-diagnostic image URLs are dropped before dispatch.
  - Confirmed the new test failed before the fix and passed after it.
- Fix:
  - Changed drag-diagnostic `imageUrl` normalization to reuse `readOptionalHttpUrlString(...)`, so invalid/non-HTTP(S) values now collapse to `null`.
- Verification:
  - `npx vitest run src/electron-runtime/commandRouter.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 15

- Defect: Transparent child windows such as `/settings` and `/context-menu` booted through `ThemeProvider` without a preloaded persisted theme, so they could paint the default theme first and then visually correct on the next async config read.
- Root cause: `src/main.tsx` resolved initial desktop language before first render but never resolved the initial desktop theme. `ThemeProvider` therefore started from the default theme and only later applied the persisted theme after `get_config` completed.
- Tests:
  - Added `src/contexts/desktopTheme.test.ts` to cover config-string theme parsing, bootstrap theme loading, and fallback behavior when desktop config loading fails.
  - Confirmed the new test failed before the fix because the desktop bootstrap theme resolver path did not exist.
- Fix:
  - Extracted theme parsing helpers into `src/contexts/theme.ts`.
  - Added `resolveInitialDesktopTheme()` in `src/contexts/desktopTheme.ts`.
  - Updated `src/main.tsx` to await the initial desktop theme and pass it into `ThemeProvider` before the first React render.
- Verification:
  - `npx vitest run src/contexts/desktopTheme.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 16

- Defect: `src/pages/settings/DownloaderDeck.tsx` kept a fixed 500ms interaction lock even when `prefers-reduced-motion` shortened the actual deck animation to 180ms, causing wheel navigation to feel artificially delayed after the motion had already finished.
- Root cause: The deck used a single `DOWNLOADER_DECK_ANIMATION_MS` timeout to clear `isAnimating`, but the reduced-motion branch used shorter transition durations and never adjusted the unlock timer to match.
- Tests:
  - Extended `src/utils/downloaderDeck.test.ts` with regression coverage for reduced-motion and default deck animation lock durations.
  - Confirmed the new tests failed before the fix because `getDownloaderDeckAnimationMs(...)` did not exist and the deck logic had no reduced-motion-specific lock duration.
- Fix:
  - Added `getDownloaderDeckAnimationMs(...)` and a reduced-motion duration constant in `src/utils/downloaderDeck.ts`.
  - Updated `src/pages/settings/DownloaderDeck.tsx` to use the shared helper for its animation unlock timer.
  - Wrapped `lockAnimation` in `useCallback` and aligned hook dependencies so the React Compiler/lint contract stayed valid.
- Verification:
  - `npx vitest run src/utils/downloaderDeck.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 17

- Defect: Repeatedly exercising the dev-build icon-to-window transition could crash Electron main with `TypeError: Object has been destroyed` from `waitForInitialWindowReveal(...)`.
- Root cause: The reveal wait timeout cleanup in `electron/main.mts` always tried to remove listeners from `win` and `win.webContents`, even when the window had already closed and those Electron objects were destroyed.
- Tests:
  - Added `electron/windowRevealWait.test.mts` to cover normal reveal completion and the regression path where the window closes before reveal wait finishes.
  - Confirmed the new test failed before the fix because the reveal-wait helper module did not exist and the old inline implementation had no destroyed-window guard.
- Fix:
  - Extracted reveal waiting into `electron/windowRevealWait.mts`.
  - Made reveal wait resolve on `closed` and skip listener cleanup for destroyed `BrowserWindow` / `webContents` handles.
  - Updated `electron/main.mts` to use the new helper instead of the previous inline implementation.
- Verification:
  - `npx vitest run electron/windowRevealWait.test.mts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 18

- Defect: `src/utils/pinterest.ts` trusted embedded Pinterest drag `videoUrl` values after only HTTP(S) normalization, so a regular pin page URL could survive as `videoUrl` and override a valid discovered media hint in the frontend merge path.
- Root cause: `extractEmbeddedPinterestDragPayload(...)` normalized `parsed.videoUrl` with `normalizePinterestCandidateUrl(...)` but never applied the stricter `isPinterestVideoCandidateUrl(...)` gate already used by the rest of the Pinterest video-hint pipeline.
- Tests:
  - Expanded `src/utils/pinterest.test.ts` with regression coverage asserting that embedded `videoUrl` values are dropped when they are not actual Pinterest video hints, while valid `videoCandidates` remain intact.
  - Confirmed the new test failed before the fix and passed after it.
- Fix:
  - Tightened `extractEmbeddedPinterestDragPayload(...)` so embedded `videoUrl` is only kept when it passes the existing Pinterest video-candidate validator; otherwise it now resolves to `null`.
- Verification:
  - `npm test -- src/utils/pinterest.test.ts`
  - `npm test -- src/electron-runtime/commandRouter.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 19

- Defect: `src/electron-runtime/runtimeUtils.ts` still allowed Windows reserved device names to survive when they were followed by dot suffixes such as `CON.txt` or `nul.part1`, which can still produce invalid output filenames on Windows.
- Root cause: The reserved-name guard only matched the entire sanitized stem (`^...$`), so it missed the Windows rule that reserved device basenames remain invalid even when followed by `.` and additional suffix text.
- Tests:
  - Expanded `src/electron-runtime/runtimeUtils.test.ts` with regression coverage for reserved device names followed by dot suffixes.
  - Confirmed the new test failed before the fix and passed after it.
- Fix:
  - Tightened the reserved-name pattern to match a reserved basename at the start of the stem when followed by `.` or the end of the string.
  - Changed sanitization to insert `_` immediately after the reserved basename, yielding safe names such as `CON_.txt`.
- Verification:
  - `npm test -- src/electron-runtime/runtimeUtils.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`

## Cycle 20

- Defect: `src/App.tsx` converted dropped local `file://` URLs into filesystem paths by stripping the `file:///` prefix as a plain string, which broke macOS paths by turning `file:///Users/...` into `Users/...` and dropping the leading `/`.
- Root cause: Renderer-side local file handling relied on a Windows-oriented string replacement instead of URI parsing, and the same brittle logic was duplicated in two file-processing branches.
- Tests:
  - Added `src/utils/localFileUrl.test.ts` covering Windows drive paths, macOS absolute paths, `file://localhost/...`, and malformed inputs.
  - Confirmed the malformed-input edge case failed on the first implementation pass and tightened the parser so the regression suite finished green.
- Fix:
  - Added `parseLocalFileUrl(...)` in `src/utils/localFileUrl.ts` to normalize local `file://` URLs across Windows and macOS.
  - Updated both renderer-side local-file branches in `src/App.tsx` to use the shared parser instead of direct string slicing.
- Verification:
  - `npm test -- src/utils/localFileUrl.test.ts`
  - `npm test`
  - `npm run type-check`
  - `npm run lint`
