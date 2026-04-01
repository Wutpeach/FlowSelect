# Type Safety

> Executable type contracts for Rust command and event boundaries in FlowSelect.

---

## Source of Truth

- Rust command and payload definitions: `src-tauri/src/lib.rs`
- Frontend typed consumers: `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/contexts/ThemeContext.tsx`

---

## Scenario: Tauri Command and Event Type Contracts

### 1. Scope / Trigger

- Trigger: Any change to `#[tauri::command]` signatures, serde structs emitted to frontend, or command/event names.
- Why this needs code-spec depth: These are cross-layer contracts (`Rust` -> `Tauri transport` -> `TypeScript`) that can compile but still fail at runtime if field names/types drift.

### 2. Signatures

Command boundary signatures (current canonical patterns):

```rust
#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<String, String>

#[tauri::command]
fn save_config(app: tauri::AppHandle, json: String) -> Result<(), String>

#[tauri::command]
async fn download_video(app: AppHandle, url: String) -> Result<DownloadResult, String>

#[tauri::command]
async fn check_ytdlp_version(app: AppHandle) -> Result<YtdlpVersionInfo, String>

#[tauri::command]
async fn get_gallery_dl_info(app: AppHandle) -> Result<GalleryDlInfo, String>
```

Event payload signatures:

```rust
#[derive(serde::Serialize, Clone)]
pub struct DownloadResult {
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    pub percent: f32,
    pub stage: String, // "preparing" | "downloading" | "merging" | "post_processing"
    pub speed: String,
    pub eta: String,
}

#[derive(serde::Serialize, Clone)]
pub struct YtdlpVersionInfo {
    pub current: String,
    pub latest: Option<String>,
    #[serde(rename = "updateAvailable")]
    pub update_available: Option<bool>,
    #[serde(rename = "latestError")]
    pub latest_error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct GalleryDlInfo {
    pub current: String,
    pub source: String,
    pub path: Option<String>,
    #[serde(rename = "updateChannel")]
    pub update_channel: String,
}
```

### 3. Contracts

#### Command Contracts

| Command | Rust Return Type | Required Frontend Expectation |
|---------|------------------|-------------------------------|
| `get_config` | `Result<String, String>` | `invoke<string>("get_config")` then JSON parse |
| `save_config` | `Result<(), String>` | `invoke<void>("save_config", { json })` |
| `open_current_output_folder` | `Result<(), String>` | `invoke<void>("open_current_output_folder")` |
| `export_support_log` | `Result<String, String>` | `invoke<string>("export_support_log")` |
| `get_gallery_dl_info` | `Result<GalleryDlInfo, String>` | `invoke<{ current: string; source: "bundled" \| "missing"; path: string \| null; updateChannel: "bundled_release" \| "unavailable" }>("get_gallery_dl_info")` |
| `download_video` | `Result<DownloadResult, String>` | `invoke<{ traceId: string; success: boolean; file_path?: string; error?: string }>(...)` |
| `queue_video_download` | `Result<QueuedVideoDownloadAck, String>` | `invoke<{ accepted: boolean; traceId: string }>("queue_video_download", { url, pageUrl?, videoUrl?, videoCandidates? })` |
| `check_ytdlp_version` | `Result<YtdlpVersionInfo, String>` | `invoke<{ current: string; latest: string \| null; updateAvailable: boolean \| null; latestError: string \| null }>(...)` |
| `get_runtime_dependency_status` | `RuntimeDependencyStatusSnapshot` | `invoke<{ ytDlp: { state: "ready" \| "missing"; source: "bundled" \| "managed" \| null; path: string \| null; error: string \| null }; galleryDl: ...; ffmpeg: ...; deno: ... }>("get_runtime_dependency_status")` |
| `get_runtime_dependency_gate_state` | `RuntimeDependencyGateStatePayload` | `invoke<{ phase: "idle" \| "checking" \| "awaiting_confirmation" \| "downloading" \| "ready" \| "blocked_by_user" \| "failed"; missingComponents: string[]; lastError: string \| null; updatedAtMs: number; currentComponent: "ffmpeg" \| "deno" \| null; currentStage: "checking" \| "downloading" \| "verifying" \| "installing" \| null; progressPercent: number \| null; downloadedBytes: number \| null; totalBytes: number \| null; nextComponent: "ffmpeg" \| "deno" \| null }>("get_runtime_dependency_gate_state")` |
| `refresh_runtime_dependency_gate_state` | `RuntimeDependencyGateStatePayload` | Inspection-only refresh of current runtime readiness; must not auto-start downloads |
| `start_runtime_dependency_bootstrap` | `RuntimeDependencyGateStatePayload` | Starts managed-runtime downloads after the UI is visible or when the user explicitly retries |
| `cancel_download` | `Result<bool, String>` | `invoke<boolean>("cancel_download", { traceId })` |
| `cancel_transcode` | `Result<bool, String>` | `invoke<boolean>("cancel_transcode", { traceId })` |
| `retry_transcode` | `Result<bool, String>` | `invoke<boolean>("retry_transcode", { traceId })` |
| `remove_transcode` | `Result<bool, String>` | `invoke<boolean>("remove_transcode", { traceId })` |
| `get_clipboard_files` | `Result<Vec<String>, String>` | `invoke<string[]>("get_clipboard_files")` |
| `reset_rename_counter` | `Result<bool, String>` | `invoke<boolean>("reset_rename_counter")` |

#### Event Contracts

| Event Name | Rust Payload | Frontend Listener Type |
|------------|--------------|------------------------|
| `video-download-progress` | `DownloadProgress` | `listen<{ traceId: string; percent: number; stage: "preparing" \| "downloading" \| "merging" \| "post_processing"; speed: string; eta: string }>(...)` |
| `video-download-complete` | `DownloadResult` | `listen<{ traceId: string; success: boolean; file_path?: string; error?: string }>(...)` |
| `video-queue-count` | `VideoQueueCountPayload` | `listen<{ activeCount: number; pendingCount: number; totalCount: number; maxConcurrent: number }>(...)` |
| `video-queue-detail` | `VideoQueueDetailPayload` | `listen<{ tasks: { traceId: string; label: string; status: "active" \| "pending" }[] }>(...)` |
| `video-transcode-queue-count` | `VideoTranscodeQueueCountPayload` | `listen<{ activeCount: number; pendingCount: number; failedCount: number; totalCount: number; maxConcurrent: number }>(...)` |
| `video-transcode-queue-detail` | `VideoTranscodeQueueDetailPayload` | `listen<{ tasks: { traceId: string; label: string; status: "pending" \| "active" \| "failed"; stage?: "analyzing" \| "transcoding" \| "finalizing_mp4" \| "failed"; progressPercent?: number \| null; etaSeconds?: number \| null; sourcePath?: string \| null; sourceFormat?: string \| null; targetFormat?: string \| null; error?: string \| null }[] }>(...)` |
| `video-transcode-progress` | `VideoTranscodeTaskPayload` | listener payload with active transcode `traceId/status/stage/progressPercent/etaSeconds/sourcePath/sourceFormat/targetFormat/error` |
| `video-transcode-complete` | `VideoTranscodeCompletePayload` | `listen<{ traceId: string; label: string; sourcePath: string; filePath: string; sourceFormat?: string \| null; targetFormat: string }>(...)` |
| `video-transcode-failed` | `VideoTranscodeTaskPayload` | listener payload with failed transcode row state |
| `video-transcode-queued` / `video-transcode-retried` / `video-transcode-removed` | `VideoTranscodeTaskPayload` | listener payload with queued-row identity and source/target metadata |
| `ytdlp-update-progress` | `YtdlpUpdateProgress` | listener payload with `percent/downloaded/total` |
| `devmode-changed` | object `{ enabled: bool }` | `listen<{ enabled: boolean }>(...)` |

#### Support Log Export Contract

- Source file: `src-tauri/src/lib.rs`
- Signature:
  - `async fn export_support_log(app: AppHandle) -> Result<String, String>`
- Return contract:
  - Success returns the generated support-log file path as a string.
  - Failure returns an actionable `Err(String)` describing path creation or file-write failure.
