## Scenario: Electron Download Command Bridge Contract

### 1. Scope / Trigger

- Trigger: Any task that changes Electron download command dispatch, browser-extension pasted-video resolution, or `src/electron-runtime` queue ownership.
- Why this needs code-spec depth: Download requests cross renderer IPC, extension WebSocket, Electron main, runtime dependency bootstrap, queue state, progress events, and terminal completion events.

### 2. Signatures

Renderer commands:

```ts
type ElectronDownloadCommand =
  | "queue_video_download"
  | "queue_pasted_video_download"
  | "cancel_download"
  | "cancel_transcode"
  | "retry_transcode"
  | "remove_transcode"
  | "get_runtime_dependency_status"
  | "get_runtime_dependency_gate_state"
  | "refresh_runtime_dependency_gate_state"
  | "start_runtime_dependency_bootstrap"
  | "check_ytdlp_version"
  | "get_gallery_dl_info";
```

Authoritative new-membership snapshot metadata:

```ts
type VideoQueueDetailPayload = {
  tasks: VideoQueueTaskPayload[];
  acceptedTraceId?: string;
};
```

Pasted-video extension request:

```json
{
  "action": "resolve_pasted_video_selection",
  "data": {
    "requestId": "pasted-video-selection-1",
    "url": "https://example.com/watch",
    "pageUrl": "https://example.com/watch",
    "siteHint": "youtube"
  }
}
```

Pasted-video extension result:

```json
{
  "action": "pasted_video_selection_result",
  "data": {
    "correlationRequestId": "pasted-video-selection-1",
    "success": true,
    "url": "https://example.com/watch",
    "pageUrl": "https://example.com/watch",
    "videoUrl": "https://cdn.example/video.mp4",
    "selectedVideoVariant": {
      "url": "https://cdn.example/video-1080.mp4",
      "label": "1080p",
      "type": "direct_mp4",
      "mediaType": "video"
    },
    "videoCandidates": [],
    "cookies": "# Netscape HTTP Cookie File",
    "selectionScope": "current_item",
    "ytdlpQualityPreference": "balanced",
    "extensionData": {
      "youtube": {
        "source": "pasted"
      }
    }
  }
}
```

### 3. Contracts

