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