- Behavior contract in backend:
  - Create the log under an app-owned directory derived from the config directory; do not require users to select a path first.
  - Emit a sectioned diagnostic report rather than a raw config dump. Current sections are:
    - `environment`
    - `settings`
    - `downloaders`
    - `runtime_evidence`
  - Include environment fields needed for support: app version, generated timestamp, platform, executable path, config path, output log path, and runtime log path.
  - Include a curated effective-settings summary focused on download diagnostics rather than UI-only preferences. Current MVP includes output path, autostart, shortcut, rename settings, AE integration settings, `defaultVideoDownloadQuality` resolution, and `aeFriendlyConversionEnabled`.
  - Exclude secondary UI-only settings such as theme and language from the support-log MVP unless the export contract is explicitly expanded.
- Include downloader diagnostics for bundled and managed download/tool runtimes:
  - `yt-dlp` path and local version when available
  - `gallery-dl` path and local version when available
  - `deno` runtime path when available
  - `ffmpeg` runtime path when available
  - Include filtered runtime evidence rather than a raw last-N-line tail. The evidence section should keep warning/error outcomes plus a minimal set of lifecycle/routing events needed to reconstruct downloader start, route selection, fallback, retry, and terminal outcome.
  - Non-fatal enrichment failures such as downloader version/path probing should degrade to placeholder text inside the file instead of failing the whole command.
  - Keep the frontend contract as a plain string path; do not switch to JSON/object payload without updating frontend types in the same change.

#### Config JSON Key Contract: Download Rename Toggle

- Source file: `src-tauri/src/lib.rs`
- Command boundary: `get_config` / `save_config` (JSON string contract)
- Expected keys in parsed config:
  - `renameMediaOnDownload?: bool` (canonical)
  - `videoKeepOriginalName?: bool` (legacy fallback)
  - `clipDownloadMode?: "fast" | "precise"` (legacy slice-mode key; runtime now always uses fast slicing)
  - `renameRulePreset?: "desc_number" | "asc_number" | "prefix_number"`
  - `renamePrefix?: string`
  - `renameSuffix?: string`

Behavior contract in backend naming paths:
- Decision helper `is_rename_media_enabled(config)`:
  - Prefer `renameMediaOnDownload` when present.
  - Else infer from legacy key: `rename = !videoKeepOriginalName`.
  - Else default to `false` (do not rename by default).
- Rename rule helper behavior:
  - `renameRulePreset` missing/invalid -> fallback to `desc_number`.
  - `desc_number` and `prefix_number` default sequence start at `99` and decrease.
  - `asc_number` default sequence start at `1` and increase.
  - `renamePrefix` is applied only for `prefix_number`.
  - `renameSuffix` is global; empty means no suffix segment.
  - Prefix/suffix are sanitized to filesystem-safe segments; final stem joins non-empty segments via `_`.
- Slice mode helper behavior:
  - `clipDownloadMode` is treated as a legacy key; missing, invalid, or `"precise"` values all resolve to the fast slicing path.
  - New clip tasks must always use the existing fast slicing strategy (`--download-sections` without forced precise-cut handling, or cached slicing via `-c copy`).
  - When `renameMediaOnDownload=false` and a clip range is present, output naming template is `<startMs>-<endMs>_<title>.mp4` with collision suffix `_2/_3/...`.
  - When `renameMediaOnDownload=false` and no clip range is present, yt-dlp full-video output naming template is `<title>[<width>x<height>][<quality>].<ext>`.
  - Video stem selection prefers the cleaned request/page title for all providers; only when title metadata is absent may runtime fall back to a URL-derived stem such as `pinterest_<shortId>`.
  - For yt-dlp providers that commonly enter through pasted page URLs without an extension-supplied title, runtime may probe yt-dlp metadata before output-stem allocation and should treat the recovered metadata title as higher priority than a raw URL-derived fallback such as `watch` or `BV...`.
  - `<quality>` currently serializes as `highest`, `balanced`, or `data-saver`.
  - If yt-dlp metadata does not expose width/height, the template may fall back to placeholder text, but different quality presets must still resolve to different target filenames.
- Applied uniformly to:
  - `download_video_internal` (yt-dlp naming template)
  - `download_video_direct` (direct downloader filename)
  - `download_image` / `save_data_url` / `process_files` (source-name preservation vs sequence naming)

Contract rules:
- Keep command names and payload keys stable.
- If Rust field names differ from frontend naming, use serde rename explicitly (for example `update_available` -> `updateAvailable`).
- For optional payload fields (`Option<T>`), frontend must treat missing and `null` as valid absent states.
- `open_current_output_folder` must stay a plain `Result<(), String>` command with no extra payload; all path resolution remains backend-owned via `resolve_current_output_folder_path(...)`.
- `check_ytdlp_version.current` is the local sidecar version and must be returned whenever local probing succeeds, even if the GitHub latest check fails.
- `check_ytdlp_version.latest` / `updateAvailable` / `latestError` represent remote/latest-check state and may be `null` when GitHub lookup is unavailable.
- `check_ytdlp_version` must use bootstrap-disabled local probing so startup/status surfaces never install `yt_dlp` as a side effect.
- `get_gallery_dl_info.current` is the version returned by the bundled `gallery-dl` binary itself.
- `get_gallery_dl_info.source` must serialize as `"bundled"` when the bundled binary is present and `"missing"` otherwise.
- `get_gallery_dl_info.updateChannel` currently serializes as `"bundled_release"` when the bundled runtime is present and `"unavailable"` otherwise.
- `refresh_runtime_dependency_gate_state` is inspection-only: it may update `phase`, `missingComponents`, and `lastError`, but it must not start a managed-runtime download by itself.
- `start_runtime_dependency_bootstrap` is the only automatic bootstrap entrypoint for the main-window post-paint flow; `setup()` must not start managed-runtime downloads before the UI is visible.
- `video-download-progress.traceId` and `video-download-complete.traceId` identify the task that produced the event.
- `src/electron-runtime/ytDlpProgress.ts` must treat yt-dlp post-download finalization lines with no explicit percent as valid progress:
  - `[Metadata] Embedding metadata ...` -> `stage="post_processing"`, `percent=100`
  - `Deleting original file ...` -> `stage="post_processing"`, `percent=100`
  - unrelated noise without a recognized stage marker must still return `null`
- `video-download-complete` now means the source media finished downloading. It must be emitted before any downstream transcode work begins.
- `cancel_download` targets exactly one queued/running task identified by `traceId`.
- `video-queue-count.activeCount` represents the number of actively running video downloads across frontend-triggered and WS-triggered tasks.
- `video-queue-count.pendingCount` represents queued backend video tasks that are waiting for capacity.
- `video-queue-count.totalCount = activeCount + pendingCount`.
- `video-queue-count.maxConcurrent` is the current backend concurrency cap (`3`).
- `video-queue-detail.tasks` must be emitted in UI display order: active tasks first, then pending tasks.
- Each `video-queue-detail.tasks[*]` item must include:
  - `traceId: string`
  - `label: string`
  - `status: "active" | "pending"`
- When a task is enqueued, starts execution, completes, or pending work is cleared by cancel, backend must emit both `video-queue-count` and `video-queue-detail`.
- `video-transcode-queue-count.totalCount = activeCount + pendingCount + failedCount`.
- `video-transcode-queue-count.maxConcurrent` is fixed to `1`.
- `video-transcode-queue-detail.tasks` must be emitted in UI display order: active first, pending next, failed last.
- Each `video-transcode-queue-detail.tasks[*]` item must include:
  - `traceId: string`
  - `label: string`
  - `status: "pending" | "active" | "failed"`
  - optional `stage`, `progressPercent`, `etaSeconds`, `sourcePath`, `sourceFormat`, `targetFormat`, `error`
- `video-transcode-progress` must describe the current active transcode stage and reuse the same `traceId` as the source download that created the transcode task.
- `video-transcode-progress.progressPercent` and `video-transcode-progress.etaSeconds` are best-effort optional fields for the active task:
  - `progressPercent` should be derived from `processed_seconds / total_duration_seconds` when ffmpeg runtime output and source duration are both available.
  - `etaSeconds` should be derived from ffmpeg `speed=` output when present, or from observed wall-clock throughput as a fallback.
  - Backend may emit `null`/missing `progressPercent` and `etaSeconds` when source duration cannot be determined or the active path cannot expose meaningful ffmpeg progress.