- `electron/main.mts` owns IPC/WS entrypoints but must not own a separate video download queue, `yt-dlp` spawn runner, or `yt-dlp` progress parser.
- `src/application/download-api.ts` owns the narrow canonical `DownloadApplicationApi` (queue / queue-pasted / cancel / advanced-quality selection, `QueueDownloadCommand`, `DownloadQueueAck`, `DownloadTerminalOutcome`). It is not a router, facade, or umbrella; transport names, wire casing and request IDs never appear in it.
- `electron/downloadIpcAdapter.mts` is the Renderer IPC download adapter: download command allowlist, outer payload decode, Application invocation. Non-download commands stay on the existing controller/switch path.
- `electron/downloadWsAdapter.mts` is the Extension WebSocket download adapter: `video_selected_v2`, `sync_download_preferences`, `pasted_video_selection_result` and `site_session_cookie_sync_result` with `{ success, message, data }` envelope acks and `unknown_action` failed acks. Extension stays queue-ack-only: no progress/result/cancel capability is exposed.
- `src/protocol/download/ipcMappers.ts` is the single wire -> canonical compatibility decoder and Application/core -> Renderer payload mapper (quality/request-ID aliases, capture evidence, progress/result/typed-error mapping).
- `src/protocol/envelopes.ts` owns the IPC outer-envelope and WS root/action-envelope decoders used by `electron/main.mts`; both transports treat their root frame as untrusted (non-blank string command/action required, malformed WS roots get the `Invalid request` failure envelope).
- `src/electron-runtime/service.ts` remains the only owner of video queue state, queue concurrency, cancellation, progress emission, terminal `video-download-complete`, telemetry, and transcode follow-up.
- An actual new runtime membership (normal queue creation or a new advanced-quality task) emits exactly one existing `video-queue-detail` snapshot with transient `acceptedTraceId`. Ordinary snapshots, existing-trace quality selection, and advanced-quality dedupe are unmarked. The field is never persisted or added to the Download reducer/model, and no local ack or second event channel may substitute for it.
- `electron/extensionRequestBridge.mts` owns pasted-video extension request correlation, timeout cleanup, result normalization, and shutdown rejection.
- `queue_pasted_video_download` may use extension-assisted pre-resolution, but the resolved payload must be enqueued through the same `DownloadApplicationApi` queue path as `queue_video_download`.
- `video_selected_v2` WebSocket requests must enqueue through `downloadWsAdapter` -> `DownloadApplicationApi`, not through a second queue implementation.
- `video_selected_v2` requests must preserve all download-routing fields when decoding into the canonical `QueueDownloadCommand` (`pageUrl`, `selectionScope`, `clipStartSec`, `clipEndSec`, `videoUrl`, `selectedVideoVariant`, `videoCandidates`, `siteHint`, `title`, and quality preference fields). Do not manually rebuild this payload inline in `electron/main.mts`; use the shared `decodeQueueDownloadCommand` decoder so new fields are testable.
- `selectedVideoVariant` is explicit user intent from a grouped resource row. It is not equivalent to passive `videoCandidates[]` hints and must survive WebSocket -> decoder -> raw input schema validation.
- Extension `extensionData.ameowCapture` maps to the transport-neutral canonical `captureEvidence` through the shared `ameowCaptureEvidenceSchema` at the compatibility boundary; invalid evidence never reaches the Application command, and Sites read `input.captureEvidence` only.
- All terminal outcomes (success, typed failure, pending cancel, advanced-quality probe failure) serialize through the single `toDownloadResultPayload` mapper with stable keys (`file_path`, `error`, `failure` code/classification); pending cancellation is a typed `E_ABORTED` failure outcome.
- Managed runtime bootstrap invoked by `src/electron-runtime` must wait for the managed runtime install/check path to finish before returning a refreshed runtime dependency snapshot.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| `queue_video_download` receives a valid HTTP(S) URL | Normalize payload via `decodeQueueDownloadCommand` and call `runtime.queueDownload()` |
| `queue_video_download` receives a missing/invalid URL | Reject before queueing |
| `cancel_download` / `select_advanced_quality_option` receive missing, blank or wrong-type `traceId` / `optionId` | Reject before `DownloadApplicationApi` invocation |
| IPC request envelope is null, array, or has a missing/non-string/blank command | Throw `Invalid IPC request envelope` before any controller dispatch |
| WS root is null, array, or has a missing/non-string/blank action | Return the `Invalid request` failure envelope; non-blank unknown actions still get the `unknown_action` failed ack |
| `video_selected_v2` carries `clipStartSec` + `clipEndSec` | Forward both fields to the canonical command; runtime command planning later emits `--download-sections` for supported sites |
| `video_selected_v2` carries `extensionData.youtube` | Compatibility decoder maps transport containers to canonical fields; Sites never read the raw container |
| `extensionData.ameowCapture` is present and invalid | Runtime-validate against `ameowCaptureEvidenceSchema` and drop the evidence; the Application command never carries invalid evidence |
| `video_selected_v2` carries Weibo `selectedVideoVariant` | Forward the selected variant to runtime; Weibo provider routes the selected URL through a single `yt-dlp` plan and does not fall back to gallery-dl |
| `queue_pasted_video_download` extension resolution succeeds with a URL | Merge extension payload and enqueue through runtime |
| `queue_pasted_video_download` extension disconnected, times out, fails, or returns no URL | Log fallback and enqueue the original URL through runtime |
| `pasted_video_selection_result` missing `correlationRequestId` | Return failed WS ack with `missing_correlation_request_id` |
| `pasted_video_selection_result` has unknown correlation id | Return failed WS ack with `unknown_correlation_request` |
| App is quitting with pending pasted-video requests | Reject pending bridge promises and clear timers |
| Active runtime download is cancelled | Runtime emits terminal `video-download-complete` failure/cancel payload |
| New normal or advanced-quality membership is created | Its exact queue-detail snapshot carries `acceptedTraceId` for that trace |
| Existing advanced-quality trace is selected or deduped | Queue detail stays unmarked; no new membership is claimed |