- `video-transcode-complete.filePath` is the final AE-friendly path after safe replacement. `sourcePath` is the preserved source path that seeded the transcode task.
- `retry_transcode` only retries failed local transcode work for the matching `traceId`; it must not recreate a network download task.
- `remove_transcode` only removes a failed transcode row from backend queue state; it must not delete the local source file.
- `queue_video_download` / Electron queue normalization source files:
  - `src/electron-runtime/commandRouter.ts`
  - `electron/main.mts`
  - `electron/videoHintNormalization.mts`
  - `src/electron-runtime/service.ts`
- `queue_video_download` request payload contract:
  - `url: String` is required and must normalize to an HTTP(S) URL.
    - Electron runtime command router rejects invalid values with `Invalid command payload field: url`.
    - Electron main-process enqueue path rejects invalid values with `Missing or invalid url`.
  - `pageUrl?: String` is optional page context only.
    - Keep it only when it normalizes to HTTP(S) and drop invalid values instead of failing the whole request.
    - It may override the Pinterest routing page key when `url` alone is only a drag-source shell.
  - `videoUrl?: String` is an optional high-confidence media hint.
    - Keep it only when it normalizes to a real Pinterest video asset URL.
    - Accept direct `*.mp4` URLs plus manifest-like `*.m3u8`, `*.cmfv`, or `/videos/iht/hls/...` URLs.
    - Drop page URLs, image URLs, `blob:`/`data:`/`javascript:` values, and unrelated HTTP(S) URLs.
  - `videoCandidates?: Vec<{ url: string, type?: string, source?: string, confidence?: string }>` is optional ordered hint data.
    - Keep only candidates whose `url` passes the same Pinterest video-hint validation as `videoUrl`.
    - `src/electron-runtime/commandRouter.ts` must preserve `type` / `source` / `confidence` metadata on surviving entries.
    - Surviving candidates must be ordered so direct MP4 outranks `indirect_media`, which outranks manifest-like hints; preserve original order within the same priority bucket.
    - `electron/videoHintNormalization.mts` may collapse duplicate normalized URLs while preserving that priority order.
- Source selection / routing contract:
  - `src/electron-runtime/service.ts` must treat extension hints as provider inputs, not as preselected engines.
  - Provider planning may prefer `direct`, `gallery-dl`, or `yt-dlp` based on `siteHint`, `url`, `pageUrl`, `videoUrl`, and normalized `videoCandidates`.
  - `electron/main.mts` resolves the queued download source URL as `videoUrl ?? first(videoCandidates) ?? url ?? pageUrl`.
  - Low-trust manifest-like hints such as `*.cmfv` may only be used when a higher-trust direct MP4 hint is absent; they must not silently override a stronger resolved asset.
- Extension WebSocket `video_selected_v2` payload contract:
  - `url` should be the canonical current-item download URL when the browser player initiates a single-item download.
  - `pageUrl` remains the browser page context used for cookies and diagnostics.
  - `selectionScope?: "current_item" | "playlist"` is optional for backward compatibility.
  - When `selectionScope == "current_item"`, runtime may enforce single-item yt-dlp behavior such as `--no-playlist`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Command return shape changed | Rust compile + TS usage review | All `invoke<T>` sites still match fields | Update Rust struct or TS generic together in same change |
| Support-log command returns non-string payload | Rust/TS contract review | Frontend can render hint without casts | Keep `Result<String, String>` and typed `invoke<string>` |
| Support-log directory creation fails | Command call path | Frontend receives actionable failure | Return `Err(String)` with mkdir details |
| Support-log file write fails | Command call path | Frontend receives actionable failure | Return `Err(String)` with write details |
| yt-dlp probe fails during support-log export | Support-log command path | Log file still gets written | Record placeholder text in file and continue |
| Serde rename removed or changed | UI field access (`result.updateAvailable`) | Field exists with expected case | Add/restore `#[serde(rename = ...)]` |
| GitHub latest lookup fails or rate-limits | `check_ytdlp_version` command path | Frontend still receives local `current` version | Return `latest=null`, `updateAvailable=null`, and `latestError` instead of failing the whole command |
| Optional field accessed unsafely | Frontend runtime path | No crash on missing `file_path` / `error` | Guard with optional checks |
| New command added without TS generic | Frontend compile/review | No implicit `unknown` propagation | Add explicit `invoke<T>` generic |
| Event payload drift | Event handler logic | Listener safely handles payload shape | Update listener type + handler guards |
| Rename key missing in config | Download naming path | Preserve source name by default | Use fallback `rename=false` |
| Legacy-only key present | Download naming path | Preserve previous user intent | Infer from `videoKeepOriginalName` |
| Missing/invalid `renameRulePreset` | Rename path | Uses stable descending default naming | Fallback to `desc_number` |
| Empty suffix | Rename path | Filename has no suffix segment | Skip empty suffix in stem composition |
| Illegal chars in prefix/suffix | Rename path | Name remains filesystem-safe | Sanitize chars to `_` before join |
| Reset command write fails | Command call path | Frontend receives error and remains stable | Return `Err(String)` with write/serialize details |
| Legacy config contains `clipDownloadMode="precise"` | Clip slicing path | Runtime still uses fast slicing | Ignore legacy key and continue |
| Clip naming conflict in `<startMs>-<endMs>_<title>` template | Clip output path | Deterministic unique filename | Append `_2/_3/...` suffix before extension |
| Different yt-dlp quality presets target the same title with rename disabled | Full-video output path | Different presets do not collide on the same file | Include resolution + quality suffix in the yt-dlp output template |
| Extension `video_selected_v2` payload omits `selectionScope` | WS payload parse | Older senders still queue successfully | Default runtime behavior to auto mode |
| Extension `video_selected_v2` carries YouTube/Bilibili current-item context | yt-dlp invocation args | Current item downloads do not expand into full playlists | Normalize canonical `url` and add `--no-playlist` when `selectionScope == "current_item"` |
| `queue_video_download.url` is missing or non-HTTP(S) | Electron command boundary / main-process enqueue | Request is rejected before queue mutation | Throw `Invalid command payload field: url` or `Missing or invalid url`; do not enqueue task |
| `queue_video_download.pageUrl` is non-HTTP(S) | Queue normalization | Request still queues without a page override | Drop `pageUrl` and continue |
| `queue_video_download.videoUrl` or `videoCandidates[*].url` is HTTP(S) but not a real Pinterest video asset | Queue normalization | Request still queues, but untrusted hints are ignored | Drop page/image/other non-video hints and preserve only validated Pinterest video assets |
| Mixed direct MP4 + manifest Pinterest hints arrive together | Queue normalization / source selection | Higher-trust direct MP4 is tried first | Sort surviving candidates so direct MP4 precedes manifest-like entries |
| yt-dlp emits `Embedding metadata` or `Deleting original file` with no percent | `src/electron-runtime/ytDlpProgress.ts` parser | UI still receives a terminal `post_processing` progress update | Emit `video-download-progress` with `stage="post_processing"` and `percent=100` instead of returning `null` |

### 5. Good / Base / Bad Cases

- Good:
  - `export_support_log` returns the generated file path as `String`, writes a sectioned summary log, and still succeeds when downloader probing falls back to placeholder text.
  - Rust and TypeScript contracts are changed together; `check_ytdlp_version` still exposes `updateAvailable` on frontend and keeps `current` available when remote lookup fails.
  - `video-download-complete` payload always includes `success`, with `file_path`/`error` optional.
  - A Pinterest drag payload with a valid primary `url`, canonical `pageUrl`, and both MP4 + manifest hints keeps only validated video assets and orders the direct MP4 first.
  - A yt-dlp finalization line such as `Embedding metadata` or `Deleting original file` advances the UI into `post_processing` instead of disappearing as parser noise.
  - Missing rename key still yields deterministic behavior: keep source name when available.
  - Rename-disabled yt-dlp full-video output uses `<title>[<width>x<height>][<quality>]` so `highest`, `balanced`, and `data-saver` can coexist for the same source title.
  - Reset command clears `renameSequenceCounters` and returns `Ok(true)`.
  - `prefix_number` + prefix/suffix generates `<prefix>_<num>_<suffix>.<ext>` when both affixes are non-empty.
  - Clip output naming uses `<startMs>-<endMs>_<title>` when rename is disabled.
  - Browser extension sends canonical YouTube/Bilibili current-item URLs and runtime keeps the request in single-item mode.
  - A pasted YouTube/Bilibili page URL without `title` still settles to a human-readable video title when yt-dlp metadata can provide one before download starts.
- Base:
  - Support-log export writes the file under the app config tree and returns its path without extra metadata.
  - Existing command keeps same shape; only implementation changes internally.
  - Support-log summary excludes theme/language while keeping download-diagnostic settings.
  - Optional fields remain optional and callers branch on presence.
  - A request with a valid primary `url` but invalid `pageUrl` / `videoUrl` still queues after dropping those untrusted hints.
  - GitHub latest lookup can fall back to cached/stale data or `null` without breaking the whole settings view.
  - Image/video source filename unavailable falls back to sequence naming without panic.
  - Empty suffix keeps `<num>.<ext>` or `<prefix>_<num>.<ext>` (no trailing underscore).
  - Older `video_selected_v2` payloads without `selectionScope` continue to work with existing auto behavior.
- Bad:
  - `export_support_log` starts returning `{ path: string }` while frontend still expects `string`.
  - Rust renames field without serde alias and frontend still reads old key.
  - `check_ytdlp_version` returns `Err(...)` on GitHub rate limit even though `current` was already resolved successfully.
  - Frontend assumes `file_path` always exists when `success` is false.
  - New command added with untyped `invoke("...")` and unchecked cast.
  - Different download paths implement different defaults for the same rename setting.
  - One download path ignores preset and still forces ascending sequence.
  - `precise` silently downgrades to `libx264` after hardware probe failure.
  - Clip output falls back to opaque cache-like name (`src-<hash>.mp4`) in user output directory.
  - A YouTube `watch?v=...&list=...` player click still triggers playlist pagination instead of the selected current video.
  - A pasted YouTube/Bilibili URL skips metadata-title probing and falls straight back to `watch` / `BV...` even though yt-dlp could have resolved the title before download.
  - A `blob:` / `javascript:` Pinterest drag URL is accepted as the queued primary `url`.
  - A Pinterest page URL or image URL survives normalization as `videoUrl` and incorrectly overrides the provider/orchestrator path as if it were a real media asset.
  - A yt-dlp `Embedding metadata` line is ignored, so the UI never enters `post_processing`.

### 6. Tests Required (with assertion points)

- Type contract assertions:
  - `pnpm exec tsc --noEmit` (or project equivalent) passes after command/payload changes.
  - No new `any` introduced for command results/events.
- Runtime contract assertions:
  - Trigger `export_support_log` and assert the returned string path exists on disk.
  - Queue a pasted YouTube or Bilibili page URL without `title` and assert runtime probes yt-dlp metadata before output-stem allocation, producing a title-based stem instead of `watch` / `BV...` when metadata succeeds.
  - Make the log directory unavailable and verify the command returns `Err(String)` with filesystem context.
  - Force downloader probing to fail and verify `export_support_log` still writes a file containing placeholder text.
  - Verify exported content contains the `environment`, `settings`, `downloaders`, and `runtime_evidence` sections.
  - Verify exported content includes bundled downloader/runtime diagnostic metadata such as `gallery-dl` and `deno_path=...`, and omits a raw pretty-printed full config snapshot.
  - Verify exported settings summary includes download-diagnostic fields and omits theme/language.
  - Verify runtime evidence keeps warning/error and route/terminal breadcrumbs while dropping high-frequency progress noise.
  - Force GitHub latest lookup to fail and verify `check_ytdlp_version` still returns local `current` with `latest=null` and `latestError` populated.
  - Trigger one successful and one failed video download; verify `video-download-complete` payload is consumed without crashes.
  - Run yt-dlp version check and verify frontend reads `updateAvailable` / `latestError` exactly.
  - Remove both rename keys from config and verify first image/video download prefers source naming.
  - Use legacy-only `videoKeepOriginalName` config and verify naming behavior matches previous expectation.
  - Enable rename mode with missing preset key and verify first renamed output starts from `99`.
  - Set preset to `asc_number` and verify renamed outputs increase from `1`.
  - Set preset to `prefix_number` with suffix empty and verify no empty `_` segment in filename.
  - Set prefix/suffix containing illegal filename chars and verify output stem is sanitized.
  - Enable rename mode, trigger at least one renamed download, call `reset_rename_counter`, then verify next renamed download restarts from reset baseline (subject to collision-avoidance).
  - With a legacy config containing `clipDownloadMode=precise`, verify logs still show `clipMode=fast` and slicing follows the fast path.
  - With rename disabled and clip range set, verify output filename follows `<startMs>-<endMs>_<title>.mp4` and collision appends `_2`.
  - With rename disabled and no clip range, verify yt-dlp full-video output template includes both resolution and quality suffix so different presets do not collide for the same title.
  - Trigger an extension `video_selected_v2` request without `selectionScope` and assert backend parses it successfully with auto behavior.
  - Trigger a YouTube player download from `watch?v=...&list=...` and assert the forwarded `url` is canonicalized to the current `v` while yt-dlp receives `--no-playlist`.
  - Trigger a Bilibili multi-part or bangumi current-item download and assert the forwarded `url` preserves current-item semantics (`p=` or `ep`) without expanding into the full collection.
  - `src/electron-runtime/commandRouter.test.ts` must reject a non-HTTP(S) primary `url`, drop invalid `pageUrl` / `videoUrl` hints, and keep direct MP4 candidates ahead of manifest candidates.
  - `electron/videoHintNormalization.test.mts` must verify HTTP(S)-only `url` / `pageUrl` normalization plus non-video hint filtering and MP4-first candidate ordering.
  - `src/electron-runtime/ytDlpProgress.test.ts` must cover standard download lines, merge lines, `Embedding metadata`, `Deleting original file`, and unrelated noise.
- Regression assertions:
  - Config read/write path (`get_config` + `save_config`) still handles valid JSON string payload.

### 7. Wrong vs Correct

#### Wrong

```rust
#[derive(serde::Serialize)]
struct YtdlpVersionInfo {
    current: String,
    latest: String,
    update_available: bool, // frontend expects updateAvailable
}
```

```ts
const info = await invoke("check_ytdlp_version");
if ((info as any).updateAvailable) {
  // unsafe cast + untyped invoke
}
```

#### Correct

```rust
#[derive(serde::Serialize)]
struct YtdlpVersionInfo {
    current: String,
    latest: String,
    #[serde(rename = "updateAvailable")]
    update_available: bool,
}
```

```ts
const info = await invoke<{ current: string; latest: string; updateAvailable: boolean }>(
  "check_ytdlp_version"
);
if (info.updateAvailable) {
  // type-safe access
}
```

---

## Scenario: Browser Extension WS `save_data_url` Contract

### 1. Scope / Trigger

- Trigger: Browser extension (`background.js`) requests screenshot save through WS action `save_data_url`.
- Why this needs code-spec depth: This is a cross-layer runtime contract (`content script` -> `extension background` -> `WS` -> `Rust`) where field drift silently breaks fallback behavior.

### 2. Request / Response Signatures

Request action:

```json
{
  "action": "save_data_url",
  "data": {
    "requestId": "req_...",
    "dataUrl": "data:image/png;base64,...",
    "originalFilename": "title@00-12-34.png",
    "requireRenameEnabled": true
  }
}
```

Rust response envelope:

```json
{
  "success": true | false,
  "message": "optional detail",
  "data": {
    "requestId": "req_...",
    "code": "optional_error_code"
  }
}
```

### 3. Field Contracts