### 5. Good / Base / Bad Cases

- Good: YouTube pasted URL asks the extension for page context, receives a resolved URL/metadata payload without cookies, and enqueues through `src/electron-runtime`.
- Good: YouTube/Bilibili injected player sends `video_selected_v2` with `clipStartSec`, `clipEndSec`, and `extensionData`; Electron bridge forwards those fields unchanged into `queue_video_download`.
- Good: A Weibo popup row with a selected `1080p` variant sends `selectedVideoVariant`, and backend failure text identifies the selected quality instead of silently downloading another quality.
- Good: Renderer and Extension commands share the same Application/runtime insertion path, so the one marked queue snapshot is transport-neutral.
- Base: Generic pasted URL has no extension-assisted site hint and enqueues directly through `src/electron-runtime`.
- Bad: `electron/main.mts` reconstructs a `queue_video_download` payload inline and omits a browser-originated field such as `clipStartSec`, causing downstream runtime code to choose the full-video path.
- Bad: Treating Weibo `selectedVideoVariant` as just another `videoCandidates[]` hint and allowing gallery-dl fallback to download a different quality.
- Bad: Reintroducing `activeVideoDownloads`, `pendingVideoDownloads`, `child_process.spawn("yt-dlp", ...)`, or `--progress-template` handling in `electron/main.mts`.
- Bad: Inferring acceptance from an unmarked full-snapshot delta, command timing, first progress, or a renderer callback.

### 6. Tests Required

- `electron/extensionRequestBridge.test.mts`: request broadcast, correlation resolution, unknown/missing correlation failure, timeout/shutdown cleanup.
- `electron/downloadIpcAdapter.test.mts`: download command dispatch with config quality precedence, pasted ports allowlist/resolution, required identifier rejection before Application invocation, selected variant preservation.
- `electron/downloadWsAdapter.test.mts`: `video_selected_v2` queue decode, quality alias sync, selected variant preservation, pasted/site-session correlation results, `unknown_action` failed acks, queue-ack-only.
- `src/protocol/download/ipcMappers.test.ts`: compatibility alias decoding, capture-evidence validation, full-chain `selectedVideoVariant` regression (wire -> decoder -> raw input schema), typed result/cancel mapping.
- `src/protocol/envelopes.test.ts`: IPC/WS envelope decoders (null/array/missing/non-string/blank command or action, valid envelope preservation).
- `src/electron-runtime/service.test.ts`, `src/utils/downloadViewHelpers.test.ts`, `src/features/download/client.test.ts`, and `src/features/download/useDownloadQueue.test.ts`: marked new membership, unmarked hydration/dedupe/existing selection, marker normalization, transport-neutral delivery, replay guard, and exact post-reduction publication.
- `src/sites/providers.test.ts`: Weibo `selectedVideoVariant` resolves to one `yt-dlp` engine plan with the selected URL and no gallery-dl fallback.
- `src/orchestration/download-orchestrator.test.ts`: explicit Weibo selected-variant failures include selected-quality wording.
- `electron/videoDownloadCommands.test.mts`: operational commands only (transcode, runtime dependency).
- Full pre-commit verification: `npm test`, `npm run type-check`, `npm run lint`, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
// electron/main.mts
pendingVideoDownloads.push(task);
spawn(ytdlpPath, ["--progress-template", "..."]);
```

#### Correct

```ts
// electron/main.mts
return getDownloadIpcAdapter().invoke("queue_video_download", payload);
```

For Intake causality, the runtime marks the snapshot it already owns:

```ts
await emitQueueState(newTraceId); // only immediately after new membership
```