- `action` must be exactly `save_data_url`.
- `data.requestId` is required for request-response matching in extension pending map.
- `data.dataUrl` must be a `data:` URL payload accepted by backend `save_data_url`.
- `data.originalFilename` is optional and used by backend naming path.
- `data.requireRenameEnabled`:
  - `true`: backend must reject with code `rename_disabled` when rename toggle is off.
  - `false`/absent: backend may save regardless of rename toggle.

### 4. Validation & Error Matrix

| Condition | Backend Result | `data.code` | Extension Behavior |
|-----------|----------------|-------------|--------------------|
| Rename enabled + save succeeds | `success: true` | absent | Keep FlowSelect save path |
| Rename disabled + `requireRenameEnabled=true` | `success: false` | `rename_disabled` | Fallback to browser download |
| Invalid payload (missing `dataUrl`) | `success: false` | `missing_data_url` | Fallback to browser download |
| Save failure (`save_data_url` command error) | `success: false` | `save_data_url_failed` | Fallback to browser download |
| WS closed/timeout on extension side | local failure | `ws_closed` / `request_timeout` | Fallback to browser download |

### 5. Good / Base / Bad Cases

- Good:
  - Response echoes matching `requestId`.
  - Rename toggle on -> screenshot save uses FlowSelect path.
  - Rename toggle off + strict mode -> explicit `rename_disabled`.
- Base:
  - Missing optional `originalFilename` still saves with backend default naming.
- Bad:
  - Response omits `requestId` and pending request never resolves.
  - Backend changes `code` literals without extension fallback mapping update.

---

## Scenario: Protected Image Browser-Context Fallback Contract

### 1. Scope / Trigger

- Trigger: Frontend image drag/drop calls `download_image` with an optional protected-image fallback hint, and backend may ask the browser extension to resolve image bytes when direct/native fetch is rejected.
- Why this needs code-spec depth: This is a four-hop contract (`drag payload` -> `frontend invoke` -> `Rust WS broadcast` -> `extension resolution result`) where request IDs and field names must stay aligned for the synchronous fallback path to complete.

### 2. Command / WS Signatures

Frontend command usage:

```ts
await invoke<string>("download_image", {
  url: "https://cdn.example.com/protected.jpg",
  targetDir: "D:\\Downloads",
  protectedImageFallback: {
    token: "opaque-token",
    pageUrl: "https://www.example.com/page",
    imageUrl: "https://cdn.example.com/protected.jpg",
  },
});
```

Rust command boundary:

```rust
#[tauri::command]
async fn download_image(
    app: AppHandle,
    url: String,
    target_dir: Option<String>,
    protected_image_fallback: Option<ProtectedImageFallbackInput>,
) -> Result<String, String>
```

Desktop -> extension WS action:

```json
{
  "action": "resolve_protected_image",
  "data": {
    "requestId": "protected-image-1",
    "token": "opaque-token",
    "imageUrl": "https://cdn.example.com/protected.jpg",
    "pageUrl": "https://www.example.com/page",
    "targetDir": "D:\\Downloads"
  }
}
```

Extension -> desktop WS result:

```json
{
  "action": "protected_image_resolution_result",
  "data": {
    "requestId": "req_123",
    "correlationRequestId": "protected-image-1",
    "success": true,
    "filePath": "D:\\Downloads\\protected.jpg"
  }
}
```

### 3. Field Contracts

- Frontend `download_image` payload:
  - `url: string` is still the canonical direct-download target.
  - `protectedImageFallback?: { token: string; pageUrl?: string | null; imageUrl?: string | null }`
  - `protectedImageFallback.token` must be non-empty when provided.
  - `pageUrl` / `imageUrl` are advisory hints only; backend must normalize and validate them before use.
- Rust direct/fallback ownership:
  - Backend must try direct `download_image` first.
  - Backend may attempt protected-image fallback only when:
    - `protected_image_fallback` exists, and
    - direct failure is hotlink-like (`401`, `403`, HTML/text response, or equivalent).
  - Backend must keep this flow synchronous from the command caller's point of view.
- Desktop -> extension `resolve_protected_image`:
  - `data.requestId` is the desktop-generated correlation key for the waiting oneshot.
  - `data.token` is required and must match a registered short-lived drag token in extension background.
  - `data.imageUrl` is the preferred image target to resolve in browser context.
  - `data.pageUrl` is optional page-context validation.
  - `data.targetDir` is optional convenience context; actual persistence still goes through backend `save_data_url`.
- Extension -> desktop `protected_image_resolution_result`:
  - Extension transport request still carries its own `data.requestId` for normal pending-map resolution.
  - `data.correlationRequestId` must echo the original desktop `resolve_protected_image.data.requestId`.
  - `data.success` controls whether backend resolves or rejects the waiting fallback path.
  - `data.filePath` is required on success.
  - `data.code` / `data.error` are optional but strongly recommended on failure.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior |
|-----------|------------------|-------------------|
| `protectedImageFallback` absent | Rust command entry | Direct image path only |
| Direct image fetch succeeds | Rust direct path | Do not broadcast `resolve_protected_image` |
| Direct image fetch fails with `403` / HTML rejection | Rust fallback gate | Broadcast `resolve_protected_image` and wait synchronously |
| Extension token missing/expired | Extension background registry | Send `protected_image_resolution_result` with failure code `protected_image_token_missing` |
| Content script cannot resolve bytes | Extension content script | Send failure with actionable `code` / `error` |
| `save_data_url` succeeds after browser resolution | Extension background + Rust save path | Reply with `success=true` and final `filePath` |
| `correlationRequestId` missing in result | Rust WS handler | Reject response as invalid and keep no stale pending sender |
| No extension result before timeout | Rust timeout path | Fail command with protected-image timeout error and runtime breadcrumb |

### 5. Good / Base / Bad Cases

- Good:
  - Direct image request returns `403 text/html`, backend broadcasts `resolve_protected_image`, extension resolves bytes, calls `save_data_url`, and backend returns the saved path from the original `download_image` command.
- Base:
  - Public image drag succeeds directly and never touches the protected-image WS path.
- Bad:
  - Extension sends only its local `requestId` and forgets `correlationRequestId`, leaving backend waiting until timeout.
  - Backend retries protected-image fallback for every image error, including DNS or malformed-URL failures.

### 6. Tests Required (with assertion points)

- Rust/unit:
  - Support-log runtime evidence retains `protected_image_fallback_requested` and `protected_image_fallback_complete`.
  - Hotlink-like error classifier matches `403` / HTML rejection but does not trigger on unrelated errors.
- Extension/runtime:
  - Dragging a protected browser image registers a token in background before drop completes.
  - Background receives `resolve_protected_image` and sends `protected_image_resolution_result` with matching `correlationRequestId`.
- End-to-end:
  - Protected image drag that fails direct fetch still saves into FlowSelect `outputPath`.
  - Public image drag continues to resolve through direct path only.
  - Disconnected extension or expired token fails clearly instead of hanging indefinitely.

### 7. Wrong vs Correct

#### Wrong

```json
{
  "action": "protected_image_resolution_result",
  "data": {
    "requestId": "req_123",
    "success": false
  }
}
```

#### Correct

```json
{
  "action": "protected_image_resolution_result",
  "data": {
    "requestId": "req_123",
    "correlationRequestId": "protected-image-1",
    "success": false,
    "code": "protected_image_token_missing",
    "error": "Protected image drag token was missing or expired"
  }
}
```

---

## Scenario: Browser Extension WS `video_selected_v2` Download Preference Contract

### 1. Scope / Trigger

- Trigger: Browser extension sends `video_selected_v2` over WebSocket to queue a desktop video download.
- Why this needs code-spec depth: Quality preference and the deprecated AE compatibility flag cross the extension-storage -> WS payload -> Rust queue/finalization boundary and can silently drift.

### 2. Request Signature

Request action:

```json
{
  "action": "video_selected_v2",
  "data": {
    "url": "https://example.com/watch?v=123",
    "pageUrl": "https://example.com/watch?v=123",
    "title": "Example",
    "ytdlpQualityPreference": "best"
  }
}
```

### 3. Field Contracts

- `data.ytdlpQualityPreference`:
  - Optional string.
  - Accepted values: `"best"`, `"balanced"`, `"data_saver"`.
  - If present and valid, it overrides the desktop app's persisted preference for this queued download.
  - If present and valid, Rust must also persist it to config key `defaultVideoDownloadQuality` for future paste / queue defaults.
  - Missing/invalid values must fall back to the desktop app's persisted preference.
- `data.aeFriendlyConversionEnabled`:
  - Optional boolean.
  - Deprecated legacy compatibility field after popup AE-toggle removal in Phase 3.
  - Current extension popup/background flows should not send it.
  - If present from an older client, Rust may still persist it to config key `aeFriendlyConversionEnabled` for backward compatibility and support-log visibility.
  - It must not suppress the new transcode-queue model: `video-download-complete` still represents source download completion, and any non-AE-safe source may enqueue a transcode task regardless of this flag.
- Direct-download and yt-dlp success paths both follow the same source-first completion model; downstream transcode queueing is no longer a yt-dlp-only inline tail.
- Desktop defaults used by `download_video` / `queue_video_download`:
  - Read from `src-tauri/src/lib.rs` persisted config keys `defaultVideoDownloadQuality` and `aeFriendlyConversionEnabled`.
  - Current extension flows actively sync only `defaultVideoDownloadQuality`; `aeFriendlyConversionEnabled` may remain in config as a legacy field but is no longer user-configurable from the popup.
  - If no preference has been synced yet, default to `balanced` + `false`.

### 4. Validation & Error Matrix

| Condition | Backend Behavior |
|-----------|------------------|
| Current extension payload with valid quality only | Persist `defaultVideoDownloadQuality`, keep the legacy AE flag unchanged if the field is absent, emit `video-download-complete` for the source file, then enqueue transcode if the source is not AE-safe |
| Legacy payload with valid quality + `aeFriendlyConversionEnabled` | Preserve quality routing, persist both values, emit `video-download-complete` for the source file, then enqueue transcode if the source is not AE-safe |
| Invalid/missing quality value | Use persisted `defaultVideoDownloadQuality` value |
| No persisted config keys yet | Use desktop fallback `balanced` + `false` |

### 5. Good / Base / Bad Cases

- Good:
  - Current extension sends only `ytdlpQualityPreference`, Rust queues the download successfully, and later pasted-link downloads reuse the synced quality.
  - Older extension payloads that still include `aeFriendlyConversionEnabled` remain accepted for backward compatibility.
- Base:
  - Desktop app has never received a preference sync and pasted-link downloads use `balanced` + `false`.
- Bad:
  - Current extension continues sending an `aeFriendlyConversionEnabled` field even though the popup no longer exposes that setting.
  - Rust still lets `aeFriendlyConversionEnabled=false` bypass transcode queue creation and silently revives the old inline/skip split.
  - Rust falls back to `Best` for pasted-link downloads and reintroduces unintended `mkv` output when the user selected `Balanced` in the extension.

### 6. Tests Required (with assertion points)

- WebSocket payload:
  - Trigger one current extension `video_selected_v2` request and assert the request succeeds when the payload includes `ytdlpQualityPreference` but omits `aeFriendlyConversionEnabled`.
  - Simulate one older extension `video_selected_v2` payload with `aeFriendlyConversionEnabled` present and assert the backend still accepts it without changing transcode-queue semantics.
- Persistence + paste path:
  - Set extension quality to `Balanced`, reconnect extension or change the popup setting, then paste a Bilibili URL into the main window and assert the queued yt-dlp run uses `balanced` instead of `best`.
  - Set extension quality to `Highest`, reconnect extension or change the popup setting, then paste a supported video URL and assert the queued yt-dlp run uses `best`.
- source-complete vs transcode handoff:
  - With the current quality-only payload, complete a non-AE-safe yt-dlp download and assert `video-download-complete` fires before any `video-transcode-progress` / `video-transcode-complete` activity.
  - With the current quality-only payload, complete an already AE-safe download and assert no transcode task is enqueued.
- Backward compatibility:
  - Send or simulate an older `video_selected_v2` payload with or without `aeFriendlyConversionEnabled` and assert the backend still completes successfully.

---

## Scenario: Browser Extension WS `sync_download_preferences` Contract

### 1. Scope / Trigger

- Trigger: Browser extension `background.js` sends `sync_download_preferences` when the desktop WebSocket connects or when extension local-storage preference keys change.
- Why this needs code-spec depth: This is the contract that keeps desktop-side pasted-link downloads aligned with extension popup settings even before the next `video_selected_v2` request.

### 2. Request Signature

Request action:

```json
{
  "action": "sync_download_preferences",
  "data": {
    "ytdlpQualityPreference": "balanced"
  }
}
```

### 3. Field Contracts

- Source files:
  - Extension sender: `browser-extension/background.js`
  - Extension storage keys: `browser-extension/direct-download-quality.js`
  - Rust receiver + config persistence: `src-tauri/src/lib.rs`
- `data.ytdlpQualityPreference`:
  - Optional string.
  - Accepted values: `"best"`, `"balanced"`, `"data_saver"`.
  - When valid, Rust must write config key `defaultVideoDownloadQuality`.
- `data.aeFriendlyConversionEnabled`:
  - Optional boolean.
  - Deprecated legacy field from older extension builds.
  - Current extension flows should not send it after popup AE-toggle removal.
  - When present, Rust may still write config key `aeFriendlyConversionEnabled` as a backward-compatibility field.
- At least one of the two fields must be present; otherwise the WS action must fail.
- Rust response payload should echo the resolved stored quality in `data.quality`; it may continue echoing `data.aeFriendlyConversionEnabled` while backward compatibility remains.

### 4. Validation & Error Matrix

| Condition | Backend Behavior |
|-----------|------------------|
| Valid quality only | Persist `defaultVideoDownloadQuality`; keep existing AE flag |
| Valid AE flag only | Persist `aeFriendlyConversionEnabled`; keep existing quality; do not let the flag bypass transcode queue creation |
| Both fields valid | Persist both and return stored values |
| Neither field present | Return `success: false` with descriptive error |
| Config parse / serialize / write failure | Return `success: false` with descriptive error |

### 5. Good / Base / Bad Cases

- Good:
  - Current extension connects, sends a quality-only sync action once, and a subsequent pasted-link download uses the synced quality.
  - Changing popup quality triggers storage change sync without needing a browser-triggered download first.
- Base:
  - Older extension builds may still sync one field at a time, and Rust preserves the missing field from current config.
- Bad:
  - Current extension still depends on the removed AE storage key to trigger sync, leaving quality-only changes stale.
  - Extension changes local storage but never sends sync, leaving pasted-link downloads stale.
  - Rust accepts an empty payload and silently keeps unknown state.

### 6. Tests Required (with assertion points)

- Connection sync:
  - Start desktop app, let extension connect, and assert one quality-only `sync_download_preferences` request is emitted from `background.js`.
- Storage-change sync:
  - Change quality in popup and assert a follow-up `sync_download_preferences` request is sent without waiting for `video_selected_v2`.
- Rust persistence:
  - After sync, inspect config or support log and assert `defaultVideoDownloadQuality` was updated; a legacy `aeFriendlyConversionEnabled` value may remain unchanged when not sent.
- Main-window behavior:
  - After sync only, paste a supported video URL into the desktop app and assert the download path reflects the stored quality/container choice.
- Backward compatibility:
  - Simulate an older sync payload that still includes `aeFriendlyConversionEnabled` and assert Rust still accepts it.

---

## Scenario: Video Download Source Completion and Transcode Queue Contract

### 1. Scope / Trigger

- Trigger: Any change to backend download success handling, transcode queue state, transcode retry/remove commands, or transcode event payloads in `src-tauri/src/lib.rs`.
- Why this needs code-spec depth: The model now spans multiple runtime boundaries (`download worker` -> `download queue events` -> `transcode queue state` -> `frontend listeners`) and can silently regress if source-complete and transcode-complete semantics blur together again.

### 2. Signatures

Current command/event boundary signatures:

```rust
#[tauri::command]
async fn retry_transcode(app: AppHandle, trace_id: String) -> Result<bool, String>

#[tauri::command]
async fn remove_transcode(app: AppHandle, trace_id: String) -> Result<bool, String>

#[derive(serde::Serialize, Clone)]
struct VideoTranscodeQueueCountPayload {
    #[serde(rename = "activeCount")]
    active_count: usize,
    #[serde(rename = "pendingCount")]
    pending_count: usize,
    #[serde(rename = "failedCount")]
    failed_count: usize,
    #[serde(rename = "totalCount")]
    total_count: usize,
    #[serde(rename = "maxConcurrent")]
    max_concurrent: usize,
}

#[derive(serde::Serialize, Clone)]
struct VideoTranscodeTaskPayload {
    #[serde(rename = "traceId")]
    trace_id: String,
    label: String,
    status: VideoTranscodeTaskStatus, // "pending" | "active" | "failed"
    stage: Option<VideoTranscodeStage>, // "analyzing" | "transcoding" | "finalizing_mp4" | "failed"
    #[serde(rename = "progressPercent")]
    progress_percent: Option<f32>,
    #[serde(rename = "etaSeconds")]
    eta_seconds: Option<u64>,
    #[serde(rename = "sourcePath")]
    source_path: Option<String>,
    #[serde(rename = "sourceFormat")]
    source_format: Option<String>,
    #[serde(rename = "targetFormat")]
    target_format: Option<String>,
    error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct VideoTranscodeCompletePayload {
    #[serde(rename = "traceId")]
    trace_id: String,
    label: String,
    #[serde(rename = "sourcePath")]
    source_path: String,
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "sourceFormat")]
    source_format: Option<String>,
    #[serde(rename = "targetFormat")]
    target_format: String,
}
```

### 3. Contracts

- Source-complete boundary:
  - `video-download-complete` means the source file finished downloading successfully or failed terminally.
  - Successful `video-download-complete.file_path` must point to the downloaded source media path before any downstream transcode replacement happens.
  - Backend must emit `video-download-complete` before enqueueing any downstream transcode task for the same `traceId`.
- Download queue contract:
  - Existing `video-queue-count` / `video-queue-detail` remain the download queue contract.
  - They must not be widened to include transcode rows during Phase 1 backend work.
- Transcode queue contract:
  - `video-transcode-queue-count` reports `activeCount`, `pendingCount`, `failedCount`, `totalCount`, `maxConcurrent`.
  - `maxConcurrent` is always `1`.
  - `video-transcode-queue-detail.tasks` order is `active` -> `pending` -> `failed`.
  - Each detail row may expose `stage`, `progressPercent`, `etaSeconds`, `sourcePath`, `sourceFormat`, `targetFormat`, and `error`.
  - `targetFormat` is currently always `"mp4"`.
- Scheduling contract:
  - At most one transcode may be active at a time.
  - Backend must not start a new transcode while download work is still blocking queue priority.
  - Any non-AE-safe completed download source may enqueue a transcode task, regardless of legacy `aeFriendlyConversionEnabled`.
- Retry/remove contract:
  - `cancel_transcode(traceId)` only targets pending or active transcode rows for the matching `traceId`.
  - `cancel_transcode` must stop the current transcode flow and settle the row through the existing cancelled/removed path.
  - If GPU ffmpeg work was interrupted because of `cancel_transcode`, backend must not reinterpret that interruption as a GPU failure or start CPU fallback transcoding.
  - `retry_transcode(traceId)` only targets failed transcode rows.
  - `retry_transcode` must requeue the preserved local source path; it must not recreate a network download.
  - `remove_transcode(traceId)` only removes a failed transcode row from backend queue state.
  - `remove_transcode` must not delete the local source file.
- Completion contract:
  - `video-transcode-progress` represents the active transcode lifecycle.
  - Active ffmpeg transcode paths should run with streaming progress enabled (`-progress pipe:1 -nostats`) instead of waiting only on final process exit.
  - When media duration is known, backend should derive `progressPercent` from ffmpeg-reported processed time versus total duration.
  - When ffmpeg exposes `speed=`, backend should derive `etaSeconds`; if `speed=` is absent, backend may fall back to wall-clock throughput using processed media seconds divided by elapsed wall time.
  - `etaSeconds` is optional and must reset to `null` when a task is retried, fails, or transitions into a non-progress-reporting stage.
  - `video-transcode-complete.filePath` is the final replaced AE-friendly output path.
  - `video-transcode-failed.error` must be actionable text suitable for inline queue recovery UI.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Source download succeeds and file is already AE-safe | Download success follow-up | `video-download-complete` fires, no transcode task is enqueued, AE handoff uses source path | Keep transcode queue unchanged |
| Source download succeeds and file is not AE-safe | Download success follow-up | `video-download-complete` fires first, then `video-transcode-queued` / transcode queue state appears | Enqueue transcode task with same `traceId` |
| Probe for AE safety fails | Download success follow-up | Backend still queues fallback transcode instead of skipping silently | Emit transcode probe warning and queue task |
| ffprobe JSON probe succeeds | Media probe path | Summary includes duration when ffprobe returns `format.duration` | Request `duration` in `-show_entries` and parse it into `duration_seconds` |
| ffprobe unavailable or unsupported | Media probe fallback path | Backend may still derive duration from ffmpeg `Duration:` header | Parse fallback stderr header and keep `duration_seconds` optional |
| Download work is still active or pending | Transcode scheduler gate | No new transcode starts | Leave task pending until download pressure clears |
| Active ffmpeg transcode emits `out_time=` and `speed=` | Streaming progress path | Queue row updates incrementally with `progressPercent` and `etaSeconds` | Parse stdout progress lines and emit `video-transcode-progress` deltas |
| Active ffmpeg transcode lacks duration or speed | Streaming progress path | UI remains stable with stage-only or percent-only updates | Leave `progressPercent` / `etaSeconds` absent when indeterminate |
| `cancel_transcode` called for active GPU transcode | Command/runtime boundary | Backend kills ffmpeg, skips CPU fallback, and settles the task as cancelled/removed | Return `Ok(true)`, preserve source file, and emit cancellation removal events |
| Active transcode succeeds | Transcode worker | Queue row disappears from active state, `video-transcode-complete` emits final path, local AE handoff uses final path | Emit complete payload and remove active row |
| Active transcode fails | Transcode worker | Row remains visible as `failed` with `error` populated | Push task into failed section and emit `video-transcode-failed` |
| `retry_transcode` called for unknown trace | Command boundary | No crash, return `false` | Leave queue unchanged |
| `retry_transcode` called but source file is missing | Command boundary | Return `Err(String)` describing missing local source | Keep failed row intact |
| `remove_transcode` called for unknown trace | Command boundary | No crash, return `false` | Leave queue unchanged |
| `remove_transcode` called for failed trace | Command boundary | Failed row disappears, local source file remains on disk | Emit `video-transcode-removed` |

### 5. Good / Base / Bad Cases

- Good:
  - A `best` yt-dlp download finishes to `movie.mkv`, emits `video-download-complete` with `movie.mkv`, then enters the transcode queue and later emits `video-transcode-complete` with the AE-friendly MP4 replacement path.
  - A full ffmpeg transcode with known source duration emits incremental `video-transcode-progress` payloads such as `progressPercent=67.0` and `etaSeconds=83`, and the queue row reflects both.
  - A GPU transcode is actively running, the user clicks cancel, and the task emits the existing cancelled/removed queue transition without any CPU fallback attempt.
  - A direct-download MP4/H.264/AAC source emits `video-download-complete` and never creates a transcode row.
  - A failed transcode row is retried from the same local file and does not touch network download state.
- Base:
  - A transcode queue can be empty while the legacy download queue still works unchanged.
  - `video-transcode-progress` may omit `progressPercent` and/or `etaSeconds` when ffmpeg progress is indeterminate, as long as `stage` remains accurate.
- Bad:
  - Backend delays `video-download-complete` until after transcode completes, recreating the old inline-late-stage contract.
  - Backend requests ffprobe JSON without `format.duration`, so ETA silently disappears even when ffprobe is available.
  - Backend treats a user-cancelled GPU transcode as a generic ffmpeg failure and falls back to CPU transcoding.
  - Backend injects transcode rows into `video-queue-detail` and breaks the current Phase 1 frontend.
  - `remove_transcode` deletes the preserved local source file or causes the same task to silently reappear without user action.

### 6. Tests Required (with assertion points)

- Compile/type:
  - `cargo check` passes after adding `etaSeconds` to the transcode payload structs/events and wiring streaming ffmpeg progress.
- Download success handoff:
  - Complete an AE-safe source and assert `video-download-complete` fires with no `video-transcode-queued`.
  - Complete a non-AE-safe source and assert `video-download-complete` arrives before transcode queue/progress events for the same `traceId`.
- Parsing/unit:
  - Add unit tests for ffprobe duration parsing, ffmpeg fallback `Duration:` parsing, and ffmpeg `out_time=` / `speed=` progress parsing.
- Scheduler:
  - Queue multiple downloads plus a transcode candidate and assert no new transcode starts while download work is still blocking priority.
  - Queue multiple transcode candidates and assert only one active transcode row exists at a time.
- Recovery:
  - Start an active GPU transcode, call `cancel_transcode`, and assert the task emits cancelled/removed state without any CPU fallback transcode starting.
  - Force one transcode failure, call `retry_transcode`, and assert the failed row becomes pending/active without any new download row.
  - Force one transcode failure, call `remove_transcode`, and assert the row disappears while the local source file remains on disk.
- Completion:
  - Complete a transcode and assert `video-transcode-complete.filePath` points to the final replaced output path.

### 7. Wrong vs Correct

#### Wrong

```rust
command.args([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_entries",
    "format=format_name:stream=codec_type,codec_name",
]);

run_ffmpeg_capture_output(&app, ffmpeg_args, "ffmpeg task", Some(trace_id)).await?;
```

#### Correct

```rust
command.args([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_entries",
    "format=format_name,duration:stream=codec_type,codec_name",
]);

run_ffmpeg_with_transcode_progress(
    &app,
    with_ffmpeg_progress_pipe_args(ffmpeg_args),
    trace_id,
    VideoTranscodeStage::Transcoding,
    duration_seconds,
)
.await?;
```

---

## Scenario: Startup Language Bootstrap Contract

### 1. Scope / Trigger

- Trigger: Any change to app language bootstrap, `get_config` / `save_config` language handling, native tray language loading, or frontend startup consumption of config language.
- Why this needs code-spec depth: The startup language is a cross-layer contract (`config JSON` -> `Rust bootstrap` -> `native tray labels` -> `frontend i18n bootstrap`) that can drift silently if each layer resolves locale independently.

### 2. Signatures

Current Rust signatures and helpers:

```rust
#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<String, String>

#[tauri::command]
fn save_config(app: tauri::AppHandle, json: String) -> Result<(), String>

fn resolve_current_app_language(app: &tauri::AppHandle) -> Result<&'static str, String>

pub fn detect_system_locale() -> Option<String>

pub fn resolve_startup_language_from_config_str(
    config_raw: &str,
    system_locale: Option<&str>,
) -> StartupLanguageDecision

pub fn persist_resolved_language_in_config(config_raw: &str, language: &str) -> Option<String>
```

Frontend startup consumer:

```ts
const configStr = await invoke<string>("get_config");
const initialLanguage = resolveAppLanguageFromConfigString(
  configStr,
  navigator.language,
);
```

Config key contract:

```json
{
  "language": "en" | "zh-CN"
}
```

### 3. Contracts

- `config.language` is the canonical app-language preference once it exists and normalizes to a supported value.
- Supported app languages remain exactly:
  - `en`
  - `zh-CN`
- Normalization rules:
  - English variants such as `en`, `en-US`, `en_GB` normalize to `en`
  - Chinese variants such as `zh`, `zh-CN`, `zh_Hans`, `zh-TW` normalize to `zh-CN`
  - Unsupported locales normalize to no value and fall back to English
- Startup authority contract:
  - Rust `resolve_current_app_language(...)` is the authoritative startup-language resolver for native surfaces.
  - Native tray creation must use the language returned by `resolve_current_app_language(...)`.
  - Frontend startup must continue to read `get_config` and bootstrap i18n from the returned config string.
- First-launch persistence contract:
  - If config JSON exists and is a valid object but `language` is missing or unsupported, Rust may resolve from system locale and must persist the normalized result back into config before native tray labels are created.
  - If config JSON exists but is invalid/non-object, Rust must still resolve a runtime startup language from system locale or English fallback, but must not overwrite the invalid config blob during startup recovery.
  - If the config file does not yet exist, startup may resolve from system locale for the current boot without forcing an immediate file write through `get_config`.
- Save contract:
  - `save_config` compares the incoming language against the effective current app language, not only the raw saved config value.
  - When `save_config` receives a valid normalized next language that differs from the effective current language, backend must call `notify_language_changed(...)`.
  - If incoming config JSON is invalid, `save_config` must still write the raw JSON and skip language synchronization with a log message.
- WebSocket contract:
  - `get_language` must report the same effective language that native tray bootstrap uses.
  - `language_info.language` must always be one of `en` or `zh-CN`.
- Frontend contract:
  - `invoke<string>("get_config")` remains unchanged.
  - `resolveAppLanguageFromConfigString(configStr, navigator.language)` may still use `navigator.language` as a defensive fallback, but under normal startup it should receive the Rust-persisted language from config and therefore match native tray language.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Config contains valid `language` | Rust startup resolver | Saved language wins over system locale | Return normalized saved language without persistence |
| Config object missing `language` and system locale is supported | Rust startup resolver | App starts in normalized system language | Persist normalized language to config when config JSON is an object |
| Config object missing `language` and system locale is unsupported | Rust startup resolver | App starts in English | Persist `en` to config when config JSON is an object |
| Config JSON is invalid | Rust startup resolver | App still chooses runtime language safely | Do not overwrite config during startup; use system locale or English for runtime only |
| No config file exists yet | Rust startup resolver | App still chooses runtime language safely | Use system locale or English; allow config file to be created later through normal save flow |
| User changes language in Settings | `save_config` path | Active UI and tray update immediately | Compare against effective current language, write config, then emit change event |
| WebSocket client requests `get_language` | WS request path | Returned language matches tray/frontend startup language | Route through `resolve_current_app_language(...)` |

### 5. Good / Base / Bad Cases

- Good:
  - On first launch with config `{}` and system locale `zh-Hant`, Rust resolves `zh-CN`, persists it into config, tray labels start in Chinese, and frontend bootstrap reads `zh-CN` from `get_config`.
  - With saved config `{ "language": "en" }` and system locale `zh-CN`, both tray and frontend still start in English.
  - With invalid config JSON and system locale `zh-CN`, app starts in Chinese for the current session but does not overwrite the invalid config blob during startup.
- Base:
  - `resolveAppLanguageFromConfigString(...)` may still fall back to `navigator.language` if `get_config` fails entirely.
  - Unsupported locales such as `fr-FR` degrade to `en`.
- Bad:
  - Tray startup reads raw config and falls back to English while frontend independently chooses `navigator.language`, producing mixed startup languages.
  - `save_config` compares only the raw stored value and misses a change from effective runtime language to the newly saved language.
  - Startup writes a brand-new config file from `get_config` on every first run even though no explicit save occurred.

### 6. Tests Required (with assertion points)

- Rust unit tests:
  - Config language wins over system locale.
  - Missing config language resolves from supported system locale and marks persistence required when config JSON is an object.
  - Invalid config JSON resolves a runtime language safely and does not mark persistence required.
  - Persist helper updates `language` without clobbering unrelated config keys.
- Frontend tests:
  - `resolveAppLanguageFromConfigString(...)` still prefers config language over `navigator.language`.
  - Existing desktop language save tests keep writing `language` through `save_config`.
- Manual runtime checks:
  - Start the app with config `{}` and a Chinese system locale, then verify tray labels and main window both start in Chinese.
  - Start the app with config `{ "language": "en" }` and a Chinese system locale, then verify tray labels and main window both stay in English.
