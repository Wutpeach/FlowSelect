mod native_i18n;

use regex::Regex;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::net::SocketAddr;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
use std::sync::Arc;
#[cfg(target_os = "macos")]
use std::time::Duration;

use tokio::sync::{broadcast, oneshot};

#[cfg(windows)]
use clipboard_win::{formats, get_clipboard};
use dirs::desktop_dir;
use native_i18n::{
    load_native_tray_labels, normalize_app_language, resolve_language_from_config_str,
    NativeTrayLabels, DESKTOP_LANGUAGE_CHANGED_EVENT, FALLBACK_LANGUAGE, WS_ACTION_GET_LANGUAGE,
    WS_ACTION_LANGUAGE_CHANGED, WS_ACTION_LANGUAGE_INFO,
};
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_shell::ShellExt;

const LEGACY_APP_IDENTIFIERS: &[&str] = &["com.flowselect.app"];
const YTDLP_LATEST_CACHE_FILE_NAME: &str = "ytdlp-latest-cache.json";
const YTDLP_LATEST_CACHE_TTL_MS: u128 = 60 * 60 * 1000;
const PINTEREST_SIDECAR_LOCK_JSON: &str = include_str!("../pinterest-sidecar/lock.json");

// Store current registered shortcut
struct RegisteredShortcut {
    current: Mutex<Option<Shortcut>>,
    last_trigger_ms: Mutex<u128>,
}

#[derive(Clone)]
struct TrayMenuItems {
    show: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

struct NativeTrayState {
    menu_items: Mutex<Option<TrayMenuItems>>,
}

// WebSocket Server state
struct WsServerState {
    shutdown_tx: Mutex<Option<broadcast::Sender<()>>>,
    is_running: Mutex<bool>,
    // Broadcast channel for sending messages to all connected clients
    broadcast_tx: Mutex<Option<broadcast::Sender<String>>>,
}

// WebSocket message types
#[derive(serde::Deserialize, Debug)]
struct WsMessage {
    action: String,
    data: Option<serde_json::Value>,
}

#[derive(serde::Serialize)]
struct WsResponse {
    success: bool,
    message: Option<String>,
    data: Option<serde_json::Value>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProtectedImageFallbackInput {
    token: String,
    page_url: Option<String>,
    image_url: Option<String>,
}

#[derive(Debug)]
struct ProtectedImageResolutionResult {
    success: bool,
    file_path: Option<String>,
    code: Option<String>,
    error: Option<String>,
}

fn resolve_current_app_language(app: &tauri::AppHandle) -> Result<&'static str, String> {
    let config_str = get_config(app.clone())?;
    Ok(resolve_language_from_config_str(&config_str).unwrap_or(FALLBACK_LANGUAGE))
}

fn load_current_native_tray_labels(app: &tauri::AppHandle) -> NativeTrayLabels {
    let language = resolve_current_app_language(app).unwrap_or(FALLBACK_LANGUAGE);
    load_native_tray_labels(app, language)
}

fn apply_tray_menu_labels(app: &tauri::AppHandle, labels: &NativeTrayLabels) -> Result<(), String> {
    let menu_items = {
        let state = app.state::<NativeTrayState>();
        let guard = state
            .menu_items
            .lock()
            .map_err(|_| "Failed to lock tray menu state".to_string())?;
        guard
            .clone()
            .ok_or_else(|| "Tray menu state is not initialized".to_string())?
    };

    menu_items
        .show
        .set_text(&labels.show_window)
        .map_err(|e| format!("Failed to update tray show label: {}", e))?;
    menu_items
        .settings
        .set_text(&labels.settings)
        .map_err(|e| format!("Failed to update tray settings label: {}", e))?;
    menu_items
        .quit
        .set_text(&labels.quit)
        .map_err(|e| format!("Failed to update tray quit label: {}", e))?;
    Ok(())
}

fn refresh_tray_menu_language(app: &tauri::AppHandle, language: &str) -> Result<(), String> {
    let labels = load_native_tray_labels(app, language);
    apply_tray_menu_labels(app, &labels)
}

fn broadcast_language_changed(app: &AppHandle, language: &str) -> Result<(), String> {
    let tx = {
        let state = app.state::<WsServerState>();
        let guard = state
            .broadcast_tx
            .lock()
            .map_err(|_| "Failed to lock WebSocket broadcast state".to_string())?;
        guard
            .as_ref()
            .cloned()
            .ok_or_else(|| "WebSocket server not running".to_string())?
    };

    let message = serde_json::json!({
        "action": WS_ACTION_LANGUAGE_CHANGED,
        "data": {
            "language": language
        }
    });
    tx.send(message.to_string())
        .map_err(|e| format!("Failed to broadcast language: {}", e))?;
    println!(">>> [WS] Broadcasted language: {}", language);
    Ok(())
}

fn notify_language_changed(app: &tauri::AppHandle, language: &str) {
    let normalized_language = normalize_app_language(Some(language)).unwrap_or(FALLBACK_LANGUAGE);

    if let Err(err) = refresh_tray_menu_language(app, normalized_language) {
        println!(
            ">>> [Rust] Failed to refresh tray labels for {}: {}",
            normalized_language, err
        );
    }

    if let Err(err) = app.emit(
        DESKTOP_LANGUAGE_CHANGED_EVENT,
        serde_json::json!({ "language": normalized_language }),
    ) {
        println!(
            ">>> [Rust] Failed to emit desktop language change for {}: {}",
            normalized_language, err
        );
    }

    if let Err(err) = broadcast_language_changed(app, normalized_language) {
        println!(
            ">>> [WS] Skipped language broadcast for {}: {}",
            normalized_language, err
        );
    }
}

fn extract_ws_request_id(data: &serde_json::Value) -> Option<String> {
    data.get("requestId")
        .or_else(|| data.get("request_id"))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
}

fn build_ws_request_data(
    request_id: &Option<String>,
    code: Option<&str>,
) -> Option<serde_json::Value> {
    request_id.as_ref().map(|rid| match code {
        Some(c) => serde_json::json!({
            "requestId": rid,
            "code": c
        }),
        None => serde_json::json!({
            "requestId": rid
        }),
    })
}

fn next_protected_image_ws_request_id() -> String {
    format!(
        "protected-image-{}",
        PROTECTED_IMAGE_WS_REQUEST_SEQ.fetch_add(1, Ordering::Relaxed)
    )
}

fn normalize_optional_http_url(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| {
            if value.starts_with("http://") || value.starts_with("https://") {
                Some(value.to_string())
            } else {
                None
            }
        })
}

fn normalize_optional_nonempty_string(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn broadcast_ws_action(
    app: &tauri::AppHandle,
    action: &str,
    data: serde_json::Value,
) -> Result<(), String> {
    let state = app.state::<WsServerState>();
    let broadcast_tx = state
        .broadcast_tx
        .lock()
        .map_err(|_| "Failed to lock WebSocket broadcast state".to_string())?;
    let tx = broadcast_tx
        .as_ref()
        .cloned()
        .ok_or_else(|| "WebSocket server not running".to_string())?;
    let msg = serde_json::json!({
        "action": action,
        "data": data,
    });
    tx.send(msg.to_string()).map_err(|_| {
        format!(
            "No connected browser extension client for action: {}",
            action
        )
    })?;
    println!(">>> [WS] Broadcasted action: {}", action);
    Ok(())
}

fn take_pending_protected_image_request(
    request_id: &str,
) -> Option<oneshot::Sender<ProtectedImageResolutionResult>> {
    WS_PENDING_PROTECTED_IMAGE_REQUESTS
        .lock()
        .ok()
        .and_then(|mut pending| pending.remove(request_id))
}

fn is_hotlink_like_image_download_error(error: &str) -> bool {
    let lowered = error.to_ascii_lowercase();
    lowered.contains("http error: 401")
        || lowered.contains("http error: 403")
        || lowered.contains("content-type: text/html")
        || lowered.contains("unexpected non-image response content-type: text/html")
}

#[derive(Clone, Debug)]
struct ExtensionVideoCandidate {
    url: String,
    candidate_type: Option<String>,
    source: Option<String>,
    confidence: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize)]
struct QueueVideoCandidateInput {
    url: String,
    #[serde(rename = "type")]
    candidate_type: Option<String>,
    source: Option<String>,
    confidence: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueuePinterestDragDiagnosticFlagsInput {
    has_video_tag: bool,
    has_video_list: bool,
    has_story_pin_data: bool,
    has_carousel_data: bool,
    has_mp4: bool,
    has_m3u8: bool,
    has_cmfv: bool,
    has_pinimg_video_host: bool,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueuePinterestDragDiagnosticInput {
    html_length: usize,
    html_preview: String,
    flags: QueuePinterestDragDiagnosticFlagsInput,
    image_url: Option<String>,
    video_url: Option<String>,
    video_candidates_count: usize,
}

#[derive(Clone, Copy)]
enum DirectPlatform {
    Douyin,
    Xiaohongshu,
}

impl DirectPlatform {
    fn as_str(self) -> &'static str {
        match self {
            Self::Douyin => "douyin",
            Self::Xiaohongshu => "xiaohongshu",
        }
    }
}

#[derive(Clone, Debug)]
struct SelectedDirectCandidate {
    url: String,
    origin: &'static str,
    candidate_type: Option<String>,
    source: Option<String>,
    confidence: Option<String>,
}

#[derive(Clone, Debug)]
struct ClipTimeRange {
    start_seconds: f64,
    end_seconds: f64,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct PinterestImageAsset {
    url: String,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct PinterestVideoAsset {
    url: String,
    width: Option<u32>,
    height: Option<u32>,
    #[serde(rename = "durationSeconds")]
    duration_seconds: Option<u64>,
    #[serde(rename = "posterUrl")]
    poster_url: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct PinterestResolvedMedia {
    #[serde(rename = "pinId")]
    pin_id: String,
    origin: String,
    title: Option<String>,
    image: PinterestImageAsset,
    video: Option<PinterestVideoAsset>,
}

#[derive(Clone, Debug, serde::Serialize)]
struct PinterestRuntimePayload {
    #[serde(rename = "traceId")]
    trace_id: String,
    #[serde(rename = "pageUrl")]
    page_url: String,
    #[serde(flatten)]
    media: PinterestResolvedMedia,
    #[serde(rename = "cookiesHeader", skip_serializing_if = "Option::is_none")]
    cookies_header: Option<String>,
    #[serde(rename = "outputDir")]
    output_dir: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum YtdlpQualityPreference {
    #[default]
    Best,
    Balanced,
    DataSaver,
}

impl YtdlpQualityPreference {
    fn parse_optional(value: Option<&str>) -> Option<Self> {
        match value {
            Some("best") => Some(Self::Best),
            Some("balanced") | Some("high") => Some(Self::Balanced),
            Some("data_saver") | Some("standard") => Some(Self::DataSaver),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Best => "best",
            Self::Balanced => "balanced",
            Self::DataSaver => "data_saver",
        }
    }

    fn format_selector(self) -> &'static str {
        match self {
            Self::Best => YTDLP_FORMAT_SELECTOR_BEST,
            Self::Balanced => YTDLP_FORMAT_SELECTOR_BALANCED,
            Self::DataSaver => YTDLP_FORMAT_SELECTOR_DATA_SAVER,
        }
    }

    fn merge_output_format(self) -> &'static str {
        match self {
            Self::Best => "mkv",
            Self::Balanced | Self::DataSaver => "mp4",
        }
    }

    fn format_sort(self) -> Option<&'static str> {
        match self {
            // Preserve highest resolution preference, but for ties at the same practical
            // tier prefer AE-friendlier codec/container combinations before broader fallbacks.
            Self::Best => Some("res,codec:h264,acodec:aac,ext"),
            Self::Balanced | Self::DataSaver => Some("ext:mp4:m4a"),
        }
    }

    fn slice_cache_extension(self) -> &'static str {
        match self {
            Self::Best => "mkv",
            Self::Balanced | Self::DataSaver => "mp4",
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct YtdlpInvocationPolicy {
    allow_youtube_cookie_retry: bool,
    allow_http_416_retry: bool,
    disable_resume_artifacts: bool,
}

#[derive(Clone, Debug)]
struct DirectCandidateCacheEntry {
    url: String,
    expires_at_ms: u128,
}

#[derive(Clone, Debug)]
struct SliceSourceCacheEntry {
    source_path: PathBuf,
    size_bytes: u64,
    last_used_at_ms: u128,
}

#[derive(Debug, Default, serde::Deserialize)]
struct MediaProbeStream {
    #[serde(default)]
    codec_type: String,
    codec_name: Option<String>,
}

#[derive(Debug, Default, serde::Deserialize)]
struct MediaProbeFormat {
    format_name: Option<String>,
}

#[derive(Debug, Default, serde::Deserialize)]
struct MediaProbeResult {
    #[serde(default)]
    streams: Vec<MediaProbeStream>,
    format: Option<MediaProbeFormat>,
}

#[derive(Clone, Debug)]
struct MediaProbeSummary {
    container_names: Vec<String>,
    has_video_stream: bool,
    has_audio_stream: bool,
    video_codec: Option<String>,
    audio_codec: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AeSafeNormalizationPlan {
    Skip,
    RemuxOnly,
    AudioTranscode,
    FullTranscode,
}

impl AeSafeNormalizationPlan {
    fn as_str(self) -> &'static str {
        match self {
            Self::Skip => "skip",
            Self::RemuxOnly => "remux_only",
            Self::AudioTranscode => "audio_transcode",
            Self::FullTranscode => "full_transcode",
        }
    }

    fn status_text(self) -> &'static str {
        match self {
            Self::Skip => "Final output already AE-safe",
            Self::RemuxOnly => "Finalizing AE-safe MP4...",
            Self::AudioTranscode => "Converting audio for After Effects...",
            Self::FullTranscode => "Optimizing video for After Effects...",
        }
    }
}

impl MediaProbeSummary {
    fn is_mp4_container(&self) -> bool {
        self.container_names.iter().any(|name| name == "mp4")
    }

    fn is_ae_safe(&self) -> bool {
        self.is_mp4_container()
            && self.video_codec.as_deref() == Some("h264")
            && (!self.has_audio_stream || self.audio_codec.as_deref() == Some("aac"))
    }

    fn normalization_plan(&self) -> AeSafeNormalizationPlan {
        if self.is_ae_safe() {
            return AeSafeNormalizationPlan::Skip;
        }

        if self.video_codec.as_deref() == Some("h264") {
            if !self.has_audio_stream || self.audio_codec.as_deref() == Some("aac") {
                return AeSafeNormalizationPlan::RemuxOnly;
            }
            return AeSafeNormalizationPlan::AudioTranscode;
        }

        AeSafeNormalizationPlan::FullTranscode
    }
}

#[derive(Clone, Debug)]
enum QueuedVideoTask {
    Douyin {
        page_url: String,
        title: Option<String>,
        cookies_header: Option<String>,
        cookies_path: Option<PathBuf>,
        direct_candidates: Vec<SelectedDirectCandidate>,
        ytdlp_quality: YtdlpQualityPreference,
        ae_friendly_conversion_enabled: bool,
        trace_id: String,
    },
    Xiaohongshu {
        page_url: String,
        title: Option<String>,
        cookies_header: Option<String>,
        cookies_path: Option<PathBuf>,
        direct_candidates: Vec<SelectedDirectCandidate>,
        ytdlp_quality: YtdlpQualityPreference,
        ae_friendly_conversion_enabled: bool,
        trace_id: String,
    },
    Pinterest {
        page_url: String,
        title: Option<String>,
        cookies_header: Option<String>,
        cookies_path: Option<PathBuf>,
        video_url_hint: Option<String>,
        video_candidates: Vec<ExtensionVideoCandidate>,
        trace_id: String,
    },
    Smart {
        url: String,
        title: Option<String>,
        cookies_path: Option<PathBuf>,
        clip_range: Option<ClipTimeRange>,
        ytdlp_quality: YtdlpQualityPreference,
        ae_friendly_conversion_enabled: bool,
        trace_id: String,
    },
}

impl QueuedVideoTask {
    fn trace_id(&self) -> &str {
        match self {
            Self::Douyin { trace_id, .. }
            | Self::Xiaohongshu { trace_id, .. }
            | Self::Pinterest { trace_id, .. }
            | Self::Smart { trace_id, .. } => trace_id,
        }
    }

    fn label(&self) -> String {
        let raw = match self {
            Self::Douyin {
                title, page_url, ..
            }
            | Self::Xiaohongshu {
                title, page_url, ..
            }
            | Self::Pinterest {
                title, page_url, ..
            } => title
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(page_url.as_str()),
            Self::Smart { title, url, .. } => title
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(url.as_str()),
        };

        let trimmed = raw.trim();
        if trimmed.is_empty() {
            self.trace_id().to_string()
        } else {
            trimmed.to_string()
        }
    }
}

#[derive(Default)]
struct VideoTaskQueueState {
    pending: VecDeque<QueuedVideoTask>,
    active: VecDeque<QueuedVideoTask>,
    active_trace_ids: HashSet<String>,
    pump_scheduled: bool,
}

#[derive(Default)]
struct RuntimeProgressLogState {
    last_stage: Option<&'static str>,
    last_percent_bucket: Option<i32>,
    last_logged_at_ms: u128,
}

// Store active yt-dlp child PIDs by trace id.
static DOWNLOAD_CHILDREN: LazyLock<Mutex<HashMap<String, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// Cancellation markers for active downloads keyed by trace id.
static DOWNLOAD_CANCELLED: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
// Incremental sequence for download trace ids.
static DOWNLOAD_TRACE_SEQ: AtomicU64 = AtomicU64::new(1);
static PROTECTED_IMAGE_WS_REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);
static DIRECT_CANDIDATE_CACHE: LazyLock<Mutex<HashMap<String, DirectCandidateCacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static WS_PENDING_PROTECTED_IMAGE_REQUESTS: LazyLock<
    Mutex<HashMap<String, oneshot::Sender<ProtectedImageResolutionResult>>>,
> = LazyLock::new(|| Mutex::new(HashMap::new()));
static VIDEO_TASK_QUEUE_STATE: LazyLock<Mutex<VideoTaskQueueState>> =
    LazyLock::new(|| Mutex::new(VideoTaskQueueState::default()));
static SLICE_SOURCE_CACHE: LazyLock<Mutex<HashMap<String, SliceSourceCacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static SLICE_REQUEST_HISTORY: LazyLock<Mutex<HashMap<String, u128>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static PRECISE_CLIP_HW_ENCODER_CACHE: LazyLock<Mutex<Option<Option<String>>>> =
    LazyLock::new(|| Mutex::new(None));
static RUNTIME_LOG_DIR: LazyLock<Mutex<Option<PathBuf>>> = LazyLock::new(|| Mutex::new(None));
static RUNTIME_LOG_WRITE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static RUNTIME_LOG_PROGRESS_STATE: LazyLock<Mutex<HashMap<String, RuntimeProgressLogState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
const MAX_CONCURRENT_VIDEO_DOWNLOADS: usize = 3;
const DIRECT_CANDIDATE_CACHE_TTL_MS: u128 = 5 * 60 * 1000;
const DIRECT_CANDIDATE_CACHE_MAX_ENTRIES: usize = 256;
const SLICE_SOURCE_CACHE_TRIGGER_WINDOW_MS: u128 = 8 * 60 * 1000;
const SLICE_SOURCE_CACHE_TTL_MS: u128 = 30 * 60 * 1000;
const SLICE_SOURCE_CACHE_SIZE_CAP_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const SLICE_SOURCE_CACHE_MAX_ENTRIES: usize = 12;
const SLICE_SOURCE_CACHE_MIN_VALID_BYTES: u64 = 2 * 1024 * 1024;
const SLICE_SOURCE_CACHE_DIR_NAME: &str = "flowselect-slice-cache";
const YTDLP_HARD_HEARTBEAT_TIMEOUT_SECS: u64 = 90;
const YTDLP_SOFT_HEARTBEAT_GRACE_SECS: u64 = 20;
const YTDLP_WATCHDOG_TICK_MILLIS: u64 = 1500;
const YTDLP_TERMINATION_GRACE_MILLIS: u64 = 2500;
const PINTEREST_RUNTIME_STALL_TIMEOUT_SECS: u64 = 60;
const YTDLP_TEMP_DIR_NAME: &str = "flowselect-ytdlp-temp";
const RUNTIME_LOG_FILE_NAME: &str = "runtime.log";
const RUNTIME_LOG_ROTATED_FILE_NAME: &str = "runtime.log.1";
const RUNTIME_LOG_MAX_BYTES: u64 = 512 * 1024;
const RUNTIME_LOG_PROGRESS_BUCKET_PERCENT: f32 = 5.0;
const RUNTIME_LOG_PROGRESS_MIN_INTERVAL_MS: u128 = 1500;
const SUPPORT_LOG_RUNTIME_EVIDENCE_LINE_LIMIT: usize = 24;
const SUPPORT_LOG_TEXT_PREVIEW_LIMIT: usize = 220;
const PROTECTED_IMAGE_FALLBACK_TIMEOUT_MS: u64 = 15_000;
// `best` should follow the highest tier available to the current account, even when
// that requires mixed containers/codecs. We merge to mkv in that tier so yt-dlp can
// keep 1440p/2160p streams instead of collapsing to MP4-compatible 1080p.
const YTDLP_FORMAT_SELECTOR_BEST: &str = "bestvideo*+bestaudio/best";
const YTDLP_FORMAT_SELECTOR_BALANCED: &str = concat!(
    "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
    "bv*[height=1080][ext=mp4]+ba[ext=m4a]/",
    "b[height=1080][vcodec^=avc1][ext=mp4]/",
    "b[height=1080][ext=mp4]/",
    "best[height=1080][ext=mp4]/",
    "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
    "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/",
    "b[height<=1080][vcodec^=avc1][ext=mp4]/",
    "b[height<=1080][ext=mp4]/",
    "best[height<=1080][ext=mp4]/",
    "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
    "bv*[ext=mp4]+ba[ext=m4a]/",
    "b[vcodec^=avc1][ext=mp4]/",
    "b[ext=mp4]/",
    "best[ext=mp4]/",
    "best"
);
const YTDLP_FORMAT_SELECTOR_DATA_SAVER: &str = concat!(
    "bv*[height=360][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
    "bv*[height=360][ext=mp4]+ba[ext=m4a]/",
    "b[height=360][vcodec^=avc1][ext=mp4]/",
    "b[height=360][ext=mp4]/",
    "best[height=360][ext=mp4]/",
    "bv*[height<360][ext=mp4]+ba[ext=m4a]/",
    "b[height<360][ext=mp4]/",
    "best[height<360][ext=mp4]/",
    "worstvideo[ext=mp4]+ba[ext=m4a]/",
    "worst[ext=mp4]/",
    "worst"
);
const DEFAULT_VIDEO_DOWNLOAD_QUALITY_CONFIG_KEY: &str = "defaultVideoDownloadQuality";
const LEGACY_VIDEO_DOWNLOAD_QUALITY_CONFIG_KEY: &str = "ytdlpQualityPreference";
const AE_FRIENDLY_CONVERSION_CONFIG_KEY: &str = "aeFriendlyConversionEnabled";
const RENAME_SEQUENCE_COUNTERS_KEY: &str = "renameSequenceCounters";
const RENAME_RULE_PRESET_KEY: &str = "renameRulePreset";
const RENAME_PREFIX_KEY: &str = "renamePrefix";
const RENAME_SUFFIX_KEY: &str = "renameSuffix";
const MAIN_WINDOW_WIDTH: f64 = 200.0;
const MAIN_WINDOW_HEIGHT: f64 = 200.0;
const SETTINGS_WINDOW_WIDTH: f64 = 320.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 400.0;
const SETTINGS_WINDOW_GAP: f64 = 16.0;
const WINDOW_EDGE_PADDING: f64 = 8.0;
const SHORTCUT_CURSOR_DIAGONAL_OFFSET: f64 = 50.0;
const SHORTCUT_TOGGLE_COOLDOWN_MS: u128 = 420;

#[derive(Clone, Copy, Debug)]
enum RenameRulePreset {
    DescNumber,
    AscNumber,
    PrefixNumber,
}

impl RenameRulePreset {
    fn from_config(config: &serde_json::Value) -> Self {
        match config
            .get(RENAME_RULE_PRESET_KEY)
            .and_then(|value| value.as_str())
            .unwrap_or("desc_number")
        {
            "asc_number" => Self::AscNumber,
            "prefix_number" => Self::PrefixNumber,
            _ => Self::DescNumber,
        }
    }

    fn as_counter_key(self) -> &'static str {
        match self {
            Self::DescNumber => "desc_number",
            Self::AscNumber => "asc_number",
            Self::PrefixNumber => "prefix_number",
        }
    }
}

#[derive(Clone, Debug)]
struct RenameRuleConfig {
    preset: RenameRulePreset,
    prefix: String,
    suffix: String,
}

fn keep_window_off_taskbar(_window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        let _ = _window.set_skip_taskbar(true);
    }
}

fn resolve_settings_window_position_near_main(app: &AppHandle) -> Option<(f64, f64)> {
    let main_window = app.get_webview_window("main")?;
    let scale_factor = main_window.scale_factor().ok()?;

    let main_position = main_window
        .outer_position()
        .ok()?
        .to_logical::<f64>(scale_factor);
    let main_size = main_window
        .outer_size()
        .ok()?
        .to_logical::<f64>(scale_factor);
    let monitor = main_window.current_monitor().ok().flatten()?;
    let monitor_position = monitor.position().to_logical::<f64>(scale_factor);
    let monitor_size = monitor.size().to_logical::<f64>(scale_factor);

    let mut x = main_position.x + main_size.width + SETTINGS_WINDOW_GAP;
    let mut y = main_position.y;

    let min_x = monitor_position.x + WINDOW_EDGE_PADDING;
    let min_y = monitor_position.y + WINDOW_EDGE_PADDING;
    let max_x =
        monitor_position.x + monitor_size.width - SETTINGS_WINDOW_WIDTH - WINDOW_EDGE_PADDING;
    let max_y =
        monitor_position.y + monitor_size.height - SETTINGS_WINDOW_HEIGHT - WINDOW_EDGE_PADDING;

    if x > max_x {
        x = main_position.x - SETTINGS_WINDOW_WIDTH - SETTINGS_WINDOW_GAP;
    }

    x = x.clamp(min_x, max_x.max(min_x));
    y = y.clamp(min_y, max_y.max(min_y));

    Some((x, y))
}

fn resolve_main_window_position_near_cursor(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
) -> Option<(i32, i32)> {
    let cursor_position = app
        .cursor_position()
        .ok()
        .or_else(|| window.cursor_position().ok())?;
    let monitor = app
        .available_monitors()
        .ok()
        .and_then(|monitors| {
            monitors.into_iter().find(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                let left = f64::from(position.x);
                let top = f64::from(position.y);
                let right = left + f64::from(size.width);
                let bottom = top + f64::from(size.height);
                cursor_position.x >= left
                    && cursor_position.x <= right
                    && cursor_position.y >= top
                    && cursor_position.y <= bottom
            })
        })
        .or_else(|| {
            app.monitor_from_point(cursor_position.x, cursor_position.y)
                .ok()
                .flatten()
        })
        .or_else(|| {
            window
                .monitor_from_point(cursor_position.x, cursor_position.y)
                .ok()
                .flatten()
        })
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten())?;
    let monitor_scale = monitor.scale_factor();
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let main_width_px = MAIN_WINDOW_WIDTH * monitor_scale;
    let main_height_px = MAIN_WINDOW_HEIGHT * monitor_scale;
    let axis_offset_px =
        (SHORTCUT_CURSOR_DIAGONAL_OFFSET * monitor_scale) / std::f64::consts::SQRT_2;

    let preferred_x = cursor_position.x - main_width_px - axis_offset_px;
    let preferred_y = cursor_position.y - axis_offset_px;

    let min_x = f64::from(monitor_position.x) + WINDOW_EDGE_PADDING * monitor_scale;
    let min_y = f64::from(monitor_position.y) + WINDOW_EDGE_PADDING * monitor_scale;
    let max_x = f64::from(monitor_position.x) + f64::from(monitor_size.width)
        - main_width_px
        - WINDOW_EDGE_PADDING * monitor_scale;
    let max_y = f64::from(monitor_position.y) + f64::from(monitor_size.height)
        - main_height_px
        - WINDOW_EDGE_PADDING * monitor_scale;

    let clamped_x = preferred_x.clamp(min_x, max_x.max(min_x));
    let clamped_y = preferred_y.clamp(min_y, max_y.max(min_y));

    #[cfg(target_os = "windows")]
    println!(
        ">>> [Rust] shortcut-position cursor=({:.2}, {:.2}) monitor=({}, {} {}x{} @ {:.2}) preferred=({:.2}, {:.2}) clamped=({:.2}, {:.2})",
        cursor_position.x,
        cursor_position.y,
        monitor_position.x,
        monitor_position.y,
        monitor_size.width,
        monitor_size.height,
        monitor_scale,
        preferred_x,
        preferred_y,
        clamped_x,
        clamped_y
    );

    Some((clamped_x.round() as i32, clamped_y.round() as i32))
}

fn is_cursor_inside_window(window: &tauri::WebviewWindow, cursor_x: f64, cursor_y: f64) -> bool {
    let Ok(position) = window.outer_position() else {
        return false;
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };

    let left = f64::from(position.x);
    let top = f64::from(position.y);
    let right = left + f64::from(size.width);
    let bottom = top + f64::from(size.height);

    cursor_x >= left && cursor_x <= right && cursor_y >= top && cursor_y <= bottom
}

fn show_main_window(app: &AppHandle, position: Option<(i32, i32)>) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(ActivationPolicy::Accessory);
        let _ = app.set_dock_visibility(false);
    }

    if let Some(window) = app.get_webview_window("main") {
        if let Some((x, y)) = position {
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        keep_window_off_taskbar(&window);
        let _ = app.emit("shortcut-show", ());
    }
}

#[cfg(target_os = "macos")]
struct HoverActivationState {
    was_inside: bool,
    last_activate_ms: u128,
}

#[cfg(target_os = "macos")]
fn start_macos_hover_activation_monitor(app_handle: AppHandle) {
    const HOVER_CHECK_INTERVAL_MS: u64 = 80;
    const HOVER_ACTIVATE_COOLDOWN_MS: u128 = 600;

    std::thread::spawn(move || {
        println!(">>> [Rust] Starting mac hover activation monitor");
        println!(">>> [Rust] mac hover activation uses cursor polling");

        let state = Arc::new(Mutex::new(HoverActivationState {
            was_inside: false,
            last_activate_ms: 0,
        }));
        let mut dispatch_error_logged = false;

        loop {
            let app_for_main_thread = app_handle.clone();
            let state_for_main_thread = Arc::clone(&state);
            let dispatch_result = app_handle.run_on_main_thread(move || {
                let mut hover_state = match state_for_main_thread.lock() {
                    Ok(state_guard) => state_guard,
                    Err(_) => return,
                };

                let Some(window) = app_for_main_thread.get_webview_window("main") else {
                    hover_state.was_inside = false;
                    return;
                };

                if !window.is_visible().unwrap_or(false) {
                    hover_state.was_inside = false;
                    return;
                }

                let Ok(position) = window.outer_position() else {
                    hover_state.was_inside = false;
                    return;
                };
                let Ok(size) = window.outer_size() else {
                    hover_state.was_inside = false;
                    return;
                };
                let Ok(cursor_position) = window.cursor_position() else {
                    hover_state.was_inside = false;
                    return;
                };

                let left = f64::from(position.x);
                let top = f64::from(position.y);
                let right = left + f64::from(size.width);
                let bottom = top + f64::from(size.height);
                let is_inside = cursor_position.x >= left
                    && cursor_position.x <= right
                    && cursor_position.y >= top
                    && cursor_position.y <= bottom;

                if is_inside && !hover_state.was_inside {
                    let is_focused = window.is_focused().unwrap_or(false);
                    let now_ms = now_timestamp_ms();
                    let can_activate = now_ms.saturating_sub(hover_state.last_activate_ms)
                        >= HOVER_ACTIVATE_COOLDOWN_MS;

                    if !is_focused && can_activate {
                        show_main_window(&app_for_main_thread, None);
                        hover_state.last_activate_ms = now_ms;
                    }
                }

                hover_state.was_inside = is_inside;
            });

            if let Err(err) = dispatch_result {
                if !dispatch_error_logged {
                    dispatch_error_logged = true;
                    println!(
                        ">>> [Rust] mac hover monitor main-thread dispatch failed: {}",
                        err
                    );
                }
            }
            std::thread::sleep(Duration::from_millis(HOVER_CHECK_INTERVAL_MS));
        }
    });
}

/// 获取 Deno JS 运行时的路径
fn executable_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|dir| dir.to_path_buf()))
}

fn binary_candidate_paths(app: &AppHandle, file_name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(debug_assertions) {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        candidates.push(manifest_dir.join("binaries").join(file_name));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join(file_name));
    }

    if let Some(exe_dir) = executable_dir() {
        candidates.push(exe_dir.join("binaries").join(file_name));
    }

    candidates
}

fn get_deno_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let exe_name = "deno.exe";
    #[cfg(not(target_os = "windows"))]
    let exe_name = "deno";

    let candidates = binary_candidate_paths(app, exe_name);
    if let Some(path) = candidates.iter().find(|path| path.exists()) {
        return Ok(path.clone());
    }

    candidates
        .into_iter()
        .next()
        .ok_or_else(|| "Failed to resolve deno runtime path candidates".to_string())
}

fn pinterest_downloader_binary_filename() -> Result<&'static str, String> {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Ok("pinterest-dl-x86_64-pc-windows-msvc.exe")
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok("pinterest-dl-aarch64-apple-darwin")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Ok("pinterest-dl-x86_64-apple-darwin")
    } else {
        Err(format!(
            "Unsupported platform for Pinterest downloader: {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        ))
    }
}

fn pinterest_downloader_binary_path(app: &AppHandle) -> Result<PathBuf, String> {
    let file_name = pinterest_downloader_binary_filename()?;
    let candidates = binary_candidate_paths(app, file_name);
    if let Some(path) = candidates.iter().find(|path| path.exists()) {
        println!(
            ">>> [Rust] Using bundled Pinterest downloader from: {:?}",
            path
        );
        return Ok(path.clone());
    }

    candidates.into_iter().next().ok_or_else(|| {
        format!(
            "Failed to resolve Pinterest downloader path for {}",
            file_name
        )
    })
}

#[cfg(target_os = "windows")]
fn ffmpeg_executable_name() -> &'static str {
    "ffmpeg.exe"
}

#[cfg(not(target_os = "windows"))]
fn ffmpeg_executable_name() -> &'static str {
    "ffmpeg"
}

fn resolve_binary_from_env_path(file_name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|raw_path| {
        std::env::split_paths(&raw_path)
            .map(|dir| dir.join(file_name))
            .find(|path| path.exists())
    })
}

fn ffmpeg_binary_path(app: &AppHandle) -> Result<PathBuf, String> {
    let file_name = ffmpeg_executable_name();
    let candidates = binary_candidate_paths(app, file_name);
    if let Some(path) = candidates.iter().find(|path| path.exists()) {
        println!(">>> [Rust] Using bundled ffmpeg from: {:?}", path);
        return Ok(path.clone());
    }

    if let Some(path) = resolve_binary_from_env_path(file_name) {
        println!(">>> [Rust] Using system ffmpeg from PATH: {:?}", path);
        return Ok(path);
    }

    Err(format!(
        "Failed to resolve ffmpeg runtime. Looked for {:?} in bundled candidates {:?} and system PATH",
        file_name, candidates
    ))
}

fn ffmpeg_location_for_ytdlp(app: &AppHandle) -> Result<String, String> {
    let ffmpeg_path = ffmpeg_binary_path(app)?;
    let parent = ffmpeg_path.parent().ok_or_else(|| {
        format!(
            "Resolved ffmpeg path has no parent directory: {:?}",
            ffmpeg_path
        )
    })?;
    Ok(parent.to_string_lossy().to_string())
}

fn build_env_path_with_deno(app: &AppHandle) -> String {
    let mut env_path = std::env::var("PATH").unwrap_or_default();
    if let Ok(deno_path) = get_deno_path(app) {
        if let Some(deno_dir) = deno_path.parent() {
            if deno_path.exists() {
                #[cfg(target_os = "windows")]
                let separator = ";";
                #[cfg(not(target_os = "windows"))]
                let separator = ":";
                env_path = format!("{}{}{}", deno_dir.to_string_lossy(), separator, env_path);
                println!(">>> [Rust] Added Deno to PATH: {:?}", deno_dir);
            }
        }
    }
    env_path
}

fn build_env_path_with_ffmpeg(app: &AppHandle) -> String {
    let mut env_path = std::env::var("PATH").unwrap_or_default();

    if let Ok(ffmpeg_path) = ffmpeg_binary_path(app) {
        if let Some(ffmpeg_dir) = ffmpeg_path.parent() {
            #[cfg(target_os = "windows")]
            let separator = ";";
            #[cfg(not(target_os = "windows"))]
            let separator = ":";
            env_path = format!("{}{}{}", ffmpeg_dir.to_string_lossy(), separator, env_path);
            println!(
                ">>> [Rust] Added ffmpeg to PATH for Pinterest downloader: {:?}",
                ffmpeg_dir
            );
        }
    }

    env_path
}

#[tauri::command]
fn get_clipboard_files() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        let file_list: Vec<String> = get_clipboard(formats::FileList)
            .map_err(|e| format!("Failed to read clipboard: {}", e))?;
        return Ok(file_list);
    }

    #[cfg(not(windows))]
    {
        Err("Clipboard file list is currently supported on Windows only".to_string())
    }
}

#[tauri::command]
fn list_files(path: String) -> Result<Vec<String>, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let entries = fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let files: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();

    Ok(files)
}

/// 获取下一个可用的序号（从99倒序到1）
fn get_next_sequence_number(target_dir: &Path) -> Result<u32, String> {
    let mut used_numbers: std::collections::HashSet<u32> = std::collections::HashSet::new();

    if target_dir.exists() {
        let entries =
            fs::read_dir(target_dir).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Some(stem) = path.file_stem() {
                    if let Some(stem_str) = stem.to_str() {
                        // 只匹配纯数字文件名
                        if let Ok(num) = stem_str.parse::<u32>() {
                            if num >= 1 && num <= 99 {
                                used_numbers.insert(num);
                            }
                        }
                    }
                }
            }
        }
    }

    // 从99倒序查找未使用的数字
    for num in (1..=99).rev() {
        if !used_numbers.contains(&num) {
            return Ok(num);
        }
    }

    Err("序号已用完，请整理文件夹".to_string())
}

fn is_stem_in_use(target_dir: &Path, target_stem: &str) -> Result<bool, String> {
    if !target_dir.exists() {
        return Ok(false);
    }

    let entries =
        fs::read_dir(target_dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if stem == target_stem {
            return Ok(true);
        }
    }

    Ok(false)
}

fn clear_rename_sequence_counters(config: &mut serde_json::Value) -> Result<(), String> {
    let config_obj = config
        .as_object_mut()
        .ok_or("Config should be a JSON object".to_string())?;
    config_obj.insert(
        RENAME_SEQUENCE_COUNTERS_KEY.to_string(),
        serde_json::Value::Object(serde_json::Map::new()),
    );
    Ok(())
}

fn get_rename_rule_config(config: &serde_json::Value) -> RenameRuleConfig {
    let preset = RenameRulePreset::from_config(config);
    let prefix = config
        .get(RENAME_PREFIX_KEY)
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let suffix = config
        .get(RENAME_SUFFIX_KEY)
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();

    RenameRuleConfig {
        preset,
        prefix,
        suffix,
    }
}

fn sanitize_rename_affix(raw: &str) -> String {
    sanitize_file_stem(raw)
}

fn build_rename_stem(number: u32, rule: &RenameRuleConfig) -> String {
    let mut parts = Vec::new();

    if matches!(rule.preset, RenameRulePreset::PrefixNumber) {
        let safe_prefix = sanitize_rename_affix(&rule.prefix);
        if !safe_prefix.is_empty() {
            parts.push(safe_prefix);
        }
    }

    parts.push(number.to_string());

    let safe_suffix = sanitize_rename_affix(&rule.suffix);
    if !safe_suffix.is_empty() {
        parts.push(safe_suffix);
    }

    parts.join("_")
}

fn get_next_rename_sequence_stem(
    app: &tauri::AppHandle,
    config: &mut serde_json::Value,
    target_dir: &Path,
) -> Result<String, String> {
    let rule = get_rename_rule_config(config);
    let key = format!(
        "{}::{}",
        target_dir.to_string_lossy(),
        rule.preset.as_counter_key()
    );
    let current_counter = config
        .get(RENAME_SEQUENCE_COUNTERS_KEY)
        .and_then(|value| value.as_object())
        .and_then(|counter_map| counter_map.get(&key))
        .and_then(|value| value.as_u64())
        .and_then(|value| u32::try_from(value).ok());

    let mut candidate = match rule.preset {
        RenameRulePreset::DescNumber | RenameRulePreset::PrefixNumber => current_counter
            .map(|value| value.saturating_sub(1))
            .unwrap_or(99),
        RenameRulePreset::AscNumber => current_counter
            .map(|value| value.saturating_add(1))
            .unwrap_or(1),
    };

    loop {
        if candidate == 0 {
            return Err("序号已用完，请整理文件夹".to_string());
        }

        let candidate_stem = build_rename_stem(candidate, &rule);
        if !candidate_stem.is_empty() && !is_stem_in_use(target_dir, &candidate_stem)? {
            let config_obj = config
                .as_object_mut()
                .ok_or("Config should be a JSON object".to_string())?;
            let counter_entry = config_obj
                .entry(RENAME_SEQUENCE_COUNTERS_KEY.to_string())
                .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
            if !counter_entry.is_object() {
                *counter_entry = serde_json::Value::Object(serde_json::Map::new());
            }

            let counter_map = counter_entry
                .as_object_mut()
                .ok_or("Rename counter map should be an object".to_string())?;
            counter_map.insert(key, serde_json::Value::from(candidate));

            let config_json = serde_json::to_string(config)
                .map_err(|e| format!("Failed to serialize config: {}", e))?;
            save_config(app.clone(), config_json)?;

            return Ok(candidate_stem);
        }

        candidate = match rule.preset {
            RenameRulePreset::DescNumber | RenameRulePreset::PrefixNumber => {
                candidate.saturating_sub(1)
            }
            RenameRulePreset::AscNumber => {
                if candidate == u32::MAX {
                    return Err("Rename counter overflow".to_string());
                }
                candidate.saturating_add(1)
            }
        };
    }
}

fn is_rename_media_enabled(config: &serde_json::Value) -> bool {
    if let Some(rename_media) = config
        .get("renameMediaOnDownload")
        .and_then(|v| v.as_bool())
    {
        return rename_media;
    }

    config
        .get("videoKeepOriginalName")
        .and_then(|v| v.as_bool())
        .map(|keep_original| !keep_original)
        .unwrap_or(false)
}

fn sanitize_file_stem(raw: &str) -> String {
    let cleaned = raw
        .trim()
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
        .replace(['\n', '\r', '\t'], " ");

    let limited: String = cleaned.chars().take(100).collect();
    limited
        .trim_matches(|ch: char| ch == '.' || ch.is_whitespace())
        .to_string()
}

fn sanitize_file_extension(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('.')
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(10)
        .collect::<String>()
        .to_ascii_lowercase()
}

fn build_sequence_file_path(target_dir: &Path, ext: &str) -> Result<PathBuf, String> {
    let sequence = get_next_sequence_number(target_dir)?;
    let safe_ext = sanitize_file_extension(ext);
    let final_ext = if safe_ext.is_empty() {
        "bin".to_string()
    } else {
        safe_ext
    };
    Ok(target_dir.join(format!("{}.{}", sequence, final_ext)))
}

fn build_rename_sequence_file_path(
    app: &tauri::AppHandle,
    config: &mut serde_json::Value,
    target_dir: &Path,
    ext: &str,
) -> Result<PathBuf, String> {
    let rename_stem = get_next_rename_sequence_stem(app, config, target_dir)?;
    let safe_ext = sanitize_file_extension(ext);
    let final_ext = if safe_ext.is_empty() {
        "bin".to_string()
    } else {
        safe_ext
    };
    Ok(target_dir.join(format!("{}.{}", rename_stem, final_ext)))
}

fn build_source_name_file_path(
    target_dir: &Path,
    source_name: &str,
    fallback_ext: &str,
) -> Option<PathBuf> {
    let file_name = Path::new(source_name).file_name()?.to_str()?.trim();
    if file_name.is_empty() {
        return None;
    }

    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|v| v.to_str())
        .map(sanitize_file_stem)?;
    if stem.is_empty() {
        return None;
    }

    let source_ext = path
        .extension()
        .and_then(|v| v.to_str())
        .map(sanitize_file_extension)
        .unwrap_or_default();
    let ext = if source_ext.is_empty() {
        sanitize_file_extension(fallback_ext)
    } else {
        source_ext
    };

    if ext.is_empty() {
        return None;
    }

    let preferred = target_dir.join(format!("{}.{}", stem, ext));
    if !preferred.exists() {
        return Some(preferred);
    }

    let sequence = get_next_sequence_number(target_dir).ok()?;
    Some(target_dir.join(format!("{}_{}.{}", stem, sequence, ext)))
}

fn clip_seconds_to_millis(seconds: f64) -> u64 {
    if !seconds.is_finite() {
        return 0;
    }
    if seconds <= 0.0 {
        return 0;
    }
    (seconds * 1000.0).round() as u64
}

fn build_clip_range_ms_prefix(clip_range: &ClipTimeRange) -> String {
    let start_ms = clip_seconds_to_millis(clip_range.start_seconds);
    let end_ms = clip_seconds_to_millis(clip_range.end_seconds);
    format!("{}-{}", start_ms, end_ms)
}

fn build_clip_title_file_path(
    target_dir: &Path,
    clip_range: &ClipTimeRange,
    title: Option<&str>,
    ext: &str,
) -> Result<PathBuf, String> {
    let prefix = build_clip_range_ms_prefix(clip_range);
    let safe_title = title
        .map(sanitize_file_stem)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "video".to_string());
    let base_stem = format!("{}_{}", prefix, safe_title);

    let safe_ext = sanitize_file_extension(ext);
    let final_ext = if safe_ext.is_empty() {
        "bin".to_string()
    } else {
        safe_ext
    };

    let preferred = target_dir.join(format!("{}.{}", base_stem, final_ext));
    if !preferred.exists() {
        return Ok(preferred);
    }

    let mut suffix: u32 = 2;
    loop {
        let candidate_stem = format!("{}_{}", base_stem, suffix);
        if !is_stem_in_use(target_dir, &candidate_stem)? {
            return Ok(target_dir.join(format!("{}.{}", candidate_stem, final_ext)));
        }
        suffix = suffix.saturating_add(1);
        if suffix == u32::MAX {
            return Err("Failed to build unique clip filename".to_string());
        }
    }
}

fn extract_filename_from_content_disposition(content_disposition: &str) -> Option<String> {
    for part in content_disposition.split(';').map(str::trim) {
        let lowered = part.to_ascii_lowercase();
        if lowered.starts_with("filename*=") {
            let value = part.split_once('=')?.1.trim().trim_matches('"');
            let normalized = value
                .split_once("''")
                .map(|(_, encoded)| encoded)
                .unwrap_or(value);
            if !normalized.is_empty() {
                return Some(normalized.to_string());
            }
        } else if lowered.starts_with("filename=") {
            let value = part.split_once('=')?.1.trim().trim_matches('"');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn extract_filename_from_url(raw_url: &str) -> Option<String> {
    let parsed = url::Url::parse(raw_url).ok()?;
    let file_name = parsed
        .path_segments()?
        .filter(|segment| !segment.is_empty())
        .next_back()?;
    if file_name.is_empty() {
        return None;
    }
    Some(file_name.to_string())
}

#[tauri::command]
fn process_files(paths: Vec<String>, target_dir: Option<String>) -> Result<String, String> {
    println!(">>> [Rust] Receiving files to process: {:?}", paths);

    let final_target_dir = if let Some(dir) = target_dir {
        std::path::PathBuf::from(dir)
    } else {
        let desktop = desktop_dir().ok_or("Failed to get desktop directory")?;
        desktop.join("FlowSelect_Received")
    };

    println!(">>> [Rust] Target directory: {:?}", final_target_dir);

    if !final_target_dir.exists() {
        fs::create_dir_all(&final_target_dir)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    let mut copied_count = 0;
    for path_str in &paths {
        let source = Path::new(path_str);
        if source.exists() && source.is_file() {
            // 获取原文件扩展名
            let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("bin");

            // 获取下一个可用序号
            let seq_num = get_next_sequence_number(&final_target_dir)?;
            let filename = format!("{}.{}", seq_num, ext);
            let dest = final_target_dir.join(&filename);

            fs::copy(source, &dest).map_err(|e| format!("Failed to copy {}: {}", path_str, e))?;
            copied_count += 1;
        }
    }

    Ok(format!(
        "Copied {} files to {:?}",
        copied_count, final_target_dir
    ))
}

async fn attempt_direct_image_download(
    app: &AppHandle,
    resolved_url: &str,
    final_target_dir: &Path,
    rename_media_on_download: bool,
    config: &mut serde_json::Value,
) -> Result<(String, String, Option<String>), String> {
    if !final_target_dir.exists() {
        fs::create_dir_all(final_target_dir)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    let response = reqwest::Client::new()
        .get(resolved_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    let status = response.status();
    let response_content_type = response
        .headers()
        .get("content-type")
        .and_then(|ct| ct.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();

    if !status.is_success() {
        return Err(if response_content_type.is_empty() {
            format!("HTTP error: {}", status)
        } else {
            format!(
                "HTTP error: {} (content-type: {})",
                status, response_content_type
            )
        });
    }

    let content_type = response_content_type;
    if content_type.starts_with("text/") {
        return Err(format!(
            "Unexpected non-image response content-type: {}",
            content_type
        ));
    }

    let ext = if content_type.contains("image/png") {
        "png"
    } else if content_type.contains("image/gif") {
        "gif"
    } else if content_type.contains("image/webp") {
        "webp"
    } else if content_type.contains("image/bmp") {
        "bmp"
    } else if content_type.contains("image/svg+xml") {
        "svg"
    } else {
        "jpg"
    };

    let source_filename = response
        .headers()
        .get("content-disposition")
        .and_then(|value| value.to_str().ok())
        .and_then(extract_filename_from_content_disposition)
        .or_else(|| extract_filename_from_url(resolved_url));

    let dest_path = if rename_media_on_download {
        build_rename_sequence_file_path(app, config, final_target_dir, ext)?
    } else if let Some(source_name) = source_filename.as_deref() {
        if let Some(path) = build_source_name_file_path(final_target_dir, source_name, ext) {
            path
        } else {
            build_sequence_file_path(final_target_dir, ext)?
        }
    } else {
        build_sequence_file_path(final_target_dir, ext)?
    };

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let mut file =
        fs::File::create(&dest_path).map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    println!(">>> [Rust] Saved to: {:?}", dest_path);

    let app_for_ae = app.clone();
    let path_for_ae = dest_path.to_string_lossy().to_string();
    tokio::spawn(async move {
        let _ = send_to_ae(app_for_ae, path_for_ae).await;
    });

    Ok((
        dest_path.to_string_lossy().to_string(),
        content_type,
        source_filename,
    ))
}

async fn resolve_protected_image_with_extension(
    app: &AppHandle,
    resolved_url: &str,
    final_target_dir: &Path,
    fallback: &ProtectedImageFallbackInput,
) -> Result<String, String> {
    let request_id = next_protected_image_ws_request_id();
    let image_url = normalize_optional_http_url(fallback.image_url.as_deref())
        .unwrap_or_else(|| resolved_url.to_string());
    let page_url = normalize_optional_http_url(fallback.page_url.as_deref());
    let (tx, rx) = oneshot::channel::<ProtectedImageResolutionResult>();

    {
        let mut pending = WS_PENDING_PROTECTED_IMAGE_REQUESTS
            .lock()
            .map_err(|_| "Failed to lock protected image request state".to_string())?;
        pending.insert(request_id.clone(), tx);
    }

    append_runtime_log_event(
        "download",
        "protected_image_fallback_requested",
        None,
        serde_json::json!({
            "mode": "protected_image_fallback",
            "resolvedUrl": resolved_url,
            "imageUrl": image_url,
            "pageUrl": page_url,
            "outputDir": final_target_dir.to_string_lossy().to_string(),
        }),
    );

    if let Err(err) = broadcast_ws_action(
        app,
        "resolve_protected_image",
        serde_json::json!({
            "requestId": request_id,
            "token": fallback.token.trim(),
            "imageUrl": image_url,
            "pageUrl": page_url,
            "targetDir": final_target_dir.to_string_lossy().to_string(),
        }),
    ) {
        let _ = take_pending_protected_image_request(request_id.as_str());
        append_runtime_log_event(
            "download",
            "protected_image_fallback_complete",
            None,
            serde_json::json!({
                "mode": "protected_image_fallback",
                "resolvedUrl": resolved_url,
                "pageUrl": page_url,
                "success": false,
                "code": "extension_unavailable",
                "error": err.as_str(),
            }),
        );
        return Err(err);
    }

    let outcome = match tokio::time::timeout(
        std::time::Duration::from_millis(PROTECTED_IMAGE_FALLBACK_TIMEOUT_MS),
        rx,
    )
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            let _ = take_pending_protected_image_request(request_id.as_str());
            append_runtime_log_event(
                "download",
                "protected_image_fallback_complete",
                None,
                serde_json::json!({
                    "mode": "protected_image_fallback",
                    "resolvedUrl": resolved_url,
                    "pageUrl": page_url,
                    "success": false,
                    "code": "protected_image_resolution_channel_closed",
                    "error": "Protected image fallback channel closed unexpectedly",
                }),
            );
            return Err("Protected image fallback channel closed unexpectedly".to_string());
        }
        Err(_) => {
            let _ = take_pending_protected_image_request(request_id.as_str());
            append_runtime_log_event(
                "download",
                "protected_image_fallback_complete",
                None,
                serde_json::json!({
                    "mode": "protected_image_fallback",
                    "resolvedUrl": resolved_url,
                    "pageUrl": page_url,
                    "success": false,
                    "code": "protected_image_resolution_timeout",
                    "error": "Protected image fallback timed out",
                }),
            );
            return Err("Protected image fallback timed out".to_string());
        }
    };

    if outcome.success {
        let file_path = outcome
            .file_path
            .clone()
            .ok_or_else(|| "Protected image fallback succeeded without a file path".to_string())?;
        append_runtime_log_event(
            "download",
            "protected_image_fallback_complete",
            None,
            serde_json::json!({
                "mode": "protected_image_fallback",
                "resolvedUrl": resolved_url,
                "pageUrl": page_url,
                "success": true,
                "filePath": file_path.clone(),
            }),
        );
        return Ok(file_path);
    }

    let fallback_error = outcome
        .error
        .clone()
        .or_else(|| outcome.code.clone())
        .unwrap_or_else(|| "Protected image fallback failed".to_string());
    append_runtime_log_event(
        "download",
        "protected_image_fallback_complete",
        None,
        serde_json::json!({
            "mode": "protected_image_fallback",
            "resolvedUrl": resolved_url,
            "pageUrl": page_url,
            "success": false,
            "code": outcome.code,
            "error": fallback_error.as_str(),
        }),
    );
    Err(fallback_error)
}

#[tauri::command]
async fn download_image(
    app: AppHandle,
    url: String,
    target_dir: Option<String>,
    protected_image_fallback: Option<ProtectedImageFallbackInput>,
) -> Result<String, String> {
    println!(">>> [Rust] Downloading image from: {}", url);
    let resolved_url = resolve_image_download_url(&url);
    if resolved_url != url {
        println!(
            ">>> [Rust] Resolved image URL from wrapper: {} -> {}",
            url, resolved_url
        );
    }

    let config_str = get_config(app.clone())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;
    let rename_media_on_download = is_rename_media_enabled(&config);

    let final_target_dir = if let Some(dir) = target_dir {
        PathBuf::from(dir)
    } else {
        config
            .get("outputPath")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                desktop_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("FlowSelect_Received")
            })
    };

    let fallback_context = protected_image_fallback.and_then(|fallback| {
        let token = fallback.token.trim().to_string();
        if token.is_empty() {
            return None;
        }

        Some(ProtectedImageFallbackInput {
            token,
            page_url: normalize_optional_http_url(fallback.page_url.as_deref()),
            image_url: normalize_optional_http_url(fallback.image_url.as_deref()),
        })
    });

    append_runtime_log_event(
        "download",
        "start",
        None,
        serde_json::json!({
            "mode": "image",
            "url": url.as_str(),
            "resolvedUrl": resolved_url.as_str(),
            "pageUrl": fallback_context.as_ref().and_then(|value| value.page_url.as_deref()),
            "renameEnabled": rename_media_on_download,
            "hasProtectedImageFallback": fallback_context.is_some(),
            "outputDir": final_target_dir.to_string_lossy().to_string(),
        }),
    );

    let direct_result = attempt_direct_image_download(
        &app,
        resolved_url.as_str(),
        final_target_dir.as_path(),
        rename_media_on_download,
        &mut config,
    )
    .await;

    match &direct_result {
        Ok((file_path, content_type, source_filename)) => {
            println!(
                ">>> [Rust] Image download complete: {} -> {}",
                summarize_url_for_log(resolved_url.as_str()),
                file_path
            );
            append_runtime_log_event(
                "download",
                "complete",
                None,
                serde_json::json!({
                    "mode": "image",
                    "success": true,
                    "url": url.as_str(),
                    "resolvedUrl": resolved_url.as_str(),
                    "contentType": content_type,
                    "sourceFilename": source_filename,
                    "filePath": file_path,
                }),
            );
            return Ok(file_path.clone());
        }
        Err(error) => {
            println!(
                ">>> [Rust] Image download failed: {} ({})",
                summarize_url_for_log(resolved_url.as_str()),
                error
            );
            append_runtime_log_event(
                "download",
                "complete",
                None,
                serde_json::json!({
                    "mode": "image",
                    "success": false,
                    "url": url.as_str(),
                    "resolvedUrl": resolved_url.as_str(),
                    "error": error,
                }),
            );

            if let Some(fallback) = fallback_context.as_ref() {
                if is_hotlink_like_image_download_error(error.as_str()) {
                    println!(
                        ">>> [Rust] Attempting protected image browser-context fallback: {}",
                        summarize_url_for_log(resolved_url.as_str())
                    );
                    return resolve_protected_image_with_extension(
                        &app,
                        resolved_url.as_str(),
                        final_target_dir.as_path(),
                        fallback,
                    )
                    .await
                    .map_err(|fallback_error| {
                        format!(
                            "{} | Browser-context fallback failed: {}",
                            error, fallback_error
                        )
                    });
                }
            }

            return Err(error.clone());
        }
    }
}

fn resolve_image_download_url(raw_url: &str) -> String {
    let trimmed = raw_url.trim();
    if let Some(parsed) = url::Url::parse(trimmed).ok() {
        let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
        let path = parsed.path().to_ascii_lowercase();
        let is_google_wrapper =
            (host == "google.com" || host == "www.google.com" || host.ends_with(".google.com"))
                && path.starts_with("/imgres");
        if is_google_wrapper {
            if let Some((_, value)) = parsed
                .query_pairs()
                .find(|(key, _)| key.eq_ignore_ascii_case("imgurl"))
            {
                let candidate = value.trim();
                if candidate.starts_with("http://") || candidate.starts_with("https://") {
                    return candidate.to_string();
                }
            }
        }
    }

    trimmed.to_string()
}

#[tauri::command]
async fn save_data_url(
    app: AppHandle,
    data_url: String,
    target_dir: Option<String>,
    original_filename: Option<String>,
) -> Result<String, String> {
    use base64::Engine;
    println!(">>> [Rust] Saving data URL");

    // Parse data URL format: data:image/jpeg;base64,<base64_data>
    if !data_url.starts_with("data:") {
        return Err("Invalid data URL format".to_string());
    }

    let data_url = &data_url[5..]; // Remove "data:" prefix
    let comma_pos = data_url
        .find(',')
        .ok_or("Invalid data URL: missing comma")?;

    let metadata = &data_url[..comma_pos];
    let base64_data = &data_url[comma_pos + 1..];

    // Extract MIME type
    let mime_type = metadata.split(';').next().unwrap_or("image/jpeg");

    // Prefer extension from original filename, otherwise infer from MIME type
    let ext = if let Some(ref filename) = original_filename {
        std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin")
    } else {
        match mime_type {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/bmp" => "bmp",
            "image/svg+xml" => "svg",
            "video/mp4" => "mp4",
            "video/webm" => "webm",
            "video/quicktime" => "mov",
            _ => "bin",
        }
    };

    // Decode base64 data
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let config_str = get_config(app.clone())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;
    let rename_media_on_download = is_rename_media_enabled(&config);

    // Determine target directory (read from config if not provided)
    let final_target_dir = if let Some(dir) = target_dir {
        std::path::PathBuf::from(dir)
    } else {
        config
            .get("outputPath")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| std::path::PathBuf::from(s))
            .unwrap_or_else(|| {
                desktop_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("FlowSelect_Received")
            })
    };

    append_runtime_log_event(
        "download",
        "start",
        None,
        serde_json::json!({
            "mode": "data_url",
            "mimeType": mime_type,
            "originalFilename": original_filename.as_deref(),
            "renameEnabled": rename_media_on_download,
            "outputDir": final_target_dir.to_string_lossy().to_string(),
        }),
    );

    let result: Result<String, String> = async {
        // Create directory if not exists
        if !final_target_dir.exists() {
            fs::create_dir_all(&final_target_dir)
                .map_err(|e| format!("Failed to create target directory: {}", e))?;
        }

        let dest_path = if rename_media_on_download {
            build_rename_sequence_file_path(&app, &mut config, &final_target_dir, ext)?
        } else if let Some(source_name) = original_filename.as_deref() {
            if let Some(path) = build_source_name_file_path(&final_target_dir, source_name, ext) {
                path
            } else {
                build_sequence_file_path(&final_target_dir, ext)?
            }
        } else {
            build_sequence_file_path(&final_target_dir, ext)?
        };

        // Write to file
        let mut file =
            fs::File::create(&dest_path).map_err(|e| format!("Failed to create file: {}", e))?;

        file.write_all(&bytes)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        println!(">>> [Rust] Saved to: {:?}", dest_path);

        // AE Portal
        let app_for_ae = app.clone();
        let path_for_ae = dest_path.to_string_lossy().to_string();
        tokio::spawn(async move {
            let _ = send_to_ae(app_for_ae, path_for_ae).await;
        });

        Ok(dest_path.to_string_lossy().to_string())
    }
    .await;

    match &result {
        Ok(file_path) => {
            println!(">>> [Rust] Data URL save complete: {}", file_path);
            append_runtime_log_event(
                "download",
                "complete",
                None,
                serde_json::json!({
                    "mode": "data_url",
                    "success": true,
                    "mimeType": mime_type,
                    "originalFilename": original_filename.as_deref(),
                    "filePath": file_path,
                }),
            )
        }
        Err(error) => {
            println!(">>> [Rust] Data URL save failed: {}", error);
            append_runtime_log_event(
                "download",
                "complete",
                None,
                serde_json::json!({
                    "mode": "data_url",
                    "success": false,
                    "mimeType": mime_type,
                    "originalFilename": original_filename.as_deref(),
                    "error": error,
                }),
            )
        }
    }

    result
}

/// 生成 AE 导入脚本
fn generate_jsx_script(file_path: &str, target_folder: &str) -> String {
    // 转义所有可能破坏 JavaScript 字符串的字符
    let escaped_path = file_path
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t");
    let escaped_folder = target_folder
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t");
    format!(
        r#"(function() {{
    var filePath = "{}";
    var targetFolderName = "{}";
    function getOrCreateFolder(name) {{
        var proj = app.project;
        for (var i = 1; i <= proj.numItems; i++) {{
            var item = proj.item(i);
            if (item instanceof FolderItem && item.name === name) return item;
        }}
        return proj.items.addFolder(name);
    }}
    var importFile = new File(filePath);
    if (importFile.exists) {{
        var importOptions = new ImportOptions(importFile);
        var importedItem = app.project.importFile(importOptions);
        importedItem.parentFolder = getOrCreateFolder(targetFolderName);
    }}
}})();"#,
        escaped_path, escaped_folder
    )
}

#[tauri::command]
async fn send_to_ae(app: AppHandle, file_path: String) -> Result<(), String> {
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    // 检查是否启用
    let enabled = config
        .get("aePortalEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        return Ok(());
    }

    // 获取 AE 路径
    let ae_path = config
        .get("aeExePath")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if ae_path.is_empty() {
        return Err("AE path not configured".to_string());
    }

    // 从 outputPath 提取文件夹名
    let output_path = config
        .get("outputPath")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let folder_name = Path::new(output_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("FlowSelect_Received");

    // 生成临时 JSX 脚本
    let jsx_content = generate_jsx_script(&file_path, folder_name);
    let temp_dir = std::env::temp_dir();
    let jsx_path = temp_dir.join("flowselect_ae_import.jsx");
    fs::write(&jsx_path, &jsx_content).map_err(|e| format!("Failed to write JSX: {}", e))?;

    // 执行 afterfx.exe -r script.jsx
    std::process::Command::new(ae_path)
        .args(["-r", &jsx_path.to_string_lossy()])
        .spawn()
        .map_err(|e| format!("Failed to launch AE: {}", e))?;

    // 延迟清理脚本
    let jsx_path_clone = jsx_path.clone();
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        let _ = fs::remove_file(jsx_path_clone);
    });

    Ok(())
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadResult {
    #[serde(rename = "traceId")]
    pub trace_id: String,
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    #[serde(rename = "traceId")]
    pub trace_id: String,
    pub percent: f32,
    pub stage: DownloadProgressStage,
    pub speed: String,
    pub eta: String,
}

#[derive(serde::Serialize, Clone)]
struct VideoQueueCountPayload {
    #[serde(rename = "activeCount")]
    active_count: usize,
    #[serde(rename = "pendingCount")]
    pending_count: usize,
    #[serde(rename = "totalCount")]
    total_count: usize,
    #[serde(rename = "maxConcurrent")]
    max_concurrent: usize,
}

#[derive(serde::Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum VideoQueueTaskStatus {
    Active,
    Pending,
}

#[derive(serde::Serialize, Clone)]
struct VideoQueueTaskPayload {
    #[serde(rename = "traceId")]
    trace_id: String,
    label: String,
    status: VideoQueueTaskStatus,
}

#[derive(serde::Serialize, Clone)]
struct VideoQueueDetailPayload {
    tasks: Vec<VideoQueueTaskPayload>,
}

#[derive(serde::Serialize, Clone)]
struct QueuedVideoDownloadAck {
    accepted: bool,
    #[serde(rename = "traceId")]
    trace_id: String,
}

#[derive(serde::Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadProgressStage {
    Preparing,
    Downloading,
    Merging,
    PostProcessing,
}

impl DownloadProgressStage {
    fn as_str(self) -> &'static str {
        match self {
            Self::Preparing => "preparing",
            Self::Downloading => "downloading",
            Self::Merging => "merging",
            Self::PostProcessing => "post_processing",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Preparing => "Preparing...",
            Self::Downloading => "Downloading...",
            Self::Merging => "Merging...",
            Self::PostProcessing => "Post-processing...",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ClipDownloadMode {
    Fast,
}

impl ClipDownloadMode {
    fn from_config(_config: &serde_json::Value) -> Self {
        // Clip downloads are standardized on the fast path. Legacy config keys are
        // tolerated for backward compatibility but no longer alter runtime behavior.
        Self::Fast
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Fast => "fast",
        }
    }
}

fn normalize_slice_reuse_url_key(raw_url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(raw_url) {
        let host = parsed
            .host_str()
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let path = parsed.path().trim_end_matches('/').to_string();

        if host.contains("youtube.com") {
            let video_id = parsed
                .query_pairs()
                .find(|(key, _)| key == "v")
                .map(|(_, value)| value.to_string())
                .unwrap_or(path);
            return format!("youtube::{}", video_id);
        }

        if host.contains("youtu.be") {
            let video_id = parsed
                .path_segments()
                .and_then(|segments| segments.filter(|segment| !segment.is_empty()).next_back())
                .unwrap_or_default()
                .to_string();
            return format!("youtube::{}", video_id);
        }

        if host.is_empty() {
            return raw_url.trim().to_string();
        }

        return format!("{}::{}", host, path);
    }

    raw_url.trim().to_string()
}

fn build_slice_source_cache_key(url: &str, ytdlp_quality: YtdlpQualityPreference) -> String {
    format!(
        "{}::{}",
        normalize_slice_reuse_url_key(url),
        ytdlp_quality.as_str()
    )
}

fn slice_source_cache_dir() -> PathBuf {
    std::env::temp_dir().join(SLICE_SOURCE_CACHE_DIR_NAME)
}

fn slice_source_cache_path_for_key(cache_key: &str, extension: &str) -> PathBuf {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    cache_key.hash(&mut hasher);
    let hash = hasher.finish();
    slice_source_cache_dir().join(format!("src-{:016x}.{}", hash, extension))
}

fn slice_cache_file_size_if_valid(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    let size = metadata.len();
    if size < SLICE_SOURCE_CACHE_MIN_VALID_BYTES {
        return None;
    }
    Some(size)
}

fn prune_slice_source_cache(now_ms: u128) {
    let mut cache = SLICE_SOURCE_CACHE.lock().unwrap();
    let mut stale: Vec<(String, PathBuf)> = Vec::new();

    for (key, entry) in cache.iter_mut() {
        let expired = now_ms.saturating_sub(entry.last_used_at_ms) > SLICE_SOURCE_CACHE_TTL_MS;
        if expired {
            stale.push((key.clone(), entry.source_path.clone()));
            continue;
        }

        if let Some(size) = slice_cache_file_size_if_valid(&entry.source_path) {
            entry.size_bytes = size;
        } else {
            stale.push((key.clone(), entry.source_path.clone()));
        }
    }

    for (key, path) in stale {
        cache.remove(&key);
        let _ = fs::remove_file(path);
    }

    let mut total_size = cache.values().map(|entry| entry.size_bytes).sum::<u64>();
    let mut ordered: Vec<(String, u128, u64, PathBuf)> = cache
        .iter()
        .map(|(key, entry)| {
            (
                key.clone(),
                entry.last_used_at_ms,
                entry.size_bytes,
                entry.source_path.clone(),
            )
        })
        .collect();
    ordered.sort_by_key(|(_, last_used, _, _)| *last_used);

    for (key, _, size, path) in ordered {
        let over_size = total_size > SLICE_SOURCE_CACHE_SIZE_CAP_BYTES;
        let over_count = cache.len() > SLICE_SOURCE_CACHE_MAX_ENTRIES;
        if !over_size && !over_count {
            break;
        }

        if cache.remove(&key).is_some() {
            total_size = total_size.saturating_sub(size);
            let _ = fs::remove_file(path);
        }
    }

    drop(cache);

    let mut history = SLICE_REQUEST_HISTORY.lock().unwrap();
    history.retain(|_, last_seen| {
        now_ms.saturating_sub(*last_seen) <= SLICE_SOURCE_CACHE_TRIGGER_WINDOW_MS
    });
}

fn invalidate_slice_source_cache(cache_key: &str) {
    let mut cache = SLICE_SOURCE_CACHE.lock().unwrap();
    if let Some(entry) = cache.remove(cache_key) {
        let _ = fs::remove_file(entry.source_path);
    }
}

fn get_slice_source_cache_path(cache_key: &str, now_ms: u128) -> Option<PathBuf> {
    let mut stale_path: Option<PathBuf> = None;
    let mut cache = SLICE_SOURCE_CACHE.lock().unwrap();

    let cache_hit = if let Some(entry) = cache.get_mut(cache_key) {
        if let Some(size) = slice_cache_file_size_if_valid(&entry.source_path) {
            entry.size_bytes = size;
            entry.last_used_at_ms = now_ms;
            Some(entry.source_path.clone())
        } else {
            stale_path = Some(entry.source_path.clone());
            None
        }
    } else {
        None
    };

    if cache_hit.is_none() && stale_path.is_some() {
        cache.remove(cache_key);
    }

    drop(cache);
    if let Some(path) = stale_path {
        let _ = fs::remove_file(path);
    }

    cache_hit
}

fn should_attempt_slice_source_reuse(cache_key: &str, now_ms: u128) -> bool {
    prune_slice_source_cache(now_ms);

    if get_slice_source_cache_path(cache_key, now_ms).is_some() {
        println!(
            ">>> [Rust] Slice cache hit for key {}, reuse enabled immediately",
            cache_key
        );
        return true;
    }

    let mut history = SLICE_REQUEST_HISTORY.lock().unwrap();
    let should_reuse = history.get(cache_key).is_some_and(|last_seen| {
        now_ms.saturating_sub(*last_seen) <= SLICE_SOURCE_CACHE_TRIGGER_WINDOW_MS
    });
    history.insert(cache_key.to_string(), now_ms);
    if should_reuse {
        println!(
            ">>> [Rust] Slice cache reuse triggered for repeated key {}",
            cache_key
        );
    }
    should_reuse
}

fn upsert_slice_source_cache(
    cache_key: &str,
    source_path: PathBuf,
    now_ms: u128,
) -> Result<(), String> {
    let size_bytes = slice_cache_file_size_if_valid(&source_path)
        .ok_or_else(|| format!("Slice cache source invalid: {:?}", source_path))?;
    let mut cache = SLICE_SOURCE_CACHE.lock().unwrap();
    cache.insert(
        cache_key.to_string(),
        SliceSourceCacheEntry {
            source_path,
            size_bytes,
            last_used_at_ms: now_ms,
        },
    );
    drop(cache);
    prune_slice_source_cache(now_ms);
    Ok(())
}

fn precise_clip_hw_encoder_candidates() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &["h264_nvenc", "h264_qsv", "h264_amf"]
    }
    #[cfg(target_os = "macos")]
    {
        &["h264_videotoolbox"]
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        &[]
    }
}

fn detect_precise_clip_hw_encoder(app: &AppHandle) -> Option<String> {
    let candidates = precise_clip_hw_encoder_candidates();
    if candidates.is_empty() {
        return None;
    }

    let ffmpeg_path = match ffmpeg_binary_path(app) {
        Ok(path) => path,
        Err(err) => {
            println!(">>> [Rust] Precise mode encoder probe skipped: {}", err);
            return None;
        }
    };

    let output = match std::process::Command::new(&ffmpeg_path)
        .args(["-hide_banner", "-encoders"])
        .output()
    {
        Ok(output) => output,
        Err(err) => {
            println!(">>> [Rust] Precise mode encoder probe skipped: {}", err);
            return None;
        }
    };

    if !output.status.success() {
        println!(
            ">>> [Rust] Precise mode encoder probe failed with status: {}",
            output.status
        );
        return None;
    }

    let mut encoder_text = String::from_utf8_lossy(&output.stdout).to_string();
    if encoder_text.trim().is_empty() {
        encoder_text = String::from_utf8_lossy(&output.stderr).to_string();
    }
    let lower = encoder_text.to_ascii_lowercase();

    for encoder in candidates {
        if lower.contains(encoder) {
            return Some((*encoder).to_string());
        }
    }
    None
}

fn resolve_precise_clip_hw_encoder(app: &AppHandle) -> Option<String> {
    let mut cache_guard = PRECISE_CLIP_HW_ENCODER_CACHE.lock().unwrap();
    if let Some(cached) = cache_guard.as_ref() {
        return cached.clone();
    }

    let detected = detect_precise_clip_hw_encoder(app);
    if let Some(encoder) = detected.as_ref() {
        println!(
            ">>> [Rust] Precise mode hardware encoder detected: {}",
            encoder
        );
    } else {
        println!(">>> [Rust] Precise mode hardware encoder unavailable, fallback to CPU");
    }
    *cache_guard = Some(detected.clone());
    detected
}

fn extract_process_failure_message(stderr: &[u8], status: std::process::ExitStatus) -> String {
    String::from_utf8_lossy(stderr)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
        .unwrap_or_else(|| format!("process exited with status {}", status))
}

fn emit_post_processing_status(app: &AppHandle, trace_id: &str, status: &str) {
    let _ = app.emit(
        "video-download-progress",
        DownloadProgress {
            trace_id: trace_id.to_string(),
            percent: -1.0,
            stage: DownloadProgressStage::PostProcessing,
            speed: status.to_string(),
            eta: "".to_string(),
        },
    );
    maybe_log_runtime_progress(
        trace_id,
        DownloadProgressStage::PostProcessing,
        -1.0,
        status,
        "",
    );
}

async fn probe_media_summary(path: &Path) -> Result<MediaProbeSummary, String> {
    let target_path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let output = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_entries",
                "format=format_name:stream=codec_type,codec_name",
            ])
            .arg(&target_path)
            .output()
            .map_err(|e| format!("Failed to spawn ffprobe: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "ffprobe failed for {:?}: {}",
                target_path,
                extract_process_failure_message(&output.stderr, output.status)
            ));
        }

        let probe: MediaProbeResult = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse ffprobe JSON: {}", e))?;
        let container_names = probe
            .format
            .and_then(|format| format.format_name)
            .map(|value| {
                value
                    .split(',')
                    .map(|item| item.trim().to_ascii_lowercase())
                    .filter(|item| !item.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let mut has_video_stream = false;
        let mut has_audio_stream = false;
        let mut video_codec = None;
        let mut audio_codec = None;

        for stream in probe.streams {
            match stream.codec_type.to_ascii_lowercase().as_str() {
                "video" => {
                    has_video_stream = true;
                    if video_codec.is_none() {
                        video_codec = stream.codec_name.map(|value| value.to_ascii_lowercase());
                    }
                }
                "audio" => {
                    has_audio_stream = true;
                    if audio_codec.is_none() {
                        audio_codec = stream.codec_name.map(|value| value.to_ascii_lowercase());
                    }
                }
                _ => {}
            }
        }

        Ok(MediaProbeSummary {
            container_names,
            has_video_stream,
            has_audio_stream,
            video_codec,
            audio_codec,
        })
    })
    .await
    .map_err(|e| format!("Failed to await ffprobe task: {}", e))?
}

fn sibling_path_with_suffix(path: &Path, suffix: &str, extension: &str) -> PathBuf {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("video");
    parent.join(format!("{}_{}.{}", stem, suffix, extension))
}

fn build_ae_safe_visible_output_path(source_path: &Path) -> PathBuf {
    let source_ext = source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if source_ext.as_deref() == Some("mp4") {
        return source_path.to_path_buf();
    }

    let parent = source_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("video");
    let preferred = parent.join(format!("{}.mp4", stem));
    if !preferred.exists() {
        return preferred;
    }

    let first_fallback = parent.join(format!("{}_ae.mp4", stem));
    if !first_fallback.exists() {
        return first_fallback;
    }

    let mut counter = 2;
    loop {
        let candidate = parent.join(format!("{}_ae_{}.mp4", stem, counter));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn build_ae_safe_temp_output_path(target_path: &Path) -> PathBuf {
    let first = sibling_path_with_suffix(target_path, "flowselect_tmp", "mp4");
    if !first.exists() {
        return first;
    }

    let mut counter = 2;
    loop {
        let candidate =
            sibling_path_with_suffix(target_path, &format!("flowselect_tmp_{}", counter), "mp4");
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn replace_file_preserving_backup(temp_path: &Path, target_path: &Path) -> Result<(), String> {
    if !target_path.exists() {
        return fs::rename(temp_path, target_path).map_err(|e| {
            format!(
                "Failed to move normalized output from {:?} to {:?}: {}",
                temp_path, target_path, e
            )
        });
    }

    let backup_path = sibling_path_with_suffix(target_path, "flowselect_backup", "bak");
    if backup_path.exists() {
        let _ = fs::remove_file(&backup_path);
    }
    fs::rename(target_path, &backup_path).map_err(|e| {
        format!(
            "Failed to stage original output {:?} for replacement: {}",
            target_path, e
        )
    })?;

    match fs::rename(temp_path, target_path) {
        Ok(_) => {
            if let Err(err) = fs::remove_file(&backup_path) {
                println!(
                    ">>> [Rust] Warning: Failed to cleanup normalization backup {:?}: {}",
                    backup_path, err
                );
            }
            Ok(())
        }
        Err(err) => {
            let _ = fs::rename(&backup_path, target_path);
            Err(format!(
                "Failed to replace original output {:?} with normalized file {:?}: {}",
                target_path, temp_path, err
            ))
        }
    }
}

async fn run_ffmpeg_capture_output(
    app: &AppHandle,
    args: Vec<String>,
    context: &str,
) -> Result<std::process::Output, String> {
    let ffmpeg_path = ffmpeg_binary_path(app)?;
    let ffmpeg_path_display = ffmpeg_path.to_string_lossy().to_string();
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new(&ffmpeg_path).args(args).output()
    })
    .await
    .map_err(|e| format!("Failed to await {}: {}", context, e))?
    .map_err(|e| {
        format!(
            "Failed to spawn {} using {}: {}",
            context, ffmpeg_path_display, e
        )
    })?;

    Ok(output)
}

async fn run_ffmpeg_with_args(app: &AppHandle, args: Vec<String>) -> Result<(), String> {
    let output = run_ffmpeg_capture_output(app, args, "ffmpeg task").await?;

    if !output.status.success() {
        return Err(extract_process_failure_message(
            &output.stderr,
            output.status,
        ));
    }

    Ok(())
}

async fn normalize_video_output_for_ae(
    app: &AppHandle,
    source_path: &Path,
    trace_id: &str,
) -> Result<String, String> {
    if !source_path.exists() {
        return Err(format!(
            "Downloaded file disappeared before normalization: {:?}",
            source_path
        ));
    }

    let probe_summary = match probe_media_summary(source_path).await {
        Ok(summary) => Some(summary),
        Err(err) => {
            println!(
                ">>> [Rust] AE-safe probe failed for {:?}, falling back to full transcode: {}",
                source_path, err
            );
            append_runtime_log_event(
                "download",
                "ae_safe_probe_warning",
                Some(trace_id),
                serde_json::json!({
                    "path": source_path.to_string_lossy().to_string(),
                    "error": err,
                }),
            );
            None
        }
    };

    let plan = probe_summary
        .as_ref()
        .map(MediaProbeSummary::normalization_plan)
        .unwrap_or(AeSafeNormalizationPlan::FullTranscode);

    if let Some(summary) = probe_summary.as_ref() {
        println!(
            ">>> [Rust] AE-safe probe summary: path={:?}, containers={:?}, hasVideo={}, hasAudio={}, video={:?}, audio={:?}, plan={}",
            source_path,
            summary.container_names,
            summary.has_video_stream,
            summary.has_audio_stream,
            summary.video_codec,
            summary.audio_codec,
            plan.as_str()
        );
    } else {
        println!(
            ">>> [Rust] AE-safe probe summary unavailable, forcing plan={}",
            plan.as_str()
        );
    }

    if plan == AeSafeNormalizationPlan::Skip {
        return Ok(source_path.to_string_lossy().to_string());
    }

    emit_post_processing_status(app, trace_id, plan.status_text());
    append_runtime_log_event(
        "download",
        "ae_safe_normalize_start",
        Some(trace_id),
        serde_json::json!({
            "path": source_path.to_string_lossy().to_string(),
            "plan": plan.as_str(),
        }),
    );

    let visible_output_path = build_ae_safe_visible_output_path(source_path);
    let temp_output_path = build_ae_safe_temp_output_path(&visible_output_path);
    if temp_output_path.exists() {
        let _ = fs::remove_file(&temp_output_path);
    }

    let normalization_result: Result<(), String> = match plan {
        AeSafeNormalizationPlan::Skip => Ok(()),
        AeSafeNormalizationPlan::RemuxOnly => {
            let ffmpeg_args = vec![
                "-y".to_string(),
                "-hide_banner".to_string(),
                "-loglevel".to_string(),
                "error".to_string(),
                "-i".to_string(),
                source_path.to_string_lossy().to_string(),
                "-map".to_string(),
                "0:v:0".to_string(),
                "-map".to_string(),
                "0:a?".to_string(),
                "-c".to_string(),
                "copy".to_string(),
                "-movflags".to_string(),
                "+faststart".to_string(),
                temp_output_path.to_string_lossy().to_string(),
            ];
            run_ffmpeg_with_args(app, ffmpeg_args)
                .await
                .map_err(|e| format!("AE-safe remux failed: {}", e))
        }
        AeSafeNormalizationPlan::AudioTranscode => {
            let ffmpeg_args = vec![
                "-y".to_string(),
                "-hide_banner".to_string(),
                "-loglevel".to_string(),
                "error".to_string(),
                "-i".to_string(),
                source_path.to_string_lossy().to_string(),
                "-map".to_string(),
                "0:v:0".to_string(),
                "-map".to_string(),
                "0:a?".to_string(),
                "-c:v".to_string(),
                "copy".to_string(),
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "320k".to_string(),
                "-movflags".to_string(),
                "+faststart".to_string(),
                temp_output_path.to_string_lossy().to_string(),
            ];
            run_ffmpeg_with_args(app, ffmpeg_args)
                .await
                .map_err(|e| format!("AE-safe audio transcode failed: {}", e))
        }
        AeSafeNormalizationPlan::FullTranscode => {
            let build_args = |video_encoder: &str| {
                vec![
                    "-y".to_string(),
                    "-hide_banner".to_string(),
                    "-loglevel".to_string(),
                    "error".to_string(),
                    "-i".to_string(),
                    source_path.to_string_lossy().to_string(),
                    "-map".to_string(),
                    "0:v:0".to_string(),
                    "-map".to_string(),
                    "0:a?".to_string(),
                    "-c:v".to_string(),
                    video_encoder.to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                    "-c:a".to_string(),
                    "aac".to_string(),
                    "-b:a".to_string(),
                    "320k".to_string(),
                    "-movflags".to_string(),
                    "+faststart".to_string(),
                    temp_output_path.to_string_lossy().to_string(),
                ]
            };

            if let Some(gpu_encoder) = resolve_precise_clip_hw_encoder(app) {
                match run_ffmpeg_with_args(app, build_args(gpu_encoder.as_str())).await {
                    Ok(_) => Ok(()),
                    Err(err) => {
                        println!(
                            ">>> [Rust] AE-safe GPU transcode failed with {}: {}. Falling back to CPU.",
                            gpu_encoder, err
                        );
                        append_runtime_log_event(
                            "download",
                            "ae_safe_gpu_fallback",
                            Some(trace_id),
                            serde_json::json!({
                                "path": source_path.to_string_lossy().to_string(),
                                "gpuEncoder": gpu_encoder,
                                "error": err,
                            }),
                        );
                        if temp_output_path.exists() {
                            let _ = fs::remove_file(&temp_output_path);
                        }
                        run_ffmpeg_with_args(app, build_args("libx264"))
                            .await
                            .map_err(|cpu_err| {
                                format!(
                                    "AE-safe full transcode failed after GPU fallback: {}",
                                    cpu_err
                                )
                            })
                    }
                }
            } else {
                println!(">>> [Rust] AE-safe full transcode using CPU encoder libx264");
                run_ffmpeg_with_args(app, build_args("libx264"))
                    .await
                    .map_err(|e| format!("AE-safe full transcode failed: {}", e))
            }
        }
    };
    if let Err(err) = normalization_result {
        let _ = fs::remove_file(&temp_output_path);
        return Err(err);
    }

    replace_file_preserving_backup(&temp_output_path, &visible_output_path)?;
    if visible_output_path != source_path {
        if let Err(err) = fs::remove_file(source_path) {
            println!(
                ">>> [Rust] Warning: Failed to remove intermediate source {:?}: {}",
                source_path, err
            );
        }
    }

    append_runtime_log_event(
        "download",
        "ae_safe_normalize_complete",
        Some(trace_id),
        serde_json::json!({
            "path": visible_output_path.to_string_lossy().to_string(),
            "plan": plan.as_str(),
        }),
    );
    Ok(visible_output_path.to_string_lossy().to_string())
}

fn cleanup_residual_audio_artifacts(final_path: &str) {
    let final_path = Path::new(final_path);
    let Some(parent) = final_path.parent() else {
        return;
    };
    let target_stem = final_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    let Ok(entries) = std::fs::read_dir(parent) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path == final_path {
            continue;
        }
        if let Some(ext) = path.extension() {
            let same_stem = path
                .file_stem()
                .and_then(|value| value.to_str())
                .map(|value| value.to_ascii_lowercase())
                == target_stem;
            let split_artifact_matches =
                ytdlp_split_artifact_base_name(&path).as_deref() == target_stem.as_deref();
            if (ext == "m4a" && same_stem) || split_artifact_matches {
                println!(">>> [Rust] Cleaning up residual file: {:?}", path);
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}

fn ytdlp_split_artifact_base_name(path: &Path) -> Option<String> {
    static YTDLP_SPLIT_ARTIFACT_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)^(?P<base>.+)\.f\d+\.[^.]+$").expect("invalid yt-dlp split artifact regex")
    });

    let file_name = path.file_name()?.to_str()?;
    YTDLP_SPLIT_ARTIFACT_RE
        .captures(file_name)
        .and_then(|caps| caps.name("base"))
        .map(|value| value.as_str().to_ascii_lowercase())
}

fn cleanup_captured_ytdlp_artifacts(
    captured_artifact_paths: &HashSet<PathBuf>,
    keep_path: Option<&Path>,
) {
    for path in captured_artifact_paths {
        if keep_path.is_some_and(|keep| keep == path) {
            continue;
        }
        if path.exists() {
            println!(">>> [Rust] Cleaning up yt-dlp artifact: {:?}", path);
            let _ = fs::remove_file(path);
        }
    }
}

async fn finalize_ytdlp_success(
    app: &AppHandle,
    trace_id: &str,
    final_path: String,
    ae_friendly_conversion_enabled: bool,
) -> DownloadResult {
    let normalized_path = if ae_friendly_conversion_enabled {
        match normalize_video_output_for_ae(app, Path::new(&final_path), trace_id).await {
            Ok(path) => path,
            Err(err) => {
                return emit_download_terminal_failure(
                    app,
                    trace_id,
                    DownloadTerminalErrorCode::OutputNormalizationFailed,
                    err.as_str(),
                );
            }
        }
    } else {
        println!(
            ">>> [Rust] Skipping AE-friendly normalization for trace_id={} path={}",
            trace_id, final_path
        );
        append_runtime_log_event(
            "download",
            "ae_safe_normalize_skipped",
            Some(trace_id),
            serde_json::json!({
                "path": final_path,
                "reason": "preference_disabled",
            }),
        );
        final_path
    };

    cleanup_residual_audio_artifacts(&normalized_path);

    let result = DownloadResult {
        trace_id: trace_id.to_string(),
        success: true,
        file_path: Some(normalized_path.clone()),
        error: None,
    };
    let _ = app.emit("video-download-complete", result.clone());
    append_runtime_log_event(
        "download",
        "complete",
        Some(trace_id),
        serde_json::json!({
            "mode": "yt-dlp",
            "success": true,
            "filePath": result.file_path.clone(),
        }),
    );
    clear_runtime_progress_log_state(trace_id);

    let app_for_ae = app.clone();
    tokio::spawn(async move {
        let _ = send_to_ae(app_for_ae, normalized_path).await;
    });

    result
}

fn should_retry_youtube_without_cookies(error_text: &str) -> bool {
    let lower = error_text.to_ascii_lowercase();
    lower.contains("n challenge solving failed")
        || lower.contains("js challenge provider")
        || lower.contains("only images are available for download")
        || lower.contains("requested format is not available")
        || lower.contains("sign in to confirm")
        || lower.contains("not a bot")
}

fn should_retry_ytdlp_without_resume(error_text: &str) -> bool {
    let lower = error_text.to_ascii_lowercase();
    lower.contains("http error 416") || lower.contains("requested range not satisfiable")
}

fn append_ytdlp_runtime_guard_args(args: &mut Vec<String>, disable_resume_artifacts: bool) {
    // Keep bundled yt-dlp isolated from host-machine config so portable builds
    // behave consistently across different user environments.
    args.push("--ignore-config".to_string());
    if disable_resume_artifacts {
        args.push("--no-continue".to_string());
        args.push("--no-part".to_string());
    }
}

async fn download_full_source_to_slice_cache(
    app: &AppHandle,
    url: &str,
    extension_cookies_path: &Option<PathBuf>,
    ytdlp_quality: YtdlpQualityPreference,
    cache_path: &Path,
    trace_id: &str,
    disable_resume_artifacts: bool,
) -> Result<PathBuf, String> {
    use tauri_plugin_shell::process::CommandEvent;

    println!(">>> [Rust] Slice cache source download start: {}", url);
    let ffmpeg_location = ffmpeg_location_for_ytdlp(app)?;
    let ytdlp_temp_dir = std::env::temp_dir().join(YTDLP_TEMP_DIR_NAME);
    fs::create_dir_all(&ytdlp_temp_dir)
        .map_err(|e| format!("Failed to create yt-dlp temp directory: {}", e))?;
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create slice cache dir: {}", e))?;
    }
    if cache_path.exists() {
        let _ = fs::remove_file(cache_path);
    }

    let mut args = vec![
        "-f".to_string(),
        ytdlp_quality.format_selector().to_string(),
        "--merge-output-format".to_string(),
        ytdlp_quality.merge_output_format().to_string(),
        "--ffmpeg-location".to_string(),
        ffmpeg_location,
        "--no-keep-video".to_string(),
        "--newline".to_string(),
        "--progress".to_string(),
        "--encoding".to_string(),
        "utf-8".to_string(),
        "--extractor-args".to_string(),
        "youtube:player_js_variant=tv".to_string(),
        "--js-runtimes".to_string(),
        "node".to_string(),
        "--js-runtimes".to_string(),
        "deno".to_string(),
        "--remote-components".to_string(),
        "ejs:github".to_string(),
        "-o".to_string(),
        cache_path.to_string_lossy().to_string(),
    ];
    append_ytdlp_runtime_guard_args(&mut args, disable_resume_artifacts);
    if let Some(format_sort) = ytdlp_quality.format_sort() {
        args.push("-S".to_string());
        args.push(format_sort.to_string());
    }
    if let Some(cookies_path) = extension_cookies_path {
        if cookies_path.exists() {
            args.push("--cookies".to_string());
            args.push(cookies_path.to_string_lossy().to_string());
        }
    }
    args.push(url.to_string());

    let env_path = build_env_path_with_deno(app);
    let ytdlp_path = ytdlp_binary_path(app)?;
    let shell = app.shell();
    let (mut rx, child) = shell
        .command(ytdlp_path.to_string_lossy().to_string())
        .args(&args)
        .env("PATH", &env_path)
        .spawn()
        .map_err(|spawn_err| {
            format!(
                "Failed to spawn yt-dlp for slice cache at {:?}: {}",
                ytdlp_path, spawn_err
            )
        })?;
    register_download_child(trace_id, child.pid());

    let mut stderr_buffer = String::new();
    let mut last_file_path = Some(cache_path.to_string_lossy().to_string());
    let mut last_stage = DownloadProgressStage::Preparing;
    let mut heartbeat_state = YtdlpHeartbeatState::default();
    let mut last_hard_heartbeat_at = std::time::Instant::now();
    let mut last_soft_heartbeat_at = Some(std::time::Instant::now());
    let mut captured_artifact_paths = HashSet::new();

    loop {
        match tokio::time::timeout(
            std::time::Duration::from_millis(YTDLP_WATCHDOG_TICK_MILLIS),
            rx.recv(),
        )
        .await
        {
            Ok(Some(event)) => match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    println!(">>> [yt-dlp cache] {}", line_str);
                    let heartbeat_event = process_ytdlp_output_line(
                        app,
                        &line_str,
                        &mut last_file_path,
                        &mut last_stage,
                        &mut heartbeat_state,
                        &mut captured_artifact_paths,
                        trace_id,
                    );
                    let now = std::time::Instant::now();
                    if heartbeat_event.hard_heartbeat {
                        last_hard_heartbeat_at = now;
                        last_soft_heartbeat_at = None;
                    }
                    if heartbeat_event.soft_heartbeat {
                        last_soft_heartbeat_at = Some(now);
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    println!(">>> [yt-dlp cache stderr] {}", line_str);
                    stderr_buffer.push_str(&line_str);
                    stderr_buffer.push('\n');
                    let heartbeat_event = process_ytdlp_output_line(
                        app,
                        &line_str,
                        &mut last_file_path,
                        &mut last_stage,
                        &mut heartbeat_state,
                        &mut captured_artifact_paths,
                        trace_id,
                    );
                    let now = std::time::Instant::now();
                    if heartbeat_event.hard_heartbeat {
                        last_hard_heartbeat_at = now;
                        last_soft_heartbeat_at = None;
                    }
                    if heartbeat_event.soft_heartbeat {
                        last_soft_heartbeat_at = Some(now);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    clear_download_child(trace_id);
                    if payload.code == Some(0) {
                        if slice_cache_file_size_if_valid(cache_path).is_some() {
                            cleanup_captured_ytdlp_artifacts(
                                &captured_artifact_paths,
                                Some(cache_path),
                            );
                            return Ok(cache_path.to_path_buf());
                        }
                        cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
                        return Err(format!(
                            "Slice cache source invalid after download: {:?}",
                            cache_path
                        ));
                    }

                    cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
                    let message = stderr_buffer
                        .lines()
                        .map(str::trim)
                        .find(|line| !line.is_empty())
                        .map(|line| line.to_string())
                        .unwrap_or_else(|| format!("yt-dlp exited with code {:?}", payload.code));
                    return Err(format!("Slice cache source download failed: {}", message));
                }
                _ => {}
            },
            Ok(None) => break,
            Err(_) => {}
        }

        if is_download_cancelled(trace_id) {
            kill_download_child_process(trace_id);
            cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
            return Err("Download cancelled".to_string());
        }

        let now = std::time::Instant::now();
        if mark_hard_heartbeat_from_output_growth(&last_file_path, &mut heartbeat_state) {
            last_hard_heartbeat_at = now;
            last_soft_heartbeat_at = None;
        }
        if is_watchdog_timeout_candidate(last_hard_heartbeat_at, last_soft_heartbeat_at, now) {
            terminate_download_child_process_with_grace(trace_id).await;
            cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
            return Err("Slice cache source download stalled".to_string());
        }
    }

    clear_download_child(trace_id);
    cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
    Err("Slice cache source download ended unexpectedly".to_string())
}

async fn ensure_slice_source_cache(
    app: &AppHandle,
    url: &str,
    extension_cookies_path: &Option<PathBuf>,
    ytdlp_quality: YtdlpQualityPreference,
    cache_key: &str,
    trace_id: &str,
) -> Result<PathBuf, String> {
    let now_ms = now_timestamp_ms();
    if let Some(path) = get_slice_source_cache_path(cache_key, now_ms) {
        println!(">>> [Rust] Slice cache source reuse hit: {:?}", path);
        return Ok(path);
    }

    let cache_path =
        slice_source_cache_path_for_key(cache_key, ytdlp_quality.slice_cache_extension());
    let downloaded_path = download_full_source_to_slice_cache(
        app,
        url,
        extension_cookies_path,
        ytdlp_quality,
        &cache_path,
        trace_id,
        false,
    )
    .await?;
    upsert_slice_source_cache(cache_key, downloaded_path.clone(), now_timestamp_ms())?;
    Ok(downloaded_path)
}

async fn slice_cached_source_to_output(
    app: &AppHandle,
    source_path: &Path,
    output_dir: &Path,
    config: &mut serde_json::Value,
    rename_media_on_download: bool,
    clip_range: &ClipTimeRange,
    title_hint: Option<&str>,
    trace_id: &str,
) -> Result<String, String> {
    if slice_cache_file_size_if_valid(source_path).is_none() {
        return Err(format!("Slice cache source is invalid: {:?}", source_path));
    }

    let output_path = if rename_media_on_download {
        build_rename_sequence_file_path(app, config, output_dir, "mp4")?
    } else {
        build_clip_title_file_path(output_dir, clip_range, title_hint, "mp4")?
    };

    let _ = app.emit(
        "video-download-progress",
        DownloadProgress {
            trace_id: trace_id.to_string(),
            percent: -1.0,
            stage: DownloadProgressStage::PostProcessing,
            speed: "Slicing from local cache...".to_string(),
            eta: "".to_string(),
        },
    );

    let start = format_seconds_for_download_section(clip_range.start_seconds);
    let end = format_seconds_for_download_section(clip_range.end_seconds);
    let source_str = source_path.to_string_lossy().to_string();
    let output_str = output_path.to_string_lossy().to_string();
    let mut ffmpeg_args = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
    ];
    ffmpeg_args.extend_from_slice(&[
        "-ss".to_string(),
        start,
        "-to".to_string(),
        end,
        "-i".to_string(),
        source_str,
        "-c".to_string(),
        "copy".to_string(),
    ]);
    ffmpeg_args.push(output_str.clone());

    let ffmpeg_output = run_ffmpeg_capture_output(app, ffmpeg_args, "ffmpeg slicing task").await?;

    if !ffmpeg_output.status.success() {
        let stderr_message = String::from_utf8_lossy(&ffmpeg_output.stderr)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(|line| line.to_string())
            .unwrap_or_else(|| format!("ffmpeg exited with status {}", ffmpeg_output.status));
        return Err(format!("Cached slicing failed: {}", stderr_message));
    }

    if slice_cache_file_size_if_valid(&output_path).is_none() {
        return Err(format!(
            "Cached slicing produced invalid output: {:?}",
            output_path
        ));
    }

    Ok(output_str)
}

async fn try_slice_download_with_reuse(
    app: &AppHandle,
    url: &str,
    extension_cookies_path: &Option<PathBuf>,
    ytdlp_quality: YtdlpQualityPreference,
    cache_key: &str,
    output_dir: &Path,
    config: &mut serde_json::Value,
    rename_media_on_download: bool,
    clip_range: &ClipTimeRange,
    title_hint: Option<String>,
    trace_id: &str,
) -> Result<String, String> {
    let source_path = ensure_slice_source_cache(
        app,
        url,
        extension_cookies_path,
        ytdlp_quality,
        cache_key,
        trace_id,
    )
    .await?;
    match slice_cached_source_to_output(
        app,
        &source_path,
        output_dir,
        config,
        rename_media_on_download,
        clip_range,
        title_hint.as_deref(),
        trace_id,
    )
    .await
    {
        Ok(path) => Ok(path),
        Err(first_err) => {
            if is_cancelled_error(first_err.as_str()) {
                return Err(first_err);
            }
            println!(
                ">>> [Rust] Slice cache output failed, refreshing cache source once: {}",
                first_err
            );
            invalidate_slice_source_cache(cache_key);
            let refreshed_source = ensure_slice_source_cache(
                app,
                url,
                extension_cookies_path,
                ytdlp_quality,
                cache_key,
                trace_id,
            )
            .await?;
            slice_cached_source_to_output(
                app,
                &refreshed_source,
                output_dir,
                config,
                rename_media_on_download,
                clip_range,
                title_hint.as_deref(),
                trace_id,
            )
            .await
            .map_err(|retry_err| {
                format!(
                    "Slice cache retry failed (first: {}; retry: {})",
                    first_err, retry_err
                )
            })
        }
    }
}

#[derive(Clone, Copy)]
enum DownloadTerminalErrorCode {
    Cancelled,
    WatchdogHardStall,
    YtdlpSpawnFailure,
    YtdlpExitFailure,
    YtdlpUnexpectedEnd,
    OutputNormalizationFailed,
}

impl DownloadTerminalErrorCode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Cancelled => "E_DOWNLOAD_CANCELLED",
            Self::WatchdogHardStall => "E_WATCHDOG_HARD_STALL",
            Self::YtdlpSpawnFailure => "E_YTDLP_SPAWN_FAILURE",
            Self::YtdlpExitFailure => "E_YTDLP_EXIT_FAILURE",
            Self::YtdlpUnexpectedEnd => "E_YTDLP_UNEXPECTED_END",
            Self::OutputNormalizationFailed => "E_OUTPUT_NORMALIZATION_FAILED",
        }
    }
}

fn with_terminal_error_code(code: DownloadTerminalErrorCode, message: &str) -> String {
    if message.trim().is_empty() {
        format!("[{}]", code.as_str())
    } else {
        format!("[{}] {}", code.as_str(), message.trim())
    }
}

fn emit_download_terminal_failure(
    app: &AppHandle,
    trace_id: &str,
    code: DownloadTerminalErrorCode,
    message: &str,
) -> DownloadResult {
    let result = DownloadResult {
        trace_id: trace_id.to_string(),
        success: false,
        file_path: None,
        error: Some(with_terminal_error_code(code, message)),
    };
    let _ = app.emit("video-download-complete", result.clone());
    append_runtime_log_event(
        "download",
        "complete",
        Some(trace_id),
        serde_json::json!({
            "mode": "yt-dlp",
            "success": false,
            "error": result.error.clone(),
        }),
    );
    clear_runtime_progress_log_state(trace_id);
    result
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DownloadRoute {
    DirectDouyin,
    DirectXiaohongshu,
    Pinterest,
    YtDlp,
}

impl DownloadRoute {
    fn as_str(self) -> &'static str {
        match self {
            Self::DirectDouyin => "direct_douyin",
            Self::DirectXiaohongshu => "direct_xiaohongshu",
            Self::Pinterest => "pinterest",
            Self::YtDlp => "yt_dlp",
        }
    }
}

#[derive(Clone, Copy)]
enum DownloadOutcomeCategory {
    DirectSuccess,
    DirectFailedThenYtdlpSuccess,
    NonDirectSuccess,
    AllFailed,
    Cancelled,
}

impl DownloadOutcomeCategory {
    fn as_str(self) -> &'static str {
        match self {
            Self::DirectSuccess => "direct_success",
            Self::DirectFailedThenYtdlpSuccess => "direct_failed_then_ytdlp_success",
            Self::NonDirectSuccess => "non_direct_success",
            Self::AllFailed => "all_failed",
            Self::Cancelled => "cancelled",
        }
    }
}

fn stage_error(stage: &str, message: &str) -> String {
    format!("[{}] {}", stage, message)
}

fn direct_route_for_platform(platform: DirectPlatform) -> DownloadRoute {
    match platform {
        DirectPlatform::Douyin => DownloadRoute::DirectDouyin,
        DirectPlatform::Xiaohongshu => DownloadRoute::DirectXiaohongshu,
    }
}

fn success_outcome_for_route_chain(
    route_chain: &[DownloadRoute],
    final_route: DownloadRoute,
) -> DownloadOutcomeCategory {
    if final_route == DownloadRoute::YtDlp
        && matches!(
            route_chain.first(),
            Some(DownloadRoute::DirectDouyin | DownloadRoute::DirectXiaohongshu)
        )
    {
        return DownloadOutcomeCategory::DirectFailedThenYtdlpSuccess;
    }

    if matches!(
        final_route,
        DownloadRoute::DirectDouyin | DownloadRoute::DirectXiaohongshu
    ) {
        return DownloadOutcomeCategory::DirectSuccess;
    }

    DownloadOutcomeCategory::NonDirectSuccess
}

fn now_timestamp_ms() -> u128 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis(),
        Err(_) => 0,
    }
}

fn set_runtime_log_dir(app: &AppHandle) {
    match get_logs_dir(app) {
        Ok(log_dir) => {
            *RUNTIME_LOG_DIR.lock().unwrap() = Some(log_dir);
        }
        Err(err) => {
            println!(">>> [Rust] Runtime log dir init failed: {}", err);
        }
    }
}

fn runtime_log_path(log_dir: &Path) -> PathBuf {
    log_dir.join(RUNTIME_LOG_FILE_NAME)
}

fn runtime_log_rotated_path(log_dir: &Path) -> PathBuf {
    log_dir.join(RUNTIME_LOG_ROTATED_FILE_NAME)
}

fn sanitize_runtime_text(value: &str) -> String {
    value
        .replace(['\r', '\n'], " | ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn summarize_url_for_log(raw: &str) -> String {
    if let Ok(parsed) = url::Url::parse(raw) {
        let mut summary = parsed.host_str().unwrap_or("unknown-host").to_string();
        let trimmed_path = parsed.path().trim_matches('/');
        if !trimmed_path.is_empty() {
            let path_preview = trimmed_path
                .split('/')
                .take(2)
                .collect::<Vec<_>>()
                .join("/");
            summary.push('/');
            summary.push_str(path_preview.as_str());
        }
        return summary;
    }

    let sanitized = sanitize_runtime_text(raw);
    sanitized.chars().take(120).collect()
}

fn rotate_runtime_log_if_needed(log_dir: &Path) -> Result<(), String> {
    let log_path = runtime_log_path(log_dir);
    let metadata = match fs::metadata(&log_path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(format!("Failed to stat runtime log: {}", err)),
    };

    if metadata.len() < RUNTIME_LOG_MAX_BYTES {
        return Ok(());
    }

    let rotated_path = runtime_log_rotated_path(log_dir);
    if rotated_path.exists() {
        fs::remove_file(&rotated_path)
            .map_err(|err| format!("Failed to remove rotated runtime log: {}", err))?;
    }
    fs::rename(&log_path, &rotated_path)
        .map_err(|err| format!("Failed to rotate runtime log: {}", err))?;
    Ok(())
}

fn append_runtime_log_line(line: &str) {
    let Some(log_dir) = RUNTIME_LOG_DIR.lock().unwrap().clone() else {
        return;
    };

    let _lock = RUNTIME_LOG_WRITE_LOCK.lock().unwrap();
    if let Err(err) = fs::create_dir_all(&log_dir) {
        println!(">>> [Rust] Runtime log mkdir failed: {}", err);
        return;
    }
    if let Err(err) = rotate_runtime_log_if_needed(&log_dir) {
        println!(">>> [Rust] Runtime log rotation failed: {}", err);
        return;
    }

    let log_path = runtime_log_path(&log_dir);
    match fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        Ok(mut file) => {
            if let Err(err) = writeln!(file, "{}", line) {
                println!(">>> [Rust] Runtime log append failed: {}", err);
            }
        }
        Err(err) => {
            println!(">>> [Rust] Runtime log open failed: {}", err);
        }
    }
}

fn append_runtime_log_event(
    scope: &str,
    event: &str,
    trace_id: Option<&str>,
    payload: serde_json::Value,
) {
    let mut object = serde_json::Map::new();
    object.insert("tsMs".to_string(), serde_json::json!(now_timestamp_ms()));
    object.insert("scope".to_string(), serde_json::json!(scope));
    object.insert("event".to_string(), serde_json::json!(event));
    if let Some(trace_id) = trace_id {
        object.insert("traceId".to_string(), serde_json::json!(trace_id));
    }
    object.insert("payload".to_string(), payload);

    match serde_json::to_string(&serde_json::Value::Object(object)) {
        Ok(line) => append_runtime_log_line(line.as_str()),
        Err(err) => println!(">>> [Rust] Runtime log serialize failed: {}", err),
    }
}

fn clear_runtime_progress_log_state(trace_id: &str) {
    RUNTIME_LOG_PROGRESS_STATE.lock().unwrap().remove(trace_id);
}

fn maybe_log_runtime_progress(
    trace_id: &str,
    stage: DownloadProgressStage,
    percent: f32,
    speed: &str,
    eta: &str,
) {
    let stage_name = stage.as_str();
    let now_ms = now_timestamp_ms();
    let percent_bucket = if percent >= 0.0 {
        Some((percent / RUNTIME_LOG_PROGRESS_BUCKET_PERCENT).floor() as i32)
    } else {
        None
    };

    let should_log = {
        let mut state_map = RUNTIME_LOG_PROGRESS_STATE.lock().unwrap();
        let state = state_map.entry(trace_id.to_string()).or_default();
        let stage_changed = state.last_stage != Some(stage_name);
        let bucket_changed = percent_bucket != state.last_percent_bucket;
        let interval_elapsed =
            now_ms.saturating_sub(state.last_logged_at_ms) >= RUNTIME_LOG_PROGRESS_MIN_INTERVAL_MS;
        let should_log = stage_changed || bucket_changed || interval_elapsed;

        if should_log {
            state.last_stage = Some(stage_name);
            state.last_percent_bucket = percent_bucket;
            state.last_logged_at_ms = now_ms;
        }

        should_log
    };

    if should_log {
        append_runtime_log_event(
            "download",
            "progress",
            Some(trace_id),
            serde_json::json!({
                "stage": stage_name,
                "percent": if percent >= 0.0 {
                    Some(((percent * 10.0).round()) / 10.0)
                } else {
                    None::<f32>
                },
                "speed": sanitize_runtime_text(speed),
                "eta": sanitize_runtime_text(eta),
            }),
        );
    }
}

fn excerpt_runtime_lines(raw: &str, max_lines: usize) -> Vec<String> {
    let mut lines = raw
        .lines()
        .map(sanitize_runtime_text)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.len() > max_lines {
        lines.drain(..lines.len() - max_lines);
    }
    lines
}

fn read_runtime_log_lines(log_dir: &Path) -> Vec<String> {
    let mut lines = Vec::new();

    for path in [runtime_log_rotated_path(log_dir), runtime_log_path(log_dir)] {
        if let Ok(content) = fs::read_to_string(path) {
            lines.extend(content.lines().map(|line| line.to_string()));
        }
    }

    lines
}

fn next_download_trace_id() -> String {
    let seq = DOWNLOAD_TRACE_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("dl-{}-{}", now_timestamp_ms(), seq)
}

fn video_task_total_count(state: &VideoTaskQueueState) -> usize {
    state.pending.len() + state.active_trace_ids.len()
}

fn build_video_queue_count_payload(state: &VideoTaskQueueState) -> VideoQueueCountPayload {
    VideoQueueCountPayload {
        active_count: state.active_trace_ids.len(),
        pending_count: state.pending.len(),
        total_count: video_task_total_count(state),
        max_concurrent: MAX_CONCURRENT_VIDEO_DOWNLOADS,
    }
}

fn build_video_queue_detail_payload(state: &VideoTaskQueueState) -> VideoQueueDetailPayload {
    let mut tasks = Vec::with_capacity(video_task_total_count(state));

    tasks.extend(state.active.iter().map(|task| VideoQueueTaskPayload {
        trace_id: task.trace_id().to_string(),
        label: task.label(),
        status: VideoQueueTaskStatus::Active,
    }));

    tasks.extend(state.pending.iter().map(|task| VideoQueueTaskPayload {
        trace_id: task.trace_id().to_string(),
        label: task.label(),
        status: VideoQueueTaskStatus::Pending,
    }));

    VideoQueueDetailPayload { tasks }
}

fn emit_video_queue_state(
    app: &AppHandle,
    count_payload: VideoQueueCountPayload,
    detail_payload: VideoQueueDetailPayload,
) {
    println!(
        ">>> [Rust] Video queue count updated: active={}, pending={}, total={}, max={}",
        count_payload.active_count,
        count_payload.pending_count,
        count_payload.total_count,
        count_payload.max_concurrent
    );
    let _ = app.emit("video-queue-count", count_payload);
    let _ = app.emit("video-queue-detail", detail_payload);
}

fn mark_video_task_active(app: &AppHandle, task: QueuedVideoTask) {
    let (count_payload, detail_payload) = {
        let mut state = VIDEO_TASK_QUEUE_STATE.lock().unwrap();
        let trace_id = task.trace_id().to_string();
        if state.active_trace_ids.insert(trace_id) {
            state.active.push_back(task);
        }
        (
            build_video_queue_count_payload(&state),
            build_video_queue_detail_payload(&state),
        )
    };
    emit_video_queue_state(app, count_payload, detail_payload);
}

fn mark_video_task_complete(app: &AppHandle, trace_id: &str) {
    let (count_payload, detail_payload) = {
        let mut state = VIDEO_TASK_QUEUE_STATE.lock().unwrap();
        state.active_trace_ids.remove(trace_id);
        state.active.retain(|task| task.trace_id() != trace_id);
        (
            build_video_queue_count_payload(&state),
            build_video_queue_detail_payload(&state),
        )
    };
    emit_video_queue_state(app, count_payload, detail_payload);
}

fn enqueue_video_task(app: &AppHandle, task: QueuedVideoTask) {
    let (count_payload, detail_payload) = {
        let mut state = VIDEO_TASK_QUEUE_STATE.lock().unwrap();
        state.pending.push_back(task);
        (
            build_video_queue_count_payload(&state),
            build_video_queue_detail_payload(&state),
        )
    };
    emit_video_queue_state(app, count_payload, detail_payload);
}

fn schedule_video_task_queue_pump(app: AppHandle) {
    let should_spawn = {
        let mut state = VIDEO_TASK_QUEUE_STATE.lock().unwrap();
        if state.pump_scheduled {
            false
        } else {
            state.pump_scheduled = true;
            true
        }
    };

    if should_spawn {
        tokio::spawn(async move {
            process_video_task_queue(app).await;
        });
    }
}

fn try_start_next_video_task(app: &AppHandle) -> Option<QueuedVideoTask> {
    let queued = {
        let mut state = VIDEO_TASK_QUEUE_STATE.lock().unwrap();
        if state.pending.is_empty()
            || state.active_trace_ids.len() >= MAX_CONCURRENT_VIDEO_DOWNLOADS
        {
            state.pump_scheduled = false;
            None
        } else {
            let task = state.pending.pop_front()?;
            state.active_trace_ids.insert(task.trace_id().to_string());
            state.active.push_back(task.clone());
            Some((
                task,
                build_video_queue_count_payload(&state),
                build_video_queue_detail_payload(&state),
            ))
        }
    };

    if let Some((task, count_payload, detail_payload)) = queued {
        emit_video_queue_state(app, count_payload, detail_payload);
        Some(task)
    } else {
        None
    }
}

fn register_download_child(trace_id: &str, pid: u32) {
    DOWNLOAD_CHILDREN
        .lock()
        .unwrap()
        .insert(trace_id.to_string(), pid);
}

fn clear_download_child(trace_id: &str) {
    DOWNLOAD_CHILDREN.lock().unwrap().remove(trace_id);
}

fn is_download_cancelled(trace_id: &str) -> bool {
    DOWNLOAD_CANCELLED.lock().unwrap().contains(trace_id)
}

fn clear_download_runtime(trace_id: &str) {
    clear_download_child(trace_id);
    DOWNLOAD_CANCELLED.lock().unwrap().remove(trace_id);
}

fn remove_pending_video_task(app: &AppHandle, trace_id: &str) -> bool {
    let payloads = {
        let mut state = VIDEO_TASK_QUEUE_STATE.lock().unwrap();
        let original_len = state.pending.len();
        state.pending.retain(|task| task.trace_id() != trace_id);
        if state.pending.len() == original_len {
            None
        } else {
            Some((
                build_video_queue_count_payload(&state),
                build_video_queue_detail_payload(&state),
            ))
        }
    };

    if let Some((count_payload, detail_payload)) = payloads {
        emit_video_queue_state(app, count_payload, detail_payload);
        true
    } else {
        false
    }
}

async fn execute_queued_video_task(app: AppHandle, task: QueuedVideoTask) {
    match task {
        QueuedVideoTask::Douyin {
            page_url,
            title,
            cookies_header,
            cookies_path,
            direct_candidates,
            ytdlp_quality,
            ae_friendly_conversion_enabled,
            trace_id,
        } => {
            if let Err(err) = download_platform_direct_with_retry(
                app.clone(),
                DirectPlatform::Douyin,
                page_url,
                title,
                cookies_header,
                cookies_path,
                direct_candidates,
                ytdlp_quality,
                ae_friendly_conversion_enabled,
                trace_id.clone(),
            )
            .await
            {
                println!(">>> [Rust] Douyin direct pipeline error: {}", err);
                let result = DownloadResult {
                    trace_id: trace_id.clone(),
                    success: false,
                    file_path: None,
                    error: Some(err),
                };
                let _ = app.emit("video-download-complete", result);
            }
        }
        QueuedVideoTask::Xiaohongshu {
            page_url,
            title,
            cookies_header,
            cookies_path,
            direct_candidates,
            ytdlp_quality,
            ae_friendly_conversion_enabled,
            trace_id,
        } => {
            if let Err(err) = download_platform_direct_with_retry(
                app.clone(),
                DirectPlatform::Xiaohongshu,
                page_url,
                title,
                cookies_header,
                cookies_path,
                direct_candidates,
                ytdlp_quality,
                ae_friendly_conversion_enabled,
                trace_id.clone(),
            )
            .await
            {
                println!(">>> [Rust] Xiaohongshu direct pipeline error: {}", err);
                let result = DownloadResult {
                    trace_id: trace_id.clone(),
                    success: false,
                    file_path: None,
                    error: Some(err),
                };
                let _ = app.emit("video-download-complete", result);
            }
        }
        QueuedVideoTask::Pinterest {
            page_url,
            title,
            cookies_header,
            cookies_path,
            video_url_hint,
            video_candidates,
            trace_id,
        } => {
            let pinterest_cookies_header =
                cookies_header.or_else(|| cookies_path.as_ref().and_then(cookies_file_to_header));
            let result = download_pinterest_video(
                app.clone(),
                page_url,
                title,
                pinterest_cookies_header,
                video_url_hint,
                video_candidates,
                trace_id.clone(),
            )
            .await;
            cleanup_extension_cookies_file(&cookies_path);
            if let Err(err) = result {
                println!(">>> [Rust] Pinterest download pipeline error: {}", err);
                let result = DownloadResult {
                    trace_id: trace_id.clone(),
                    success: false,
                    file_path: None,
                    error: Some(err),
                };
                let _ = app.emit("video-download-complete", result);
            }
        }
        QueuedVideoTask::Smart {
            url,
            title,
            cookies_path,
            clip_range,
            ytdlp_quality,
            ae_friendly_conversion_enabled,
            trace_id,
        } => {
            if let Err(err) = download_video_smart(
                app.clone(),
                url,
                title,
                cookies_path,
                clip_range,
                ytdlp_quality,
                ae_friendly_conversion_enabled,
                Some(trace_id.clone()),
                None,
            )
            .await
            {
                println!(">>> [Rust] Smart download error: {}", err);
                let result = DownloadResult {
                    trace_id: trace_id.clone(),
                    success: false,
                    file_path: None,
                    error: Some(err),
                };
                let _ = app.emit("video-download-complete", result);
            }
        }
    }
}

async fn process_video_task_queue(app: AppHandle) {
    while let Some(task) = try_start_next_video_task(&app) {
        let runner_app = app.clone();
        tokio::spawn(async move {
            let trace_id = task.trace_id().to_string();
            execute_queued_video_task(runner_app.clone(), task).await;
            clear_download_runtime(trace_id.as_str());
            mark_video_task_complete(&runner_app, trace_id.as_str());
            schedule_video_task_queue_pump(runner_app);
        });
    }
}

fn is_cancelled_error(err: &str) -> bool {
    err.to_ascii_lowercase().contains("cancelled")
}

fn log_download_trace(trace_id: &str, stage: &str, payload: serde_json::Value) {
    let event = serde_json::json!({
        "traceId": trace_id,
        "stage": stage,
        "tsMs": now_timestamp_ms(),
        "payload": payload,
    });
    println!(">>> [DownloadTrace] {}", event);
    append_runtime_log_event("download_trace", stage, Some(trace_id), event);
}

fn log_terminal_outcome(
    trace_id: &str,
    category: DownloadOutcomeCategory,
    final_route: Option<DownloadRoute>,
    route_chain: &[DownloadRoute],
    duration_ms: u128,
    error: Option<&str>,
) {
    let chain: Vec<&str> = route_chain.iter().map(|route| route.as_str()).collect();
    log_download_trace(
        trace_id,
        "terminal",
        serde_json::json!({
            "outcome": category.as_str(),
            "finalRoute": final_route.map(|route| route.as_str()),
            "routeChain": chain,
            "durationMs": duration_ms,
            "error": error,
        }),
    );
}

async fn download_direct_for_platform(
    app: AppHandle,
    platform: DirectPlatform,
    video_url: String,
    cookies_header: Option<String>,
    title: Option<String>,
    trace_id: String,
) -> Result<DownloadResult, String> {
    match platform {
        DirectPlatform::Douyin => {
            download_douyin_direct(app, video_url, cookies_header, title, trace_id).await
        }
        DirectPlatform::Xiaohongshu => {
            download_xiaohongshu_direct(app, video_url, cookies_header, title, trace_id).await
        }
    }
}

async fn download_platform_direct_with_retry(
    app: AppHandle,
    platform: DirectPlatform,
    page_url: String,
    title: Option<String>,
    cookies_header: Option<String>,
    extension_cookies_path: Option<PathBuf>,
    direct_candidates: Vec<SelectedDirectCandidate>,
    ytdlp_quality: YtdlpQualityPreference,
    ae_friendly_conversion_enabled: bool,
    trace_id: String,
) -> Result<DownloadResult, String> {
    let direct_route = direct_route_for_platform(platform);
    let started_at = std::time::Instant::now();
    let max_direct_attempts = std::cmp::min(2, direct_candidates.len());

    let candidate_origins: Vec<&str> = direct_candidates
        .iter()
        .map(|candidate| candidate.origin)
        .collect();
    log_download_trace(
        &trace_id,
        "direct_candidate_policy",
        serde_json::json!({
            "platform": platform.as_str(),
            "policy": "cache_then_videoUrl_then_videoCandidates",
            "candidateCount": direct_candidates.len(),
            "candidateOrigins": candidate_origins,
            "maxDirectAttempts": max_direct_attempts,
        }),
    );

    if max_direct_attempts == 0 {
        log_download_trace(
            &trace_id,
            "route_selected",
            serde_json::json!({
                "route": "smart_router",
                "platform": platform.as_str(),
                "reason": "no_direct_candidate",
                "stage": "select",
            }),
        );
        return download_video_smart(
            app,
            page_url,
            title,
            extension_cookies_path,
            None,
            ytdlp_quality,
            ae_friendly_conversion_enabled,
            Some(trace_id),
            None,
        )
        .await
        .map_err(|err| stage_error("fallback", err.as_str()));
    }

    let mut first_error: Option<String> = None;
    for attempt_idx in 0..max_direct_attempts {
        let attempt = attempt_idx + 1;
        let selected = &direct_candidates[attempt_idx];
        log_download_trace(
            &trace_id,
            "route_selected",
            serde_json::json!({
                "route": direct_route.as_str(),
                "platform": platform.as_str(),
                "attempt": attempt,
                "source": selected.origin,
                "candidateType": selected.candidate_type,
                "candidateSource": selected.source,
                "candidateConfidence": selected.confidence,
            }),
        );
        log_download_trace(
            &trace_id,
            "attempt_start",
            serde_json::json!({
                "attempt": attempt,
                "route": direct_route.as_str(),
                "stage": "download",
                "source": selected.origin,
            }),
        );

        match download_direct_for_platform(
            app.clone(),
            platform,
            selected.url.clone(),
            cookies_header.clone(),
            title.clone(),
            trace_id.clone(),
        )
        .await
        {
            Ok(result) if result.success => {
                let cache_key =
                    put_direct_candidate_cache(platform, page_url.as_str(), selected.url.as_str());
                if let Some(key) = cache_key {
                    log_download_trace(
                        &trace_id,
                        "direct_cache_update",
                        serde_json::json!({
                            "platform": platform.as_str(),
                            "cacheKey": key,
                            "source": selected.origin,
                            "ttlMs": DIRECT_CANDIDATE_CACHE_TTL_MS,
                        }),
                    );
                }
                let route_chain = [direct_route];
                log_terminal_outcome(
                    &trace_id,
                    DownloadOutcomeCategory::DirectSuccess,
                    Some(direct_route),
                    &route_chain,
                    started_at.elapsed().as_millis(),
                    None,
                );
                return Ok(result);
            }
            Ok(result) => {
                let staged_error = stage_error(
                    "download",
                    result
                        .error
                        .as_deref()
                        .unwrap_or("Direct downloader returned unsuccessful result"),
                );
                if is_cancelled_error(staged_error.as_str()) {
                    let route_chain = [direct_route];
                    log_terminal_outcome(
                        &trace_id,
                        DownloadOutcomeCategory::Cancelled,
                        Some(direct_route),
                        &route_chain,
                        started_at.elapsed().as_millis(),
                        Some(staged_error.as_str()),
                    );
                    return Ok(result);
                }
                if first_error.is_none() {
                    first_error = Some(staged_error.clone());
                }
                log_download_trace(
                    &trace_id,
                    "attempt_failed",
                    serde_json::json!({
                        "attempt": attempt,
                        "route": direct_route.as_str(),
                        "stage": "download",
                        "error": staged_error,
                    }),
                );
            }
            Err(err) => {
                let staged_error = stage_error("download", err.as_str());
                if is_cancelled_error(staged_error.as_str()) {
                    let route_chain = [direct_route];
                    log_terminal_outcome(
                        &trace_id,
                        DownloadOutcomeCategory::Cancelled,
                        Some(direct_route),
                        &route_chain,
                        started_at.elapsed().as_millis(),
                        Some(staged_error.as_str()),
                    );
                    return Err(staged_error);
                }
                if first_error.is_none() {
                    first_error = Some(staged_error.clone());
                }
                log_download_trace(
                    &trace_id,
                    "attempt_failed",
                    serde_json::json!({
                        "attempt": attempt,
                        "route": direct_route.as_str(),
                        "stage": "download",
                        "error": staged_error,
                    }),
                );
            }
        }
    }

    log_download_trace(
        &trace_id,
        "fallback_selected",
        serde_json::json!({
            "fromRoute": direct_route.as_str(),
            "stage": "fallback",
            "reason": "direct_attempt_failed",
            "error": first_error,
        }),
    );
    download_video_smart(
        app,
        page_url,
        title,
        extension_cookies_path,
        None,
        ytdlp_quality,
        ae_friendly_conversion_enabled,
        Some(trace_id),
        Some(vec![direct_route]),
    )
    .await
    .map_err(|err| stage_error("fallback", err.as_str()))
}

async fn download_pinterest_video(
    app: AppHandle,
    page_url: String,
    title: Option<String>,
    cookies_header: Option<String>,
    video_url_hint: Option<String>,
    video_candidates: Vec<ExtensionVideoCandidate>,
    trace_id: String,
) -> Result<DownloadResult, String> {
    use tauri_plugin_shell::process::CommandEvent;

    println!(">>> [Rust] Starting Pinterest download: {}", page_url);
    log_download_trace(
        &trace_id,
        "route_selected",
        serde_json::json!({
            "route": DownloadRoute::Pinterest.as_str(),
            "reason": "pinterest_pin_url",
            "pageUrl": page_url,
        }),
    );

    let _ = app.emit(
        "video-download-progress",
        DownloadProgress {
            trace_id: trace_id.clone(),
            percent: -1.0,
            stage: DownloadProgressStage::Preparing,
            speed: "Resolving pin...".to_string(),
            eta: "".to_string(),
        },
    );
    maybe_log_runtime_progress(
        trace_id.as_str(),
        DownloadProgressStage::Preparing,
        -1.0,
        "Resolving pin...",
        "",
    );

    let hinted_video_url =
        select_pinterest_hint_video_url(video_url_hint.as_deref(), &video_candidates);
    let resolved_result = resolve_pinterest_pin_media(
        page_url.as_str(),
        cookies_header.as_deref(),
        trace_id.as_str(),
    )
    .await;

    let mut used_hint_only_fallback = false;
    let resolved = match resolved_result {
        Ok(resolved) => resolved,
        Err(resolve_err) => {
            let Some(fallback_video_url) = hinted_video_url.clone() else {
                log_download_trace(
                    &trace_id,
                    "pinterest_hint_fallback_unavailable",
                    serde_json::json!({
                        "reason": "resolver_failed_without_usable_hint",
                        "resolverError": resolve_err,
                        "videoCandidatesCount": video_candidates.len(),
                    }),
                );
                clear_runtime_progress_log_state(trace_id.as_str());
                return Err(stage_error("resolve", resolve_err.as_str()));
            };

            let fallback_title = title.clone().filter(|value| !value.trim().is_empty());
            let fallback_media = build_minimal_pinterest_media_from_hint(
                page_url.as_str(),
                fallback_title,
                fallback_video_url.clone(),
            )
            .map_err(|err| {
                clear_runtime_progress_log_state(trace_id.as_str());
                stage_error("resolve", err.as_str())
            })?;

            used_hint_only_fallback = true;
            log_download_trace(
                &trace_id,
                "pinterest_hint_fallback_selected",
                serde_json::json!({
                    "pinId": fallback_media.pin_id,
                    "videoUrl": summarize_url_for_log(&fallback_video_url),
                    "reason": "resolver_failed",
                    "resolverError": resolve_err,
                    "videoCandidatesCount": video_candidates.len(),
                }),
            );
            fallback_media
        }
    };

    let resolved_title = title
        .filter(|value| !value.trim().is_empty())
        .or_else(|| resolved.title.clone());
    let prefer_hint_video = hinted_video_url.as_deref().is_some_and(|video_url| {
        !used_hint_only_fallback
            && should_prefer_pinterest_hint_video_url(video_url, resolved.video.as_ref())
    });
    let video_asset = if used_hint_only_fallback {
        resolved.video.clone().unwrap_or(PinterestVideoAsset {
            url: hinted_video_url.clone().unwrap_or_default(),
            width: None,
            height: None,
            duration_seconds: None,
            poster_url: None,
        })
    } else if prefer_hint_video {
        let video_url = hinted_video_url.clone().unwrap_or_default();
        log_download_trace(
            &trace_id,
            "pinterest_extension_hint_selected",
            serde_json::json!({
                "pinId": resolved.pin_id,
                "videoUrl": summarize_url_for_log(&video_url),
                "source": "extension_hint",
                "policy": if resolved.video.is_some() {
                    "prefer_direct_hint_over_manifest_resolved"
                } else {
                    "use_hint_without_resolved_video"
                },
                "resolvedVideoUrl": resolved.video.as_ref().map(|video| summarize_url_for_log(&video.url)),
                "videoCandidatesCount": video_candidates.len(),
            }),
        );
        build_pinterest_hint_video_asset(video_url, &resolved)
    } else if let Some(video_asset) = resolved.video.clone() {
        video_asset
    } else {
        append_runtime_log_event(
            "download",
            "complete",
            Some(trace_id.as_str()),
            serde_json::json!({
                "mode": "pinterest",
                "success": false,
                "error": "Pinterest pin does not contain a downloadable video",
            }),
        );
        clear_runtime_progress_log_state(trace_id.as_str());
        return Err(stage_error(
            "resolve",
            "Pinterest pin does not contain a downloadable video",
        ));
    };

    log_download_trace(
        &trace_id,
        "pinterest_candidate_selected",
        serde_json::json!({
            "pinId": resolved.pin_id,
            "imageUrl": summarize_url_for_log(&resolved.image.url),
            "videoUrl": summarize_url_for_log(&video_asset.url),
            "title": resolved_title,
        }),
    );

    let mut runtime_payload = resolved.clone();
    runtime_payload.title = resolved_title.clone();
    runtime_payload.video = Some(video_asset.clone());
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|err| format!("Failed to parse config: {}", err))?;
    let output_dir = config
        .get("outputPath")
        .and_then(|value| value.as_str())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            desktop_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("FlowSelect_Received")
        });
    if !output_dir.exists() {
        fs::create_dir_all(&output_dir)
            .map_err(|err| format!("Failed to create output directory: {}", err))?;
    }

    let runtime_payload = PinterestRuntimePayload {
        trace_id: trace_id.clone(),
        page_url: page_url.clone(),
        media: runtime_payload,
        cookies_header: cookies_header.filter(|value| !value.trim().is_empty()),
        output_dir: output_dir.to_string_lossy().to_string(),
    };

    let runtime_input_path = std::env::temp_dir().join(format!(
        "flowselect_pinterest_{}_{}.json",
        runtime_payload.media.pin_id, trace_id
    ));
    let runtime_input_json = serde_json::to_vec(&runtime_payload)
        .map_err(|err| format!("Failed to serialize Pinterest downloader payload: {}", err))?;
    fs::write(&runtime_input_path, runtime_input_json)
        .map_err(|err| format!("Failed to write Pinterest downloader payload: {}", err))?;

    append_runtime_log_event(
        "download",
        "start",
        Some(trace_id.as_str()),
        serde_json::json!({
            "mode": "pinterest",
            "pageUrl": summarize_url_for_log(&page_url),
            "pinId": runtime_payload.media.pin_id,
            "hasVideo": true,
            "videoUrl": summarize_url_for_log(&video_asset.url),
            "outputDir": output_dir.to_string_lossy().to_string(),
        }),
    );

    let downloader_path = match pinterest_downloader_binary_path(&app) {
        Ok(path) => path,
        Err(err) => {
            let _ = fs::remove_file(&runtime_input_path);
            append_runtime_log_event(
                "download",
                "complete",
                Some(trace_id.as_str()),
                serde_json::json!({
                    "mode": "pinterest",
                    "success": false,
                    "error": err,
                }),
            );
            clear_runtime_progress_log_state(trace_id.as_str());
            return Err(stage_error("runtime_spawn", err.as_str()));
        }
    };

    let shell = app.shell();
    let runtime_args = vec![
        "--input-json".to_string(),
        runtime_input_path.to_string_lossy().to_string(),
    ];
    let (mut rx, child) = match shell
        .command(downloader_path.to_string_lossy().to_string())
        .args(runtime_args)
        .env("PATH", build_env_path_with_ffmpeg(&app))
        .spawn()
    {
        Ok(result) => result,
        Err(err) => {
            let _ = fs::remove_file(&runtime_input_path);
            append_runtime_log_event(
                "download",
                "complete",
                Some(trace_id.as_str()),
                serde_json::json!({
                    "mode": "pinterest",
                    "success": false,
                    "error": format!(
                        "Failed to spawn Pinterest downloader at {:?}: {}",
                        downloader_path, err
                    ),
                }),
            );
            clear_runtime_progress_log_state(trace_id.as_str());
            return Err(stage_error(
                "runtime_spawn",
                format!(
                    "Failed to spawn Pinterest downloader at {:?}: {}",
                    downloader_path, err
                )
                .as_str(),
            ));
        }
    };

    register_download_child(trace_id.as_str(), child.pid());
    log_download_trace(
        &trace_id,
        "pinterest_sidecar_spawn",
        serde_json::json!({
            "binary": downloader_path.to_string_lossy().to_string(),
            "payloadPath": runtime_input_path.to_string_lossy().to_string(),
        }),
    );

    let mut stdout_buffer = String::new();
    let mut stderr_buffer = String::new();
    let mut final_file_path: Option<String> = None;
    let mut last_runtime_output_at = std::time::Instant::now();

    loop {
        match tokio::time::timeout(
            std::time::Duration::from_millis(YTDLP_WATCHDOG_TICK_MILLIS),
            rx.recv(),
        )
        .await
        {
            Ok(Some(event)) => match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).trim().to_string();
                    if line_str.is_empty() {
                        continue;
                    }
                    last_runtime_output_at = std::time::Instant::now();

                    stdout_buffer.push_str(&line_str);
                    stdout_buffer.push('\n');

                    if let Some(rest) = line_str.strip_prefix("FLOWSELECT_PINTEREST_PROGRESS\t") {
                        let parts: Vec<&str> = rest.split('\t').collect();
                        let done = parts
                            .first()
                            .and_then(|value| value.parse::<f32>().ok())
                            .unwrap_or(0.0);
                        let total = parts
                            .get(1)
                            .and_then(|value| value.parse::<f32>().ok())
                            .filter(|value| *value > 0.0)
                            .unwrap_or(1.0);
                        let percent = ((done / total) * 100.0).clamp(0.0, 100.0);
                        let speed = if percent >= 100.0 {
                            "Finalizing...".to_string()
                        } else {
                            "Downloading...".to_string()
                        };
                        let _ = app.emit(
                            "video-download-progress",
                            DownloadProgress {
                                trace_id: trace_id.clone(),
                                percent,
                                stage: DownloadProgressStage::Downloading,
                                speed: speed.clone(),
                                eta: "N/A".to_string(),
                            },
                        );
                        maybe_log_runtime_progress(
                            trace_id.as_str(),
                            DownloadProgressStage::Downloading,
                            percent,
                            speed.as_str(),
                            "N/A",
                        );
                        continue;
                    }

                    if let Some(stage_name) = line_str.strip_prefix("FLOWSELECT_PINTEREST_STAGE\t")
                    {
                        let stage_name = stage_name.trim();
                        log_download_trace(
                            &trace_id,
                            "pinterest_sidecar_stage",
                            serde_json::json!({
                                "stage": stage_name,
                            }),
                        );

                        let stage = match stage_name {
                            "preparing" => Some(DownloadProgressStage::Preparing),
                            "downloading" => Some(DownloadProgressStage::Downloading),
                            "completed" => Some(DownloadProgressStage::PostProcessing),
                            _ => None,
                        };

                        if let Some(stage) = stage {
                            let percent = if stage == DownloadProgressStage::PostProcessing {
                                100.0
                            } else {
                                -1.0
                            };
                            let speed = stage.label().to_string();
                            let _ = app.emit(
                                "video-download-progress",
                                DownloadProgress {
                                    trace_id: trace_id.clone(),
                                    percent,
                                    stage,
                                    speed: speed.clone(),
                                    eta: "".to_string(),
                                },
                            );
                            maybe_log_runtime_progress(
                                trace_id.as_str(),
                                stage,
                                percent,
                                speed.as_str(),
                                "",
                            );
                        }
                        continue;
                    }

                    if let Some(path) = line_str.strip_prefix("FLOWSELECT_PINTEREST_RESULT\t") {
                        final_file_path = Some(path.trim().to_string());
                        continue;
                    }

                    println!(">>> [Pinterest downloader stdout] {}", line_str);
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line).trim().to_string();
                    if line_str.is_empty() {
                        continue;
                    }
                    last_runtime_output_at = std::time::Instant::now();
                    stderr_buffer.push_str(&line_str);
                    stderr_buffer.push('\n');
                    println!(">>> [Pinterest downloader stderr] {}", line_str);
                }
                CommandEvent::Terminated(payload) => {
                    clear_download_child(trace_id.as_str());
                    let _ = fs::remove_file(&runtime_input_path);

                    if is_download_cancelled(trace_id.as_str()) {
                        if let Some(path) = final_file_path.as_ref() {
                            let _ = fs::remove_file(path);
                        }
                        append_runtime_log_event(
                            "download",
                            "complete",
                            Some(trace_id.as_str()),
                            serde_json::json!({
                                "mode": "pinterest",
                                "success": false,
                                "error": "Download cancelled",
                            }),
                        );
                        clear_runtime_progress_log_state(trace_id.as_str());
                        return Err("Download cancelled".to_string());
                    }

                    if payload.code == Some(0) {
                        if let Some(file_path) = final_file_path
                            .clone()
                            .filter(|path| PathBuf::from(path).exists())
                        {
                            let result = DownloadResult {
                                trace_id: trace_id.clone(),
                                success: true,
                                file_path: Some(file_path.clone()),
                                error: None,
                            };
                            let _ = app.emit("video-download-complete", result.clone());
                            append_runtime_log_event(
                                "download",
                                "complete",
                                Some(trace_id.as_str()),
                                serde_json::json!({
                                    "mode": "pinterest",
                                    "success": true,
                                    "filePath": file_path,
                                }),
                            );
                            clear_runtime_progress_log_state(trace_id.as_str());

                            let app_for_ae = app.clone();
                            let file_path_for_ae = result.file_path.clone().unwrap_or_default();
                            tokio::spawn(async move {
                                let _ = send_to_ae(app_for_ae, file_path_for_ae).await;
                            });

                            return Ok(result);
                        }

                        append_runtime_log_event(
                            "download",
                            "complete",
                            Some(trace_id.as_str()),
                            serde_json::json!({
                                "mode": "pinterest",
                                "success": false,
                                "error": "Pinterest downloader exited successfully but produced no output path",
                            }),
                        );
                        clear_runtime_progress_log_state(trace_id.as_str());
                        return Err(stage_error(
                            "runtime_exit",
                            "Pinterest downloader exited successfully but produced no output path",
                        ));
                    }

                    let runtime_error = stderr_buffer
                        .lines()
                        .find(|line| !line.trim().is_empty())
                        .or_else(|| stdout_buffer.lines().find(|line| !line.trim().is_empty()))
                        .unwrap_or("Pinterest downloader exited with an unknown error");
                    append_runtime_log_event(
                        "download",
                        "complete",
                        Some(trace_id.as_str()),
                        serde_json::json!({
                            "mode": "pinterest",
                            "success": false,
                            "error": runtime_error,
                            "exitCode": payload.code,
                        }),
                    );
                    clear_runtime_progress_log_state(trace_id.as_str());
                    return Err(stage_error(
                        "runtime_exit",
                        format!(
                            "Pinterest downloader exited with code {:?}: {}",
                            payload.code, runtime_error
                        )
                        .as_str(),
                    ));
                }
                _ => {}
            },
            Ok(None) => break,
            Err(_) => {}
        }

        if is_download_cancelled(trace_id.as_str()) {
            terminate_download_child_process_with_grace(trace_id.as_str()).await;
            let _ = fs::remove_file(&runtime_input_path);
            clear_runtime_progress_log_state(trace_id.as_str());
            return Err("Download cancelled".to_string());
        }

        if std::time::Instant::now().duration_since(last_runtime_output_at)
            > std::time::Duration::from_secs(PINTEREST_RUNTIME_STALL_TIMEOUT_SECS)
        {
            terminate_download_child_process_with_grace(trace_id.as_str()).await;
            let _ = fs::remove_file(&runtime_input_path);
            append_runtime_log_event(
                "download",
                "complete",
                Some(trace_id.as_str()),
                serde_json::json!({
                    "mode": "pinterest",
                    "success": false,
                    "error": "Pinterest downloader stalled with no output",
                }),
            );
            clear_runtime_progress_log_state(trace_id.as_str());
            return Err(stage_error(
                "runtime_watchdog",
                "Pinterest downloader stalled with no output",
            ));
        }
    }

    clear_download_child(trace_id.as_str());
    let _ = fs::remove_file(&runtime_input_path);
    append_runtime_log_event(
        "download",
        "complete",
        Some(trace_id.as_str()),
        serde_json::json!({
            "mode": "pinterest",
            "success": false,
            "error": "Pinterest downloader ended unexpectedly",
        }),
    );
    clear_runtime_progress_log_state(trace_id.as_str());
    Err(stage_error(
        "runtime_exit",
        "Pinterest downloader ended unexpectedly",
    ))
}

/// Internal download function that supports both extension cookies and browser cookies
async fn download_video_internal(
    app: AppHandle,
    url: String,
    extension_cookies_path: Option<PathBuf>,
    clip_range: Option<ClipTimeRange>,
    source_title: Option<String>,
    ytdlp_quality: YtdlpQualityPreference,
    ae_friendly_conversion_enabled: bool,
    trace_id: String,
    policy: YtdlpInvocationPolicy,
) -> Result<DownloadResult, String> {
    use tauri_plugin_shell::process::CommandEvent;

    println!(">>> [Rust] Starting video download: {}", url);
    println!(
        ">>> [Rust] yt-dlp quality preference: {}",
        ytdlp_quality.as_str()
    );

    // Get config
    let config_str = get_config(app.clone())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    // Get output directory
    let base_output_dir = config
        .get("outputPath")
        .and_then(|v| v.as_str())
        .map(|s| std::path::PathBuf::from(s))
        .unwrap_or_else(|| {
            desktop_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("FlowSelect_Received")
        });

    let output_dir = base_output_dir;

    // Create output directory if not exists
    if !output_dir.exists() {
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let rename_media_on_download = is_rename_media_enabled(&config);
    let clip_download_mode = ClipDownloadMode::from_config(&config);

    append_runtime_log_event(
        "download",
        "start",
        Some(trace_id.as_str()),
        serde_json::json!({
            "mode": "yt-dlp",
            "url": summarize_url_for_log(&url),
            "quality": ytdlp_quality.as_str(),
            "aeFriendlyConversionEnabled": ae_friendly_conversion_enabled,
            "clipMode": clip_download_mode.as_str(),
            "hasClipRange": clip_range.is_some(),
            "renameEnabled": rename_media_on_download,
            "ignoreConfig": true,
            "resumeArtifactsDisabled": policy.disable_resume_artifacts,
            "outputDir": output_dir.to_string_lossy().to_string(),
        }),
    );

    if let Some(clip_range_ref) = clip_range.as_ref() {
        let cache_key = build_slice_source_cache_key(&url, ytdlp_quality);
        let should_use_slice_cache_pipeline =
            should_attempt_slice_source_reuse(cache_key.as_str(), now_timestamp_ms());
        if should_use_slice_cache_pipeline {
            match try_slice_download_with_reuse(
                &app,
                &url,
                &extension_cookies_path,
                ytdlp_quality,
                cache_key.as_str(),
                &output_dir,
                &mut config,
                rename_media_on_download,
                clip_range_ref,
                source_title.clone(),
                trace_id.as_str(),
            )
            .await
            {
                Ok(file_path) => {
                    cleanup_extension_cookies_file(&extension_cookies_path);
                    let result = finalize_ytdlp_success(
                        &app,
                        trace_id.as_str(),
                        file_path,
                        ae_friendly_conversion_enabled,
                    )
                    .await;
                    return Ok(result);
                }
                Err(err) => {
                    if is_cancelled_error(err.as_str()) {
                        cleanup_extension_cookies_file(&extension_cookies_path);
                        let result = DownloadResult {
                            trace_id: trace_id.clone(),
                            success: false,
                            file_path: None,
                            error: Some(with_terminal_error_code(
                                DownloadTerminalErrorCode::Cancelled,
                                "Download cancelled",
                            )),
                        };
                        let _ = app.emit("video-download-complete", result.clone());
                        return Ok(result);
                    }
                    println!(
                        ">>> [Rust] Slice cache reuse failed, fallback to incremental slicing: {}",
                        err
                    );
                }
            }
        }
    }

    let output_template = if rename_media_on_download {
        let rename_stem = get_next_rename_sequence_stem(&app, &mut config, &output_dir)?;
        output_dir.join(format!("{}.%(ext)s", rename_stem))
    } else if let Some(range) = clip_range.as_ref() {
        let prefix = build_clip_range_ms_prefix(range);
        output_dir.join(format!("{}_%(title)s.%(ext)s", prefix))
    } else {
        output_dir.join("%(title)s.%(ext)s")
    };

    let ytdlp_temp_dir = std::env::temp_dir().join(YTDLP_TEMP_DIR_NAME);
    fs::create_dir_all(&ytdlp_temp_dir)
        .map_err(|e| format!("Failed to create yt-dlp temp directory: {}", e))?;
    let reported_output_path_file =
        ytdlp_temp_dir.join(format!("{}-reported-output-path.txt", trace_id));
    let _ = fs::remove_file(&reported_output_path_file);
    let ffmpeg_location = match ffmpeg_location_for_ytdlp(&app) {
        Ok(location) => location,
        Err(err) => {
            cleanup_extension_cookies_file(&extension_cookies_path);
            let _ = fs::remove_file(&reported_output_path_file);
            return Err(err);
        }
    };

    // Build args
    let mut args = vec![
        "-f".to_string(),
        ytdlp_quality.format_selector().to_string(),
        "--merge-output-format".to_string(),
        ytdlp_quality.merge_output_format().to_string(),
        "--ffmpeg-location".to_string(),
        ffmpeg_location,
        "--no-keep-video".to_string(),
        "--newline".to_string(),
        "--progress".to_string(),
        // 使用 tv 变体解决 YouTube player 签名问题
        "--extractor-args".to_string(),
        "youtube:player_js_variant=tv".to_string(),
        // Enable both Node and Deno JavaScript runtimes for YouTube challenges.
        "--js-runtimes".to_string(),
        "node".to_string(),
        "--js-runtimes".to_string(),
        "deno".to_string(),
        // Let yt-dlp fetch EJS solver assets for better YouTube compatibility.
        "--remote-components".to_string(),
        "ejs:github".to_string(),
        "--encoding".to_string(),
        "utf-8".to_string(),
        "--print-to-file".to_string(),
        "after_move:filepath".to_string(),
        reported_output_path_file.to_string_lossy().to_string(),
        "-o".to_string(),
        output_template.to_string_lossy().to_string(),
    ];
    append_ytdlp_runtime_guard_args(&mut args, policy.disable_resume_artifacts);
    if let Some(format_sort) = ytdlp_quality.format_sort() {
        args.push("-S".to_string());
        args.push(format_sort.to_string());
    }

    // Use extension-provided cookies (from browser extension).
    if let Some(ref cookies_path) = extension_cookies_path {
        if cookies_path.exists() {
            args.push("--cookies".to_string());
            args.push(cookies_path.to_string_lossy().to_string());
            if is_youtube_url(&url) {
                println!(
                    ">>> [Rust] Using extension cookies for YouTube URL from: {:?}",
                    cookies_path
                );
            } else {
                println!(
                    ">>> [Rust] Using extension cookies from: {:?}",
                    cookies_path
                );
            }
        }
    }

    if let Some(range) = clip_range.as_ref() {
        let start = format_seconds_for_download_section(range.start_seconds);
        let end = format_seconds_for_download_section(range.end_seconds);
        println!(
            ">>> [Rust] Section download enabled: {} -> {}, mode={}",
            start,
            end,
            clip_download_mode.as_str()
        );
        args.push("--download-sections".to_string());
        args.push(format!("*{}-{}", start, end));
    }

    args.push(url.clone());

    // 构建环境变量，将 Deno 目录添加到 PATH
    let mut env_path = std::env::var("PATH").unwrap_or_default();
    if let Ok(deno_path) = get_deno_path(&app) {
        if let Some(deno_dir) = deno_path.parent() {
            if deno_path.exists() {
                // Windows 使用分号，macOS/Linux 使用冒号分隔 PATH
                #[cfg(target_os = "windows")]
                let separator = ";";
                #[cfg(not(target_os = "windows"))]
                let separator = ":";
                env_path = format!("{}{}{}", deno_dir.to_string_lossy(), separator, env_path);
                println!(">>> [Rust] Added Deno to PATH: {:?}", deno_dir);
            }
        }
    }

    // Emit "preparing" event to show indeterminate progress
    let _ = app.emit(
        "video-download-progress",
        DownloadProgress {
            trace_id: trace_id.clone(),
            percent: -1.0, // Negative value indicates indeterminate state
            stage: DownloadProgressStage::Preparing,
            speed: "Preparing...".to_string(),
            eta: "".to_string(),
        },
    );
    maybe_log_runtime_progress(
        trace_id.as_str(),
        DownloadProgressStage::Preparing,
        -1.0,
        "Preparing...",
        "",
    );

    let ytdlp_path = match ytdlp_binary_path(&app) {
        Ok(path) => path,
        Err(resolve_err) => {
            cleanup_extension_cookies_file(&extension_cookies_path);
            cleanup_part_files_for_output_root(&output_dir);
            let _ = fs::remove_file(&reported_output_path_file);
            let result = emit_download_terminal_failure(
                &app,
                trace_id.as_str(),
                DownloadTerminalErrorCode::YtdlpSpawnFailure,
                &format!("Failed to resolve yt-dlp binary path: {}", resolve_err),
            );
            return Ok(result);
        }
    };

    // Spawn yt-dlp process
    let shell = app.shell();
    let (mut rx, child) = match shell
        .command(ytdlp_path.to_string_lossy().to_string())
        .args(&args)
        .env("PATH", &env_path)
        .spawn()
    {
        Ok(result) => result,
        Err(spawn_err) => {
            cleanup_extension_cookies_file(&extension_cookies_path);
            cleanup_part_files_for_output_root(&output_dir);
            let _ = fs::remove_file(&reported_output_path_file);
            let result = emit_download_terminal_failure(
                &app,
                trace_id.as_str(),
                DownloadTerminalErrorCode::YtdlpSpawnFailure,
                &format!("Failed to spawn yt-dlp at {:?}: {}", ytdlp_path, spawn_err),
            );
            return Ok(result);
        }
    };

    // Store child process PID for cancellation
    register_download_child(trace_id.as_str(), child.pid());

    let mut stdout_buffer = String::new();
    let mut stderr_buffer = String::new();
    let mut last_file_path: Option<String> = None;
    let mut last_stage = DownloadProgressStage::Preparing;
    let mut heartbeat_state = YtdlpHeartbeatState::default();
    let mut last_hard_heartbeat_at = std::time::Instant::now();
    let mut last_soft_heartbeat_at = Some(std::time::Instant::now());
    let mut captured_artifact_paths = HashSet::new();

    // Process events from yt-dlp
    loop {
        match tokio::time::timeout(
            std::time::Duration::from_millis(YTDLP_WATCHDOG_TICK_MILLIS),
            rx.recv(),
        )
        .await
        {
            Ok(Some(event)) => match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    println!(">>> [yt-dlp] {}", line_str);
                    stdout_buffer.push_str(&line_str);
                    stdout_buffer.push('\n');
                    let heartbeat_event = process_ytdlp_output_line(
                        &app,
                        &line_str,
                        &mut last_file_path,
                        &mut last_stage,
                        &mut heartbeat_state,
                        &mut captured_artifact_paths,
                        trace_id.as_str(),
                    );
                    let now = std::time::Instant::now();
                    if heartbeat_event.hard_heartbeat {
                        last_hard_heartbeat_at = now;
                        last_soft_heartbeat_at = None;
                    }
                    if heartbeat_event.soft_heartbeat {
                        last_soft_heartbeat_at = Some(now);
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    println!(">>> [yt-dlp stderr] {}", line_str);
                    stderr_buffer.push_str(&line_str);
                    stderr_buffer.push('\n');
                    let heartbeat_event = process_ytdlp_output_line(
                        &app,
                        &line_str,
                        &mut last_file_path,
                        &mut last_stage,
                        &mut heartbeat_state,
                        &mut captured_artifact_paths,
                        trace_id.as_str(),
                    );
                    let now = std::time::Instant::now();
                    if heartbeat_event.hard_heartbeat {
                        last_hard_heartbeat_at = now;
                        last_soft_heartbeat_at = None;
                    }
                    if heartbeat_event.soft_heartbeat {
                        last_soft_heartbeat_at = Some(now);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    // Clear download PID
                    clear_download_child(trace_id.as_str());

                    let was_cancelled = is_download_cancelled(trace_id.as_str());
                    let success = payload.code == Some(0) && !was_cancelled;
                    if !success {
                        cleanup_part_files_for_output_root(&output_dir);
                        cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
                    }
                    if was_cancelled {
                        cleanup_extension_cookies_file(&extension_cookies_path);
                        cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
                        if let Some(ref final_path) = last_file_path {
                            let _ = std::fs::remove_file(final_path);
                        }
                    }
                    if !success
                        && policy.allow_http_416_retry
                        && !policy.disable_resume_artifacts
                        && should_retry_ytdlp_without_resume(&stderr_buffer)
                    {
                        println!(
                            ">>> [Rust] yt-dlp failed with HTTP 416, retrying once with resume artifacts disabled"
                        );
                        append_runtime_log_event(
                            "download",
                            "http_416_retry",
                            Some(trace_id.as_str()),
                            serde_json::json!({
                                "reason": "http_416",
                                "disableResumeArtifacts": true,
                            }),
                        );
                        if let Some(ref final_path) = last_file_path {
                            let _ = std::fs::remove_file(final_path);
                        }
                        cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
                        let _ = fs::remove_file(&reported_output_path_file);
                        return Box::pin(download_video_internal(
                            app.clone(),
                            url.clone(),
                            extension_cookies_path.clone(),
                            clip_range.clone(),
                            source_title.clone(),
                            ytdlp_quality,
                            ae_friendly_conversion_enabled,
                            trace_id.clone(),
                            YtdlpInvocationPolicy {
                                allow_youtube_cookie_retry: policy.allow_youtube_cookie_retry,
                                allow_http_416_retry: false,
                                disable_resume_artifacts: true,
                            },
                        ))
                        .await;
                    }
                    if !success
                        && policy.allow_youtube_cookie_retry
                        && is_youtube_url(&url)
                        && extension_cookies_path.is_some()
                        && should_retry_youtube_without_cookies(&stderr_buffer)
                    {
                        cleanup_extension_cookies_file(&extension_cookies_path);
                        println!(
                            ">>> [Rust] YouTube cookies-backed yt-dlp attempt failed with challenge/no-format symptoms, retrying without cookies"
                        );
                        append_runtime_log_event(
                            "download",
                            "youtube_cookie_retry",
                            Some(trace_id.as_str()),
                            serde_json::json!({
                                "reason": "challenge_or_format_failure",
                            }),
                        );
                        if let Some(ref final_path) = last_file_path {
                            let _ = std::fs::remove_file(final_path);
                        }
                        cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
                        let _ = fs::remove_file(&reported_output_path_file);
                        return Box::pin(download_video_internal(
                            app.clone(),
                            url.clone(),
                            None,
                            clip_range.clone(),
                            source_title.clone(),
                            ytdlp_quality,
                            ae_friendly_conversion_enabled,
                            trace_id.clone(),
                            YtdlpInvocationPolicy {
                                allow_youtube_cookie_retry: false,
                                allow_http_416_retry: policy.allow_http_416_retry,
                                disable_resume_artifacts: policy.disable_resume_artifacts,
                            },
                        ))
                        .await;
                    }
                    cleanup_extension_cookies_file(&extension_cookies_path);
                    let result = DownloadResult {
                        trace_id: trace_id.clone(),
                        success,
                        file_path: if success {
                            last_file_path
                                .clone()
                                .or_else(|| Some(output_dir.to_string_lossy().to_string()))
                        } else {
                            None
                        },
                        error: if success {
                            None
                        } else if was_cancelled {
                            Some(with_terminal_error_code(
                                DownloadTerminalErrorCode::Cancelled,
                                "Download cancelled",
                            ))
                        } else if stderr_buffer.trim().is_empty() {
                            Some(with_terminal_error_code(
                                DownloadTerminalErrorCode::YtdlpExitFailure,
                                "yt-dlp exited unexpectedly",
                            ))
                        } else {
                            Some(with_terminal_error_code(
                                DownloadTerminalErrorCode::YtdlpExitFailure,
                                stderr_buffer.as_str(),
                            ))
                        },
                    };
                    if success {
                        let final_output_path = last_file_path
                            .clone()
                            .filter(|path| Path::new(path).exists())
                            .or_else(|| read_ytdlp_reported_output_path(&reported_output_path_file))
                            .or_else(|| last_file_path.clone());
                        let Some(ref path) = final_output_path else {
                            let _ = fs::remove_file(&reported_output_path_file);
                            let result = emit_download_terminal_failure(
                                &app,
                                trace_id.as_str(),
                                DownloadTerminalErrorCode::OutputNormalizationFailed,
                                "yt-dlp completed without a final output path",
                            );
                            append_runtime_log_event(
                                "download",
                                "terminal_excerpt",
                                Some(trace_id.as_str()),
                                serde_json::json!({
                                    "stdoutTail": excerpt_runtime_lines(&stdout_buffer, 8),
                                    "stderrTail": excerpt_runtime_lines(&stderr_buffer, 12),
                                }),
                            );
                            return Ok(result);
                        };
                        if last_file_path.as_deref() != Some(path.as_str()) {
                            println!(
                                ">>> [Rust] Recovered yt-dlp final output path from report file: {}",
                                path
                            );
                        }
                        cleanup_captured_ytdlp_artifacts(
                            &captured_artifact_paths,
                            Some(Path::new(path)),
                        );
                        let _ = fs::remove_file(&reported_output_path_file);
                        let result = finalize_ytdlp_success(
                            &app,
                            trace_id.as_str(),
                            path.clone(),
                            ae_friendly_conversion_enabled,
                        )
                        .await;
                        if !result.success {
                            append_runtime_log_event(
                                "download",
                                "terminal_excerpt",
                                Some(trace_id.as_str()),
                                serde_json::json!({
                                    "stdoutTail": excerpt_runtime_lines(&stdout_buffer, 8),
                                    "stderrTail": excerpt_runtime_lines(&stderr_buffer, 12),
                                }),
                            );
                        }
                        return Ok(result);
                    }

                    let _ = fs::remove_file(&reported_output_path_file);
                    let _ = app.emit("video-download-complete", result.clone());
                    append_runtime_log_event(
                        "download",
                        "complete",
                        Some(trace_id.as_str()),
                        serde_json::json!({
                            "mode": "yt-dlp",
                            "success": false,
                            "wasCancelled": was_cancelled,
                            "filePath": result.file_path.clone(),
                            "error": result.error.clone(),
                        }),
                    );
                    append_runtime_log_event(
                        "download",
                        "terminal_excerpt",
                        Some(trace_id.as_str()),
                        serde_json::json!({
                            "stdoutTail": excerpt_runtime_lines(&stdout_buffer, 8),
                            "stderrTail": excerpt_runtime_lines(&stderr_buffer, 12),
                        }),
                    );
                    clear_runtime_progress_log_state(trace_id.as_str());
                    return Ok(result);
                }
                _ => {}
            },
            Ok(None) => break,
            Err(_) => {}
        }

        let now = std::time::Instant::now();
        if mark_hard_heartbeat_from_output_growth(&last_file_path, &mut heartbeat_state) {
            last_hard_heartbeat_at = now;
            last_soft_heartbeat_at = None;
        }

        if is_watchdog_timeout_candidate(last_hard_heartbeat_at, last_soft_heartbeat_at, now) {
            let hard_elapsed_secs = now.duration_since(last_hard_heartbeat_at).as_secs();
            let soft_elapsed_secs =
                last_soft_heartbeat_at.map(|soft_at| now.duration_since(soft_at).as_secs());
            println!(
                ">>> [Rust] Watchdog timeout candidate: hard_elapsed={}s, soft_elapsed={:?}",
                hard_elapsed_secs, soft_elapsed_secs
            );
            terminate_download_child_process_with_grace(trace_id.as_str()).await;
            cleanup_extension_cookies_file(&extension_cookies_path);
            cleanup_part_files_for_output_root(&output_dir);
            cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
            let _ = fs::remove_file(&reported_output_path_file);
            let was_cancelled = is_download_cancelled(trace_id.as_str());
            let result = DownloadResult {
                trace_id: trace_id.clone(),
                success: false,
                file_path: None,
                error: Some(if was_cancelled {
                    with_terminal_error_code(
                        DownloadTerminalErrorCode::Cancelled,
                        "Download cancelled",
                    )
                } else {
                    let stall_message = format!(
                        "Download stalled: no hard heartbeat for {} seconds",
                        hard_elapsed_secs
                    );
                    with_terminal_error_code(
                        DownloadTerminalErrorCode::WatchdogHardStall,
                        stall_message.as_str(),
                    )
                }),
            };
            let _ = app.emit("video-download-complete", result.clone());
            append_runtime_log_event(
                "download",
                "complete",
                Some(trace_id.as_str()),
                serde_json::json!({
                    "mode": "yt-dlp",
                    "success": false,
                    "error": result.error.clone(),
                    "watchdogHardElapsedSec": hard_elapsed_secs,
                }),
            );
            append_runtime_log_event(
                "download",
                "terminal_excerpt",
                Some(trace_id.as_str()),
                serde_json::json!({
                    "stdoutTail": excerpt_runtime_lines(&stdout_buffer, 8),
                    "stderrTail": excerpt_runtime_lines(&stderr_buffer, 12),
                }),
            );
            clear_runtime_progress_log_state(trace_id.as_str());
            return Ok(result);
        }
    }

    // Fallback if loop exits without Terminated event
    cleanup_extension_cookies_file(&extension_cookies_path);
    cleanup_part_files_for_output_root(&output_dir);
    cleanup_captured_ytdlp_artifacts(&captured_artifact_paths, None);
    let _ = fs::remove_file(&reported_output_path_file);
    clear_download_child(trace_id.as_str());
    let was_cancelled = is_download_cancelled(trace_id.as_str());
    let result = DownloadResult {
        trace_id,
        success: false,
        file_path: None,
        error: Some(if was_cancelled {
            with_terminal_error_code(DownloadTerminalErrorCode::Cancelled, "Download cancelled")
        } else {
            with_terminal_error_code(
                DownloadTerminalErrorCode::YtdlpUnexpectedEnd,
                "Process ended unexpectedly",
            )
        }),
    };
    // Emit complete event with error to close progress bar
    let _ = app.emit("video-download-complete", result.clone());
    append_runtime_log_event(
        "download",
        "complete",
        Some(result.trace_id.as_str()),
        serde_json::json!({
            "mode": "yt-dlp",
            "success": false,
            "error": result.error.clone(),
        }),
    );
    append_runtime_log_event(
        "download",
        "terminal_excerpt",
        Some(result.trace_id.as_str()),
        serde_json::json!({
            "stdoutTail": excerpt_runtime_lines(&stdout_buffer, 8),
            "stderrTail": excerpt_runtime_lines(&stderr_buffer, 12),
        }),
    );
    clear_runtime_progress_log_state(result.trace_id.as_str());
    Ok(result)
}

fn kill_download_child_process(trace_id: &str) {
    if let Some(pid) = DOWNLOAD_CHILDREN.lock().unwrap().remove(trace_id) {
        println!(">>> [Rust] Force killing yt-dlp process with PID: {}", pid);
        force_kill_process(pid);
    }
}

fn request_graceful_stop(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T"])
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output();
    }
}

fn force_kill_process(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-KILL", &pid.to_string()])
            .output();
    }
}

fn is_process_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        if let Ok(output) = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
            return output.status.success()
                && !stdout.contains("no tasks are running")
                && stdout.contains(&pid.to_string());
        }
        false
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

async fn terminate_download_child_process_with_grace(trace_id: &str) {
    let pid = DOWNLOAD_CHILDREN.lock().unwrap().remove(trace_id);
    if let Some(pid) = pid {
        println!(
            ">>> [Rust] Watchdog timeout: requesting graceful stop for PID {}",
            pid
        );
        request_graceful_stop(pid);
        tokio::time::sleep(tokio::time::Duration::from_millis(
            YTDLP_TERMINATION_GRACE_MILLIS,
        ))
        .await;
        if is_process_alive(pid) {
            println!(
                ">>> [Rust] Graceful stop timed out, force killing PID {}",
                pid
            );
            force_kill_process(pid);
        } else {
            println!(">>> [Rust] Graceful stop completed for PID {}", pid);
        }
    }
}

fn cleanup_extension_cookies_file(extension_cookies_path: &Option<PathBuf>) {
    if let Some(cookies_path) = extension_cookies_path {
        if let Err(err) = fs::remove_file(cookies_path) {
            println!(
                ">>> [Rust] Warning: Failed to cleanup extension cookies: {}",
                err
            );
        } else {
            println!(">>> [Rust] Cleaned up extension cookies file");
        }
    }
}

fn cleanup_part_files_in_dirs(dirs: &[PathBuf]) {
    for output_dir in dirs {
        if let Ok(entries) = fs::read_dir(output_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.to_ascii_lowercase())
                    .unwrap_or_default();
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                let is_part_artifact = ext == "part"
                    || ext == "ytdl"
                    || ext.starts_with("part-frag")
                    || file_name.contains(".part-frag");

                if is_part_artifact {
                    println!(">>> [Rust] Deleting temp file: {:?}", path);
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }
}

fn cleanup_part_files_for_output_root(output_root: &Path) {
    let dirs_to_check = vec![
        output_root.to_path_buf(),
        output_root.join("Videos"),
        std::env::temp_dir().join(YTDLP_TEMP_DIR_NAME),
    ];
    cleanup_part_files_in_dirs(&dirs_to_check);
}

/// Public command for downloading video (used by frontend paste/drag)
#[tauri::command]
async fn download_video(app: AppHandle, url: String) -> Result<DownloadResult, String> {
    let trace_id = next_download_trace_id();
    let preferences = resolve_video_download_preferences(&app)?;
    let task = QueuedVideoTask::Smart {
        url: url.clone(),
        title: None,
        cookies_path: None,
        clip_range: None,
        ytdlp_quality: preferences.ytdlp_quality,
        ae_friendly_conversion_enabled: preferences.ae_friendly_conversion_enabled,
        trace_id: trace_id.clone(),
    };
    mark_video_task_active(&app, task);
    let result = download_video_internal(
        app.clone(),
        url,
        None,
        None,
        None,
        preferences.ytdlp_quality,
        preferences.ae_friendly_conversion_enabled,
        trace_id.clone(),
        YtdlpInvocationPolicy {
            allow_youtube_cookie_retry: false,
            allow_http_416_retry: true,
            disable_resume_artifacts: false,
        },
    )
    .await;
    clear_download_runtime(trace_id.as_str());
    mark_video_task_complete(&app, trace_id.as_str());
    result
}

#[tauri::command]
async fn queue_video_download(
    app: AppHandle,
    url: String,
    page_url: Option<String>,
    video_url: Option<String>,
    video_candidates: Option<Vec<QueueVideoCandidateInput>>,
    drag_diagnostic: Option<QueuePinterestDragDiagnosticInput>,
) -> Result<QueuedVideoDownloadAck, String> {
    let trace_id = next_download_trace_id();
    let preferences = resolve_video_download_preferences(&app)?;
    let pinterest_page_url = page_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| url.clone());
    let normalized_video_url_hint = video_url.as_deref().and_then(normalize_video_candidate_url);
    let normalized_video_candidates = normalize_command_video_candidates(video_candidates);
    let queued_task = if is_pinterest_url(&pinterest_page_url) || is_pinterest_url(&url) {
        log_download_trace(
            &trace_id,
            "pinterest_queue_request",
            serde_json::json!({
                "url": url,
                "pageUrl": pinterest_page_url,
                "hasVideoUrlHint": normalized_video_url_hint.is_some(),
                "videoUrlHint": normalized_video_url_hint
                    .as_ref()
                    .map(|value| summarize_url_for_log(value)),
                "videoCandidatesCount": normalized_video_candidates.len(),
                "videoCandidateUrls": normalized_video_candidates
                    .iter()
                    .take(6)
                    .map(|candidate| summarize_url_for_log(&candidate.url))
                    .collect::<Vec<String>>(),
                "dragDiagnostic": drag_diagnostic.as_ref().map(|value| serde_json::json!({
                    "htmlLength": value.html_length,
                    "htmlPreview": value.html_preview,
                    "flags": {
                        "hasVideoTag": value.flags.has_video_tag,
                        "hasVideoList": value.flags.has_video_list,
                        "hasStoryPinData": value.flags.has_story_pin_data,
                        "hasCarouselData": value.flags.has_carousel_data,
                        "hasMp4": value.flags.has_mp4,
                        "hasM3u8": value.flags.has_m3u8,
                        "hasCmfv": value.flags.has_cmfv,
                        "hasPinimgVideoHost": value.flags.has_pinimg_video_host,
                    },
                    "imageUrl": value.image_url.as_ref().map(|url| summarize_url_for_log(url)),
                    "videoUrl": value.video_url.as_ref().map(|url| summarize_url_for_log(url)),
                    "videoCandidatesCount": value.video_candidates_count,
                })),
            }),
        );
        QueuedVideoTask::Pinterest {
            page_url: pinterest_page_url,
            title: None,
            cookies_header: None,
            cookies_path: None,
            video_url_hint: normalized_video_url_hint,
            video_candidates: normalized_video_candidates,
            trace_id: trace_id.clone(),
        }
    } else {
        QueuedVideoTask::Smart {
            url,
            title: None,
            cookies_path: None,
            clip_range: None,
            ytdlp_quality: preferences.ytdlp_quality,
            ae_friendly_conversion_enabled: preferences.ae_friendly_conversion_enabled,
            trace_id: trace_id.clone(),
        }
    };
    enqueue_video_task(&app, queued_task);
    schedule_video_task_queue_pump(app);
    Ok(QueuedVideoDownloadAck {
        accepted: true,
        trace_id,
    })
}

#[tauri::command]
async fn cancel_download(app: AppHandle, trace_id: String) -> Result<bool, String> {
    println!(
        ">>> [Rust] cancel_download called for trace_id={}",
        trace_id
    );

    let target_trace_id = trace_id.trim();
    if target_trace_id.is_empty() {
        return Ok(false);
    }

    if remove_pending_video_task(&app, target_trace_id) {
        let result = DownloadResult {
            trace_id: target_trace_id.to_string(),
            success: false,
            file_path: None,
            error: Some(with_terminal_error_code(
                DownloadTerminalErrorCode::Cancelled,
                "Download cancelled",
            )),
        };
        let _ = app.emit("video-download-complete", result);
        return Ok(true);
    }

    let is_active = {
        let state = VIDEO_TASK_QUEUE_STATE.lock().unwrap();
        state.active_trace_ids.contains(target_trace_id)
    };

    if !is_active {
        return Ok(false);
    }

    {
        let mut cancelled = DOWNLOAD_CANCELLED.lock().unwrap();
        cancelled.insert(target_trace_id.to_string());
    }

    // 1. 终止下载进程 (for yt-dlp)
    kill_download_child_process(target_trace_id);

    // 2. 等待进程完全终止
    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;

    // 3. 清理临时文件
    Ok(true)
}

/// Get browser cookies database path (Windows)
/// Save cookies from browser extension to a temporary Netscape format file
fn save_extension_cookies(cookies_str: &str) -> Result<PathBuf, String> {
    let temp_dir = std::env::temp_dir();
    let cookies_path = temp_dir.join("flowselect_extension_cookies.txt");

    let content = format!(
        "# Netscape HTTP Cookie File\n# Generated by FlowSelect\n\n{}",
        cookies_str
    );

    fs::write(&cookies_path, content)
        .map_err(|e| format!("Failed to write cookies file: {}", e))?;

    println!(">>> [Rust] Saved extension cookies to: {:?}", cookies_path);
    Ok(cookies_path)
}

/// Check if URL is a Douyin video URL
fn is_douyin_url(url: &str) -> bool {
    url.contains("douyin.com/video/")
        || url.contains("v.douyin.com")
        || url.contains("douyinvod.com")
}

/// Check if URL is a direct Douyin CDN media link
fn is_douyin_cdn_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("douyinvod.com")
        || lower.contains("douyincdn.com")
        || lower.contains("bytedance.com")
}

/// Check if URL is a Xiaohongshu page URL
fn is_xiaohongshu_url(url: &str) -> bool {
    url.contains("xiaohongshu.com") || url.contains("xhslink.com")
}

/// Check if URL is a direct Xiaohongshu CDN media link
fn is_xiaohongshu_cdn_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("xhscdn.com") && !lower.contains(".m3u8")
}

fn is_pinterest_url(url: &str) -> bool {
    url.to_ascii_lowercase().contains("pinterest.com/pin/")
}

fn extract_pinterest_pin_id(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let segments: Vec<&str> = parsed
        .path_segments()?
        .filter(|segment| !segment.is_empty())
        .collect();
    if segments.len() < 2 || segments.first().copied() != Some("pin") {
        return None;
    }

    let pin_id = segments[1];
    if pin_id.chars().all(|value| value.is_ascii_digit()) {
        Some(pin_id.to_string())
    } else {
        None
    }
}

fn pinterest_value_as_string(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(inner) => Some(inner.clone()),
        serde_json::Value::Number(inner) => Some(inner.to_string()),
        _ => None,
    }
}

fn pinterest_object_score(value: &serde_json::Value) -> usize {
    let Some(object) = value.as_object() else {
        return 0;
    };

    let mut score = 0usize;
    if object.get("videos").is_some() {
        score += 120;
    }
    if object.get("carousel_data").is_some() {
        score += 80;
    }
    if object.get("story_pin_data").is_some() {
        score += 60;
    }
    if object.get("images").is_some() {
        score += 24;
    }
    score
}

fn pinterest_collect_pin_objects(
    value: &serde_json::Value,
    pin_id: &str,
    matches: &mut Vec<serde_json::Value>,
) {
    match value {
        serde_json::Value::Object(map) => {
            let id_matches = map
                .get("id")
                .and_then(pinterest_value_as_string)
                .is_some_and(|value| value == pin_id);
            if id_matches && pinterest_object_score(value) > 0 {
                matches.push(value.clone());
            }

            for child in map.values() {
                pinterest_collect_pin_objects(child, pin_id, matches);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                pinterest_collect_pin_objects(item, pin_id, matches);
            }
        }
        _ => {}
    }
}

fn parse_pinterest_image_asset_entry(value: &serde_json::Value) -> Option<PinterestImageAsset> {
    let url = value.get("url").and_then(|inner| inner.as_str())?.trim();
    if url.is_empty() {
        return None;
    }

    Some(PinterestImageAsset {
        url: url.to_string(),
        width: value
            .get("width")
            .and_then(|inner| inner.as_u64())
            .and_then(|inner| u32::try_from(inner).ok()),
        height: value
            .get("height")
            .and_then(|inner| inner.as_u64())
            .and_then(|inner| u32::try_from(inner).ok()),
    })
}

fn parse_pinterest_image_asset(value: &serde_json::Value) -> Option<PinterestImageAsset> {
    let preferred_keys = ["orig", "736x", "600x315", "564x", "474x", "236x"];

    if let Some(images) = value.get("images").and_then(|inner| inner.as_object()) {
        for key in preferred_keys {
            if let Some(image) = images.get(key).and_then(parse_pinterest_image_asset_entry) {
                return Some(image);
            }
        }

        for image in images.values() {
            if let Some(asset) = parse_pinterest_image_asset_entry(image) {
                return Some(asset);
            }
        }
    }

    value
        .get("image")
        .and_then(parse_pinterest_image_asset_entry)
}

fn pinterest_video_variant_score(value: &serde_json::Value) -> u64 {
    let width = value
        .get("width")
        .and_then(|inner| inner.as_u64())
        .unwrap_or(0);
    let height = value
        .get("height")
        .and_then(|inner| inner.as_u64())
        .unwrap_or(0);
    let url = value
        .get("url")
        .and_then(|inner| inner.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let format_bonus = if is_pinterest_direct_mp4_url(url.as_str()) {
        5_000_000_000
    } else if is_pinterest_manifest_hint_url(url.as_str()) {
        3_000_000_000
    } else if is_pinterest_manifest_like_url(url.as_str()) {
        1_000_000_000
    } else {
        0
    };

    format_bonus + (width.saturating_mul(height))
}

fn parse_pinterest_video_asset_from_video_list(
    video_list: &serde_json::Value,
    poster_url: Option<String>,
) -> Option<PinterestVideoAsset> {
    let variants = video_list.as_object()?;
    let best_variant = variants
        .values()
        .filter(|variant| {
            variant
                .get("url")
                .and_then(|inner| inner.as_str())
                .is_some()
        })
        .max_by_key(|variant| pinterest_video_variant_score(variant))?;

    Some(PinterestVideoAsset {
        url: best_variant
            .get("url")
            .and_then(|inner| inner.as_str())?
            .to_string(),
        width: best_variant
            .get("width")
            .and_then(|inner| inner.as_u64())
            .and_then(|inner| u32::try_from(inner).ok()),
        height: best_variant
            .get("height")
            .and_then(|inner| inner.as_u64())
            .and_then(|inner| u32::try_from(inner).ok()),
        duration_seconds: best_variant
            .get("duration")
            .and_then(|inner| inner.as_u64()),
        poster_url,
    })
}

fn pinterest_video_asset_score(asset: &PinterestVideoAsset) -> u64 {
    let width = asset.width.unwrap_or(0) as u64;
    let height = asset.height.unwrap_or(0) as u64;
    let format_bonus = if is_pinterest_direct_mp4_url(asset.url.as_str()) {
        5_000_000_000
    } else if is_pinterest_manifest_hint_url(asset.url.as_str()) {
        3_000_000_000
    } else if is_pinterest_manifest_like_url(asset.url.as_str()) {
        1_000_000_000
    } else {
        0
    };

    format_bonus + width.saturating_mul(height)
}

fn extract_pinterest_title(value: &serde_json::Value) -> Option<String> {
    for key in [
        "grid_title",
        "title",
        "seo_description",
        "description",
        "auto_alt_text",
    ] {
        if let Some(title) = value
            .get(key)
            .and_then(|inner| inner.as_str())
            .map(|inner| inner.trim())
            .filter(|inner| !inner.is_empty())
        {
            return Some(title.to_string());
        }
    }

    None
}

fn build_pinterest_hint_video_asset(
    hint_url: String,
    resolved: &PinterestResolvedMedia,
) -> PinterestVideoAsset {
    let poster_url = resolved
        .video
        .as_ref()
        .and_then(|video| video.poster_url.clone())
        .or_else(|| Some(resolved.image.url.clone()));

    PinterestVideoAsset {
        url: hint_url,
        width: resolved.video.as_ref().and_then(|video| video.width),
        height: resolved.video.as_ref().and_then(|video| video.height),
        duration_seconds: resolved
            .video
            .as_ref()
            .and_then(|video| video.duration_seconds),
        poster_url,
    }
}

fn build_minimal_pinterest_media_from_hint(
    page_url: &str,
    title: Option<String>,
    hint_url: String,
) -> Result<PinterestResolvedMedia, String> {
    let pin_id = extract_pinterest_pin_id(page_url)
        .ok_or_else(|| format!("Failed to extract Pinterest pin id from {}", page_url))?;

    Ok(PinterestResolvedMedia {
        pin_id,
        origin: page_url.to_string(),
        title,
        image: PinterestImageAsset {
            // Sidecar requires an image asset in the payload shape, but the downloader
            // uses the video stream path when `video` is present.
            url: page_url.to_string(),
            width: None,
            height: None,
        },
        video: Some(PinterestVideoAsset {
            url: hint_url,
            width: None,
            height: None,
            duration_seconds: None,
            poster_url: None,
        }),
    })
}

fn should_prefer_pinterest_hint_video_url(
    hint_url: &str,
    resolved_video: Option<&PinterestVideoAsset>,
) -> bool {
    if !is_usable_pinterest_hint_video_url(hint_url) {
        return false;
    }

    let Some(resolved_video) = resolved_video else {
        return true;
    };

    let normalized_hint = normalize_video_candidate_url(hint_url);
    let normalized_resolved = normalize_video_candidate_url(resolved_video.url.as_str());
    if normalized_hint.is_some() && normalized_hint == normalized_resolved {
        return false;
    }

    is_valid_pinterest_hint_video_url(hint_url)
        && !is_pinterest_manifest_hint_url(hint_url)
        && is_pinterest_manifest_like_url(resolved_video.url.as_str())
}

fn extract_pinterest_video_asset(
    value: &serde_json::Value,
    pin_id: &str,
    fallback_poster_url: Option<String>,
) -> Option<PinterestVideoAsset> {
    if let Some(video_list) = value
        .get("videos")
        .and_then(|inner| inner.get("video_list"))
    {
        if let Some(asset) =
            parse_pinterest_video_asset_from_video_list(video_list, fallback_poster_url.clone())
        {
            return Some(asset);
        }
    }

    if let Some(pages) = value
        .get("story_pin_data")
        .and_then(|inner| inner.get("pages"))
        .and_then(|inner| inner.as_array())
    {
        for page in pages {
            let Some(blocks) = page.get("blocks").and_then(|inner| inner.as_array()) else {
                continue;
            };
            for block in blocks {
                let Some(video_list) = block.get("video").and_then(|inner| inner.get("video_list"))
                else {
                    continue;
                };
                if let Some(asset) = parse_pinterest_video_asset_from_video_list(
                    video_list,
                    fallback_poster_url.clone(),
                ) {
                    return Some(asset);
                }
            }
        }
    }

    let mut best_carousel_asset: Option<(u64, PinterestVideoAsset)> = None;
    let carousel_slots = value
        .get("carousel_data")
        .and_then(|inner| inner.get("carousel_slots"));

    let mut visit_carousel_slot = |slot: &serde_json::Value| {
        let Some(video_list) = slot.get("videos").and_then(|inner| inner.get("video_list")) else {
            return;
        };

        let poster_url = parse_pinterest_image_asset(slot)
            .map(|asset| asset.url)
            .or_else(|| fallback_poster_url.clone());
        let Some(asset) = parse_pinterest_video_asset_from_video_list(video_list, poster_url)
        else {
            return;
        };

        let slot_id_bonus = slot
            .get("id")
            .and_then(pinterest_value_as_string)
            .or_else(|| slot.get("pin_id").and_then(pinterest_value_as_string))
            .or_else(|| slot.get("pinId").and_then(pinterest_value_as_string))
            .filter(|value| value == pin_id)
            .map(|_| 10_000_000_000u64)
            .unwrap_or(0);
        let score = pinterest_video_asset_score(&asset).saturating_add(slot_id_bonus);

        match &best_carousel_asset {
            Some((best_score, _)) if *best_score >= score => {}
            _ => {
                best_carousel_asset = Some((score, asset));
            }
        }
    };

    if let Some(slots) = carousel_slots.and_then(|inner| inner.as_array()) {
        for slot in slots {
            visit_carousel_slot(slot);
        }
    } else if let Some(slots) = carousel_slots.and_then(|inner| inner.as_object()) {
        for slot in slots.values() {
            visit_carousel_slot(slot);
        }
    }

    best_carousel_asset.map(|(_, asset)| asset)
}

fn extract_pinterest_meta_image(html: &str) -> Option<PinterestImageAsset> {
    static META_OG_IMAGE_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?is)<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']"#)
            .expect("invalid pinterest og:image regex")
    });

    META_OG_IMAGE_RE
        .captures(html)
        .and_then(|captures| captures.get(1))
        .map(|value| PinterestImageAsset {
            url: value.as_str().replace("&amp;", "&"),
            width: None,
            height: None,
        })
}

fn extract_pinterest_meta_title(html: &str) -> Option<String> {
    static META_OG_TITLE_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?is)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']"#)
            .expect("invalid pinterest og:title regex")
    });

    META_OG_TITLE_RE
        .captures(html)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
}

fn extract_pinterest_json_blocks(html: &str) -> Vec<serde_json::Value> {
    static SCRIPT_TAG_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?is)<script[^>]*>(.*?)</script>"#).expect("script regex"));

    let mut blocks = Vec::new();
    for captures in SCRIPT_TAG_RE.captures_iter(html) {
        let Some(body_match) = captures.get(1) else {
            continue;
        };
        let body = body_match.as_str().trim();
        if body.is_empty() {
            continue;
        }

        let direct_candidate = if body.starts_with('{') || body.starts_with('[') {
            Some(body)
        } else if body.contains("__PWS_DATA__") {
            body.find('{')
                .map(|start| body[start..].trim_end_matches(';').trim())
        } else {
            None
        };

        let Some(candidate) = direct_candidate else {
            continue;
        };

        if let Ok(value) = serde_json::from_str::<serde_json::Value>(candidate) {
            blocks.push(value);
        }
    }

    blocks
}

fn resolve_pinterest_pin_media_from_value(
    value: &serde_json::Value,
    pin_id: &str,
    page_url: &str,
    fallback_image: Option<PinterestImageAsset>,
    fallback_title: Option<String>,
) -> Option<PinterestResolvedMedia> {
    let mut matches = Vec::new();
    pinterest_collect_pin_objects(value, pin_id, &mut matches);

    let best_match = matches
        .into_iter()
        .max_by_key(|candidate| pinterest_object_score(candidate))?;
    let image = parse_pinterest_image_asset(&best_match).or(fallback_image)?;
    let title = extract_pinterest_title(&best_match).or(fallback_title);
    let video = extract_pinterest_video_asset(&best_match, pin_id, Some(image.url.clone()));

    Some(PinterestResolvedMedia {
        pin_id: pin_id.to_string(),
        origin: page_url.to_string(),
        title,
        image,
        video,
    })
}

async fn fetch_pinterest_api_response(
    client: &reqwest::Client,
    endpoint: &str,
    source_url: &str,
    options: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let response = client
        .get(endpoint)
        .query(&[
            ("source_url", source_url.to_string()),
            (
                "data",
                serde_json::json!({
                    "options": options,
                    "context": {}
                })
                .to_string(),
            ),
            ("_", now_timestamp_ms().to_string()),
        ])
        .send()
        .await
        .map_err(|err| format!("Pinterest API request failed: {}", err))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("Failed to read Pinterest API response body: {}", err))?;
    if !status.is_success() {
        return Err(format!(
            "Pinterest API returned HTTP {}: {}",
            status,
            body.chars().take(180).collect::<String>()
        ));
    }

    serde_json::from_str::<serde_json::Value>(&body)
        .map_err(|err| format!("Failed to decode Pinterest API JSON: {}", err))
}

async fn fetch_pinterest_page_html(
    client: &reqwest::Client,
    page_url: &str,
) -> Result<String, String> {
    let response = client
        .get(page_url)
        .send()
        .await
        .map_err(|err| format!("Pinterest page request failed: {}", err))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("Failed to read Pinterest page HTML: {}", err))?;
    if !status.is_success() {
        return Err(format!(
            "Pinterest page returned HTTP {}: {}",
            status,
            body.chars().take(180).collect::<String>()
        ));
    }

    Ok(body)
}

fn build_pinterest_request_client(
    page_url: &str,
    cookies_header: Option<&str>,
) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ),
    );
    headers.insert(
        reqwest::header::REFERER,
        reqwest::header::HeaderValue::from_str(page_url)
            .map_err(|err| format!("Failed to build Pinterest referer header: {}", err))?,
    );
    headers.insert(
        "x-pinterest-pws-handler",
        reqwest::header::HeaderValue::from_static("www/pin/[id].js"),
    );

    if let Some(cookie_value) = cookies_header.filter(|value| !value.trim().is_empty()) {
        headers.insert(
            reqwest::header::COOKIE,
            reqwest::header::HeaderValue::from_str(cookie_value)
                .map_err(|err| format!("Failed to build Pinterest cookie header: {}", err))?,
        );
    }

    reqwest::Client::builder()
        .default_headers(headers)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|err| format!("Failed to build Pinterest request client: {}", err))
}

async fn resolve_pinterest_pin_media(
    page_url: &str,
    cookies_header: Option<&str>,
    trace_id: &str,
) -> Result<PinterestResolvedMedia, String> {
    let pin_id = extract_pinterest_pin_id(page_url)
        .ok_or_else(|| format!("Invalid Pinterest pin URL: {}", page_url))?;
    let client = build_pinterest_request_client(page_url, cookies_header)?;
    let mut failure_notes = Vec::new();
    let mut image_only_fallback: Option<PinterestResolvedMedia> = None;
    let mut fallback_image: Option<PinterestImageAsset> = None;
    let mut fallback_title: Option<String> = None;

    match fetch_pinterest_page_html(&client, page_url).await {
        Ok(html) => {
            log_download_trace(
                trace_id,
                "pinterest_page_html",
                serde_json::json!({
                    "status": "ok",
                    "pinId": pin_id,
                }),
            );
            fallback_image = extract_pinterest_meta_image(&html);
            fallback_title = extract_pinterest_meta_title(&html);
            for block in extract_pinterest_json_blocks(&html) {
                if let Some(resolved) = resolve_pinterest_pin_media_from_value(
                    &block,
                    pin_id.as_str(),
                    page_url,
                    fallback_image.clone(),
                    fallback_title.clone(),
                ) {
                    log_download_trace(
                        trace_id,
                        "pinterest_media_resolved",
                        serde_json::json!({
                            "pinId": resolved.pin_id,
                            "hasVideo": resolved.video.is_some(),
                            "imageUrl": summarize_url_for_log(&resolved.image.url),
                            "videoUrl": resolved.video.as_ref().map(|video| summarize_url_for_log(&video.url)),
                            "resolver": "page_html",
                        }),
                    );
                    if resolved.video.is_some() {
                        return Ok(resolved);
                    }
                    failure_notes.push("page_html_image_only".to_string());
                    if image_only_fallback.is_none() {
                        image_only_fallback = Some(resolved);
                    }
                }
            }
        }
        Err(err) => {
            log_download_trace(
                trace_id,
                "pinterest_page_html",
                serde_json::json!({
                    "status": "error",
                    "error": err,
                    "pinId": pin_id,
                }),
            );
            failure_notes.push("page_html_failed".to_string());
        }
    }

    let main_pin_options = serde_json::json!({
        "url": "/v3/users/me/recent/engaged/pin/stories/",
        "data": {
            "id": pin_id,
            "pin_id": pin_id,
            "pin_preview_count": 1,
            "fields": "pin.id,pin.title,pin.grid_title,pin.description,pin.images.orig,pin.images.736x,pin.videos.video_list,pin.story_pin_data.pages.blocks.video.video_list,pin.carousel_data.carousel_slots.id,pin.carousel_data.carousel_slots.pin_id,pin.carousel_data.carousel_slots.images.orig,pin.carousel_data.carousel_slots.images.736x,pin.carousel_data.carousel_slots.videos.video_list"
        }
    });

    match fetch_pinterest_api_response(
        &client,
        "https://www.pinterest.com/resource/ApiResource/get/",
        page_url,
        main_pin_options,
    )
    .await
    {
        Ok(value) => {
            log_download_trace(
                trace_id,
                "pinterest_api_main_pin",
                serde_json::json!({
                    "status": "ok",
                    "pinId": pin_id,
                }),
            );
            if let Some(resolved) = resolve_pinterest_pin_media_from_value(
                &value,
                pin_id.as_str(),
                page_url,
                fallback_image.clone(),
                fallback_title.clone(),
            ) {
                log_download_trace(
                    trace_id,
                    "pinterest_media_resolved",
                    serde_json::json!({
                        "pinId": resolved.pin_id,
                        "hasVideo": resolved.video.is_some(),
                        "imageUrl": summarize_url_for_log(&resolved.image.url),
                        "videoUrl": resolved.video.as_ref().map(|video| summarize_url_for_log(&video.url)),
                        "resolver": "api_main_pin",
                    }),
                );
                if resolved.video.is_some() {
                    return Ok(resolved);
                }
                failure_notes.push("api_main_pin_image_only".to_string());
                if image_only_fallback.is_none() {
                    image_only_fallback = Some(resolved);
                }
            } else {
                failure_notes.push("api_main_pin_unmatched".to_string());
            }
        }
        Err(err) => {
            log_download_trace(
                trace_id,
                "pinterest_api_main_pin",
                serde_json::json!({
                    "status": "error",
                    "error": err,
                    "pinId": pin_id,
                }),
            );
            failure_notes.push("api_main_pin_failed".to_string());
        }
    }

    let related_options = serde_json::json!({
        "pin_id": pin_id,
        "context_pin_ids": [],
        "page_size": 12,
        "bookmarks": [],
        "search_query": "",
        "source": "deep_linking",
        "top_level_source": "deep_linking",
        "top_level_source_depth": 1,
        "is_pdp": false,
    });

    match fetch_pinterest_api_response(
        &client,
        "https://www.pinterest.com/resource/RelatedModulesResource/get/",
        page_url,
        related_options,
    )
    .await
    {
        Ok(value) => {
            log_download_trace(
                trace_id,
                "pinterest_api_related",
                serde_json::json!({
                    "status": "ok",
                    "pinId": pin_id,
                }),
            );
            if let Some(resolved) = resolve_pinterest_pin_media_from_value(
                &value,
                pin_id.as_str(),
                page_url,
                fallback_image.clone(),
                fallback_title.clone(),
            ) {
                log_download_trace(
                    trace_id,
                    "pinterest_media_resolved",
                    serde_json::json!({
                        "pinId": resolved.pin_id,
                        "hasVideo": resolved.video.is_some(),
                        "imageUrl": summarize_url_for_log(&resolved.image.url),
                        "videoUrl": resolved.video.as_ref().map(|video| summarize_url_for_log(&video.url)),
                        "resolver": "api_related_modules",
                    }),
                );
                if resolved.video.is_some() {
                    return Ok(resolved);
                }
                failure_notes.push("api_related_image_only".to_string());
                if image_only_fallback.is_none() {
                    image_only_fallback = Some(resolved);
                }
            } else {
                failure_notes.push("api_related_unmatched".to_string());
            }
        }
        Err(err) => {
            log_download_trace(
                trace_id,
                "pinterest_api_related",
                serde_json::json!({
                    "status": "error",
                    "error": err,
                    "pinId": pin_id,
                }),
            );
            failure_notes.push("api_related_failed".to_string());
        }
    }

    if let Some(resolved) = image_only_fallback {
        return Ok(resolved);
    }

    if let Some(image) = fallback_image {
        return Ok(PinterestResolvedMedia {
            pin_id,
            origin: page_url.to_string(),
            title: fallback_title,
            image,
            video: None,
        });
    }

    Err(format!(
        "Failed to resolve Pinterest pin media for {} ({})",
        page_url,
        failure_notes.join(", ")
    ))
}

fn normalize_video_candidate_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if !trimmed.starts_with("http") || trimmed.starts_with("blob:") {
        return None;
    }

    Some(trimmed.replace("\\u002F", "/"))
}

fn is_mp4_video_url(url: &str) -> bool {
    url.to_ascii_lowercase().contains(".mp4")
}

fn is_pinterest_direct_mp4_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains(".mp4") || lower.contains("/videos/iht/expmp4/")
}

fn is_pinterest_manifest_hint_url(url: &str) -> bool {
    url.to_ascii_lowercase().contains(".m3u8")
}

fn is_pinterest_manifest_like_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    is_pinterest_manifest_hint_url(&lower)
        || lower.contains(".cmfv")
        || lower.contains("/videos/iht/hls/")
}

fn is_valid_pinterest_hint_video_url(url: &str) -> bool {
    is_pinterest_manifest_hint_url(url) || is_pinterest_direct_mp4_url(url) || is_mp4_video_url(url)
}

fn is_usable_pinterest_hint_video_url(url: &str) -> bool {
    is_valid_pinterest_hint_video_url(url) || is_pinterest_manifest_like_url(url)
}

fn normalize_page_url_for_direct_cache(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut parsed = url::Url::parse(trimmed).ok()?;
    parsed.set_fragment(None);

    let kept_pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(key, _)| {
            matches!(
                key.as_ref().to_ascii_lowercase().as_str(),
                "id" | "item_id" | "itemid" | "aweme_id" | "note_id" | "noteid"
            )
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    parsed.set_query(None);
    if !kept_pairs.is_empty() {
        let mut query = parsed.query_pairs_mut();
        for (key, value) in kept_pairs {
            query.append_pair(&key, &value);
        }
    }

    Some(parsed.to_string())
}

fn is_manifest_video_url(url: &str) -> bool {
    url.to_ascii_lowercase().contains(".m3u8")
}

fn parse_non_negative_seconds_field(
    data: &serde_json::Value,
    key: &str,
) -> Result<Option<f64>, String> {
    let Some(raw) = data.get(key) else {
        return Ok(None);
    };
    if raw.is_null() {
        return Ok(None);
    }

    let parsed = if let Some(value) = raw.as_f64() {
        Some(value)
    } else {
        raw.as_str()
            .and_then(|value| value.trim().parse::<f64>().ok())
    };

    let Some(seconds) = parsed else {
        return Err(format!("Invalid {}: expected number seconds", key));
    };
    if !seconds.is_finite() || seconds < 0.0 {
        return Err(format!("Invalid {}: expected non-negative seconds", key));
    }

    Ok(Some(seconds))
}

fn parse_clip_time_range(data: &serde_json::Value) -> Result<Option<ClipTimeRange>, String> {
    let start = parse_non_negative_seconds_field(data, "clipStartSec")?;
    let end = parse_non_negative_seconds_field(data, "clipEndSec")?;

    match (start, end) {
        (None, None) => Ok(None),
        (Some(_), None) | (None, Some(_)) => {
            Err("Both clipStartSec and clipEndSec are required".to_string())
        }
        (Some(start_seconds), Some(end_seconds)) => {
            if end_seconds <= start_seconds {
                return Err("Invalid clip range: OUT must be later than IN".to_string());
            }
            Ok(Some(ClipTimeRange {
                start_seconds,
                end_seconds,
            }))
        }
    }
}

fn parse_ytdlp_quality_preference_override(
    data: &serde_json::Value,
) -> Option<YtdlpQualityPreference> {
    let raw = data
        .get("ytdlpQualityPreference")
        .and_then(|value| value.as_str());
    YtdlpQualityPreference::parse_optional(raw)
}

fn parse_ae_friendly_conversion_enabled_override(data: &serde_json::Value) -> Option<bool> {
    data.get(AE_FRIENDLY_CONVERSION_CONFIG_KEY)
        .and_then(|value| value.as_bool())
}

fn resolve_video_download_preferences(
    app: &tauri::AppHandle,
) -> Result<VideoDownloadPreferences, String> {
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(VideoDownloadPreferences::from_config(&config))
}

fn persist_video_download_preferences(
    app: tauri::AppHandle,
    preferences: VideoDownloadPreferences,
) -> Result<bool, String> {
    let config_str = get_config(app.clone())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    let current_preferences = VideoDownloadPreferences::from_config(&config);
    if current_preferences.ytdlp_quality == preferences.ytdlp_quality
        && current_preferences.ae_friendly_conversion_enabled
            == preferences.ae_friendly_conversion_enabled
    {
        return Ok(false);
    }

    let config_obj = config
        .as_object_mut()
        .ok_or("Config should be a JSON object".to_string())?;
    config_obj.insert(
        DEFAULT_VIDEO_DOWNLOAD_QUALITY_CONFIG_KEY.to_string(),
        serde_json::Value::String(preferences.ytdlp_quality.as_str().to_string()),
    );
    config_obj.insert(
        AE_FRIENDLY_CONVERSION_CONFIG_KEY.to_string(),
        serde_json::Value::Bool(preferences.ae_friendly_conversion_enabled),
    );
    config_obj.remove(LEGACY_VIDEO_DOWNLOAD_QUALITY_CONFIG_KEY);

    let json =
        serde_json::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;
    save_config(app, json)?;
    println!(
        ">>> [Rust] Synced download preferences: quality={}, aeFriendlyConversionEnabled={}",
        preferences.ytdlp_quality.as_str(),
        preferences.ae_friendly_conversion_enabled
    );

    Ok(true)
}

fn format_seconds_for_download_section(seconds: f64) -> String {
    let millis_total = (seconds * 1000.0).round() as u64;
    let hours = millis_total / 3_600_000;
    let minutes = (millis_total % 3_600_000) / 60_000;
    let secs = (millis_total % 60_000) / 1_000;
    let millis = millis_total % 1_000;

    if millis == 0 {
        format!("{:02}:{:02}:{:02}", hours, minutes, secs)
    } else {
        format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, secs, millis)
    }
}

fn parse_extension_video_candidates(data: &serde_json::Value) -> Vec<ExtensionVideoCandidate> {
    let mut candidates: Vec<ExtensionVideoCandidate> = Vec::new();

    let Some(raw_candidates) = data.get("videoCandidates").and_then(|v| v.as_array()) else {
        return candidates;
    };

    for candidate in raw_candidates {
        let Some(raw_url) = candidate.get("url").and_then(|v| v.as_str()) else {
            continue;
        };
        let Some(url) = normalize_video_candidate_url(raw_url) else {
            continue;
        };

        let candidate_type = candidate
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let source = candidate
            .get("source")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let confidence = candidate
            .get("confidence")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        candidates.push(ExtensionVideoCandidate {
            url,
            candidate_type,
            source,
            confidence,
        });
    }

    candidates
}

fn normalize_command_video_candidates(
    raw_candidates: Option<Vec<QueueVideoCandidateInput>>,
) -> Vec<ExtensionVideoCandidate> {
    let mut candidates: Vec<ExtensionVideoCandidate> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for candidate in raw_candidates.unwrap_or_default() {
        let Some(url) = normalize_video_candidate_url(&candidate.url) else {
            continue;
        };

        if !seen.insert(url.clone()) {
            continue;
        }

        candidates.push(ExtensionVideoCandidate {
            url,
            candidate_type: candidate
                .candidate_type
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            source: candidate
                .source
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            confidence: candidate
                .confidence
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
        });
    }

    candidates
}

fn select_pinterest_hint_video_url(
    video_url_hint: Option<&str>,
    video_candidates: &[ExtensionVideoCandidate],
) -> Option<String> {
    let normalized_hint = video_url_hint
        .and_then(normalize_video_candidate_url)
        .filter(|url| is_usable_pinterest_hint_video_url(url));
    let mut manifest_fallback = normalized_hint
        .clone()
        .filter(|url| is_pinterest_manifest_hint_url(url));
    let mut manifest_like_fallback = normalized_hint
        .clone()
        .filter(|url| is_pinterest_manifest_like_url(url));

    if let Some(url) = normalized_hint.filter(|url| !is_pinterest_manifest_like_url(url)) {
        return Some(url);
    }

    for candidate in video_candidates {
        if !is_usable_pinterest_hint_video_url(&candidate.url) {
            continue;
        }

        if !is_pinterest_manifest_like_url(&candidate.url) {
            return Some(candidate.url.clone());
        }

        if manifest_fallback.is_none() && is_pinterest_manifest_hint_url(&candidate.url) {
            manifest_fallback = Some(candidate.url.clone());
        }

        if manifest_like_fallback.is_none() && is_pinterest_manifest_like_url(&candidate.url) {
            manifest_like_fallback = Some(candidate.url.clone());
        }
    }

    manifest_fallback.or(manifest_like_fallback)
}

fn is_direct_candidate_for_platform(platform: DirectPlatform, url: &str) -> bool {
    if is_manifest_video_url(url) {
        return false;
    }

    match platform {
        DirectPlatform::Douyin => is_douyin_cdn_url(url),
        DirectPlatform::Xiaohongshu => is_xiaohongshu_cdn_url(url),
    }
}

fn direct_candidate_cache_key(platform: DirectPlatform, page_url: &str) -> Option<String> {
    normalize_page_url_for_direct_cache(page_url)
        .map(|normalized| format!("{}::{}", platform.as_str(), normalized))
}

fn get_cached_direct_candidate(
    platform: DirectPlatform,
    page_url: &str,
) -> Option<SelectedDirectCandidate> {
    let key = direct_candidate_cache_key(platform, page_url)?;
    let now = now_timestamp_ms();
    let mut cache = DIRECT_CANDIDATE_CACHE.lock().unwrap();

    let cached = cache.get(&key).cloned();
    match cached {
        Some(entry) if entry.expires_at_ms > now => Some(SelectedDirectCandidate {
            url: entry.url,
            origin: "cache",
            candidate_type: Some("cached_direct_url".to_string()),
            source: Some("direct_cache".to_string()),
            confidence: Some("medium".to_string()),
        }),
        Some(_) => {
            cache.remove(&key);
            None
        }
        None => None,
    }
}

fn put_direct_candidate_cache(
    platform: DirectPlatform,
    page_url: &str,
    candidate_url: &str,
) -> Option<String> {
    if !is_direct_candidate_for_platform(platform, candidate_url) {
        return None;
    }

    let key = direct_candidate_cache_key(platform, page_url)?;
    let now = now_timestamp_ms();

    let mut cache = DIRECT_CANDIDATE_CACHE.lock().unwrap();
    cache.retain(|_, entry| entry.expires_at_ms > now);
    if cache.len() >= DIRECT_CANDIDATE_CACHE_MAX_ENTRIES {
        if let Some(first_key) = cache.keys().next().cloned() {
            cache.remove(&first_key);
        }
    }
    cache.insert(
        key.clone(),
        DirectCandidateCacheEntry {
            url: candidate_url.to_string(),
            expires_at_ms: now + DIRECT_CANDIDATE_CACHE_TTL_MS,
        },
    );

    Some(key)
}

fn append_direct_candidate(
    selected: &mut Vec<SelectedDirectCandidate>,
    seen: &mut HashSet<String>,
    candidate: SelectedDirectCandidate,
) {
    if seen.insert(candidate.url.clone()) {
        selected.push(candidate);
    }
}

fn collect_direct_candidates_for_platform(
    platform: DirectPlatform,
    page_url: &str,
    primary_video_url: Option<&str>,
    video_candidates: &[ExtensionVideoCandidate],
) -> Vec<SelectedDirectCandidate> {
    let mut selected: Vec<SelectedDirectCandidate> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    if let Some(cached) = get_cached_direct_candidate(platform, page_url) {
        append_direct_candidate(&mut selected, &mut seen, cached);
    }

    if let Some(primary) = primary_video_url.and_then(normalize_video_candidate_url) {
        if is_direct_candidate_for_platform(platform, &primary) {
            append_direct_candidate(
                &mut selected,
                &mut seen,
                SelectedDirectCandidate {
                    url: primary,
                    origin: "videoUrl",
                    candidate_type: Some("legacy_video_url".to_string()),
                    source: Some("legacy".to_string()),
                    confidence: Some("medium".to_string()),
                },
            );
        }
    }

    for candidate in video_candidates {
        if is_direct_candidate_for_platform(platform, &candidate.url) {
            append_direct_candidate(
                &mut selected,
                &mut seen,
                SelectedDirectCandidate {
                    url: candidate.url.clone(),
                    origin: "videoCandidates",
                    candidate_type: candidate.candidate_type.clone(),
                    source: candidate.source.clone(),
                    confidence: candidate.confidence.clone(),
                },
            );
        }
    }

    selected
}

/// Convert Netscape cookie file content to Cookie header format: "k1=v1; k2=v2"
fn netscape_cookies_to_header(cookies_content: &str) -> Option<String> {
    let pairs: Vec<String> = cookies_content
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 7 {
                Some(format!("{}={}", parts[5], parts[6]))
            } else {
                None
            }
        })
        .collect();

    if pairs.is_empty() {
        None
    } else {
        Some(pairs.join("; "))
    }
}

/// Convert Netscape cookies file to Cookie header format: "k1=v1; k2=v2"
fn cookies_file_to_header(cookies_path: &PathBuf) -> Option<String> {
    if !cookies_path.exists() {
        return None;
    }

    let content = fs::read_to_string(cookies_path).ok()?;
    netscape_cookies_to_header(&content)
}

fn is_youtube_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("youtube.com/") || lower.contains("youtu.be/")
}

/// Smart download dispatcher with fallback logic
/// Current policy: direct routes for Douyin/Xiaohongshu CDN URLs, otherwise yt-dlp.
async fn download_video_smart(
    app: AppHandle,
    url: String,
    title: Option<String>,
    extension_cookies_path: Option<PathBuf>,
    clip_range: Option<ClipTimeRange>,
    ytdlp_quality: YtdlpQualityPreference,
    ae_friendly_conversion_enabled: bool,
    trace_id: Option<String>,
    initial_route_chain: Option<Vec<DownloadRoute>>,
) -> Result<DownloadResult, String> {
    let trace_id = trace_id.unwrap_or_else(next_download_trace_id);
    let started_at = std::time::Instant::now();
    let mut route_chain: Vec<DownloadRoute> = initial_route_chain.unwrap_or_default();

    log_download_trace(
        &trace_id,
        "router_entry",
        serde_json::json!({
            "url": url,
            "hasTitle": title.is_some(),
            "hasExtensionCookies": extension_cookies_path.as_ref().is_some_and(|path| path.exists()),
            "hasClipRange": clip_range.is_some(),
            "ytdlpQuality": ytdlp_quality.as_str(),
            "aeFriendlyConversionEnabled": ae_friendly_conversion_enabled,
        }),
    );

    // Direct Douyin CDN link: use direct downloader with browser cookies.
    // This avoids extractor fallback for ephemeral signed URLs.
    if is_douyin_cdn_url(&url) {
        route_chain.push(DownloadRoute::DirectDouyin);
        let cookie_header = extension_cookies_path
            .as_ref()
            .and_then(cookies_file_to_header);
        println!(">>> [Smart] Direct Douyin CDN URL detected, using direct downloader");
        log_download_trace(
            &trace_id,
            "route_selected",
            serde_json::json!({
                "route": DownloadRoute::DirectDouyin.as_str(),
                "reason": "douyin_cdn_url",
            }),
        );

        let result = download_douyin_direct(app, url, cookie_header, title, trace_id.clone()).await;
        match &result {
            Ok(download_result) if download_result.success => {
                log_terminal_outcome(
                    &trace_id,
                    DownloadOutcomeCategory::DirectSuccess,
                    Some(DownloadRoute::DirectDouyin),
                    &route_chain,
                    started_at.elapsed().as_millis(),
                    None,
                );
            }
            Ok(download_result) => {
                log_terminal_outcome(
                    &trace_id,
                    DownloadOutcomeCategory::AllFailed,
                    Some(DownloadRoute::DirectDouyin),
                    &route_chain,
                    started_at.elapsed().as_millis(),
                    download_result.error.as_deref(),
                );
            }
            Err(err) => {
                let category = if is_cancelled_error(err.as_str()) {
                    DownloadOutcomeCategory::Cancelled
                } else {
                    DownloadOutcomeCategory::AllFailed
                };
                log_terminal_outcome(
                    &trace_id,
                    category,
                    Some(DownloadRoute::DirectDouyin),
                    &route_chain,
                    started_at.elapsed().as_millis(),
                    Some(err.as_str()),
                );
            }
        }
        return result;
    }

    // Direct Xiaohongshu CDN link: use direct downloader with browser cookies.
    if is_xiaohongshu_cdn_url(&url) {
        route_chain.push(DownloadRoute::DirectXiaohongshu);
        let cookie_header = extension_cookies_path
            .as_ref()
            .and_then(cookies_file_to_header);
        println!(">>> [Smart] Direct Xiaohongshu CDN URL detected, using direct downloader");
        log_download_trace(
            &trace_id,
            "route_selected",
            serde_json::json!({
                "route": DownloadRoute::DirectXiaohongshu.as_str(),
                "reason": "xiaohongshu_cdn_url",
            }),
        );

        let result =
            download_xiaohongshu_direct(app, url, cookie_header, title, trace_id.clone()).await;
        match &result {
            Ok(download_result) if download_result.success => {
                log_terminal_outcome(
                    &trace_id,
                    DownloadOutcomeCategory::DirectSuccess,
                    Some(DownloadRoute::DirectXiaohongshu),
                    &route_chain,
                    started_at.elapsed().as_millis(),
                    None,
                );
            }
            Ok(download_result) => {
                log_terminal_outcome(
                    &trace_id,
                    DownloadOutcomeCategory::AllFailed,
                    Some(DownloadRoute::DirectXiaohongshu),
                    &route_chain,
                    started_at.elapsed().as_millis(),
                    download_result.error.as_deref(),
                );
            }
            Err(err) => {
                let category = if is_cancelled_error(err.as_str()) {
                    DownloadOutcomeCategory::Cancelled
                } else {
                    DownloadOutcomeCategory::AllFailed
                };
                log_terminal_outcome(
                    &trace_id,
                    category,
                    Some(DownloadRoute::DirectXiaohongshu),
                    &route_chain,
                    started_at.elapsed().as_millis(),
                    Some(err.as_str()),
                );
            }
        }
        return result;
    }

    println!(">>> [Smart] URL: {}, route: yt-dlp-first", url);
    log_download_trace(
        &trace_id,
        "route_policy",
        serde_json::json!({
            "policy": "yt_dlp_first_direct_plus_bundled_binary",
        }),
    );

    // Default route: always try yt-dlp first.
    println!(">>> [Smart] Trying yt-dlp first");
    route_chain.push(DownloadRoute::YtDlp);
    log_download_trace(
        &trace_id,
        "attempt_start",
        serde_json::json!({
            "attempt": 1,
            "route": DownloadRoute::YtDlp.as_str(),
        }),
    );
    match download_video_internal(
        app.clone(),
        url.clone(),
        extension_cookies_path.clone(),
        clip_range.clone(),
        title.clone(),
        ytdlp_quality,
        ae_friendly_conversion_enabled,
        trace_id.clone(),
        YtdlpInvocationPolicy {
            allow_youtube_cookie_retry: true,
            allow_http_416_retry: true,
            disable_resume_artifacts: false,
        },
    )
    .await
    {
        Ok(result) if result.success => {
            log_terminal_outcome(
                &trace_id,
                success_outcome_for_route_chain(&route_chain, DownloadRoute::YtDlp),
                Some(DownloadRoute::YtDlp),
                &route_chain,
                started_at.elapsed().as_millis(),
                None,
            );
            return Ok(result);
        }
        Err(e) => {
            // Check if cancelled.
            if is_download_cancelled(trace_id.as_str()) {
                println!(">>> [Smart] Download cancelled, not falling back");
                log_terminal_outcome(
                    &trace_id,
                    DownloadOutcomeCategory::Cancelled,
                    Some(DownloadRoute::YtDlp),
                    &route_chain,
                    started_at.elapsed().as_millis(),
                    Some("Download cancelled"),
                );
                return Err("Download cancelled".to_string());
            }
            println!(">>> [Smart] yt-dlp failed: {}", e);
            log_terminal_outcome(
                &trace_id,
                DownloadOutcomeCategory::AllFailed,
                Some(DownloadRoute::YtDlp),
                &route_chain,
                started_at.elapsed().as_millis(),
                Some(e.as_str()),
            );
            return Err(e);
        }
        Ok(result) => {
            println!(">>> [Smart] yt-dlp returned failure");
            log_terminal_outcome(
                &trace_id,
                DownloadOutcomeCategory::AllFailed,
                Some(DownloadRoute::YtDlp),
                &route_chain,
                started_at.elapsed().as_millis(),
                result.error.as_deref(),
            );
            return Ok(result);
        }
    }
}

/// Download direct video media URL with custom referer/cookie header.
async fn download_video_direct(
    app: AppHandle,
    video_url: String,
    cookies: Option<String>,
    title: Option<String>,
    referer: &str,
    title_suffix_to_strip: Option<&str>,
    platform: &str,
    default_prefix: &str,
    trace_id: String,
) -> Result<DownloadResult, String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    println!(
        ">>> [Rust] Starting {} direct download: {}",
        platform, video_url
    );
    // Build HTTP client with headers
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            .parse()
            .map_err(|e| format!("Failed to build User-Agent header: {}", e))?,
    );
    headers.insert(
        "Referer",
        referer
            .parse()
            .map_err(|e| format!("Failed to build Referer header: {}", e))?,
    );

    if let Some(ref cookie_str) = cookies {
        if let Ok(cookie_val) = cookie_str.parse() {
            headers.insert("Cookie", cookie_val);
        }
    }

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    // Get output directory from config
    let config_str = get_config(app.clone())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    let base_output_dir = config
        .get("outputPath")
        .and_then(|v| v.as_str())
        .map(|s| std::path::PathBuf::from(s))
        .unwrap_or_else(|| {
            desktop_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("FlowSelect_Received")
        });

    let output_dir = base_output_dir;

    if !output_dir.exists() {
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let rename_media_on_download = is_rename_media_enabled(&config);

    let output_path = if !rename_media_on_download && title.is_some() {
        let raw_title = title.as_ref().unwrap();
        // Clean title: strip site suffix and invalid filename characters
        let stripped_title = if let Some(suffix) = title_suffix_to_strip {
            raw_title.trim_end_matches(suffix).trim()
        } else {
            raw_title.trim()
        };
        let clean_title = sanitize_file_stem(stripped_title);

        if clean_title.is_empty() {
            let seq_num = get_next_sequence_number(&output_dir)?;
            output_dir.join(format!("{}.mp4", seq_num))
        } else {
            // Check if file exists, add sequence number if needed
            let base_path = output_dir.join(format!("{}.mp4", clean_title));
            if base_path.exists() {
                let seq_num = get_next_sequence_number(&output_dir)?;
                output_dir.join(format!("{}_{}.mp4", clean_title, seq_num))
            } else {
                base_path
            }
        }
    } else if rename_media_on_download {
        let rename_stem = get_next_rename_sequence_stem(&app, &mut config, &output_dir)?;
        output_dir.join(format!("{}.mp4", rename_stem))
    } else {
        let seq_num = get_next_sequence_number(&output_dir)?;
        output_dir.join(format!("{}.mp4", seq_num))
    };

    // Keep deterministic filename when title is missing
    let output_path = if output_path.extension().is_none() {
        output_dir.join(format!(
            "{}_{}.mp4",
            default_prefix,
            get_next_sequence_number(&output_dir)?
        ))
    } else {
        output_path
    };

    // Download video
    let response = client
        .get(&video_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|ct| ct.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if content_type.contains("application/vnd.apple.mpegurl")
        || content_type.contains("application/x-mpegurl")
        || content_type.starts_with("text/")
        || content_type.contains("application/json")
    {
        return Err(format!(
            "{} direct URL returned non-video payload (content-type: {})",
            platform, content_type
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    if total_size > 0 && total_size < 1024 {
        return Err(format!(
            "{} direct payload too small ({} bytes), likely not a playable video",
            platform, total_size
        ));
    }
    let mut downloaded: u64 = 0;

    append_runtime_log_event(
        "download",
        "start",
        Some(trace_id.as_str()),
        serde_json::json!({
            "mode": "direct",
            "platform": platform,
            "url": summarize_url_for_log(&video_url),
            "totalBytes": if total_size > 0 { Some(total_size) } else { None::<u64> },
            "renameEnabled": rename_media_on_download,
            "outputPath": output_path.to_string_lossy().to_string(),
        }),
    );

    // Send initial progress event to show download started
    let _ = app.emit(
        "video-download-progress",
        DownloadProgress {
            trace_id: trace_id.clone(),
            percent: if total_size > 0 { 0.0 } else { -1.0 }, // -1 indicates indeterminate
            stage: DownloadProgressStage::Preparing,
            speed: "Starting...".to_string(),
            eta: "N/A".to_string(),
        },
    );
    maybe_log_runtime_progress(
        trace_id.as_str(),
        DownloadProgressStage::Preparing,
        if total_size > 0 { 0.0 } else { -1.0 },
        "Starting...",
        "N/A",
    );

    let mut file = tokio::fs::File::create(&output_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        if is_download_cancelled(trace_id.as_str()) {
            println!(">>> [Rust] {} direct download cancelled by user", platform);
            let _ = file.flush().await;
            drop(file);
            let _ = tokio::fs::remove_file(&output_path).await;
            append_runtime_log_event(
                "download",
                "complete",
                Some(trace_id.as_str()),
                serde_json::json!({
                    "mode": "direct",
                    "platform": platform,
                    "success": false,
                    "error": "Download cancelled",
                }),
            );
            clear_runtime_progress_log_state(trace_id.as_str());
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;

        downloaded += chunk.len() as u64;

        // Throttle progress updates to every 100ms
        if last_emit.elapsed().as_millis() >= 100 {
            last_emit = std::time::Instant::now();
            if total_size > 0 {
                let percent = (downloaded as f32 / total_size as f32) * 100.0;
                let speed = format!("{:.1} MB", downloaded as f64 / 1_000_000.0);
                let _ = app.emit(
                    "video-download-progress",
                    DownloadProgress {
                        trace_id: trace_id.clone(),
                        percent,
                        stage: DownloadProgressStage::Downloading,
                        speed: speed.clone(),
                        eta: "N/A".to_string(),
                    },
                );
                maybe_log_runtime_progress(
                    trace_id.as_str(),
                    DownloadProgressStage::Downloading,
                    percent,
                    speed.as_str(),
                    "N/A",
                );
            } else {
                // Indeterminate progress - show downloaded size
                let speed = format!("{:.1} MB", downloaded as f64 / 1_000_000.0);
                let _ = app.emit(
                    "video-download-progress",
                    DownloadProgress {
                        trace_id: trace_id.clone(),
                        percent: -1.0,
                        stage: DownloadProgressStage::Downloading,
                        speed: speed.clone(),
                        eta: "N/A".to_string(),
                    },
                );
                maybe_log_runtime_progress(
                    trace_id.as_str(),
                    DownloadProgressStage::Downloading,
                    -1.0,
                    speed.as_str(),
                    "N/A",
                );
            }
        }
    }

    if is_download_cancelled(trace_id.as_str()) {
        println!(
            ">>> [Rust] {} direct download cancellation detected after stream drain",
            platform
        );
        let _ = file.flush().await;
        drop(file);
        let _ = tokio::fs::remove_file(&output_path).await;
        append_runtime_log_event(
            "download",
            "complete",
            Some(trace_id.as_str()),
            serde_json::json!({
                "mode": "direct",
                "platform": platform,
                "success": false,
                "error": "Download cancelled",
            }),
        );
        clear_runtime_progress_log_state(trace_id.as_str());
        return Err("Download cancelled".to_string());
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;

    let file_path = output_path.to_string_lossy().to_string();
    println!(">>> [Rust] {} video saved: {}", platform, file_path);

    let result = DownloadResult {
        trace_id,
        success: true,
        file_path: Some(file_path.clone()),
        error: None,
    };

    let _ = app.emit("video-download-complete", result.clone());
    append_runtime_log_event(
        "download",
        "complete",
        Some(result.trace_id.as_str()),
        serde_json::json!({
            "mode": "direct",
            "platform": platform,
            "success": true,
            "filePath": result.file_path.clone(),
        }),
    );
    clear_runtime_progress_log_state(result.trace_id.as_str());

    // AE Portal
    let app_for_ae = app.clone();
    tokio::spawn(async move {
        let _ = send_to_ae(app_for_ae, file_path).await;
    });

    Ok(result)
}

/// Download Douyin video directly from video URL
async fn download_douyin_direct(
    app: AppHandle,
    video_url: String,
    cookies: Option<String>,
    title: Option<String>,
    trace_id: String,
) -> Result<DownloadResult, String> {
    download_video_direct(
        app,
        video_url,
        cookies,
        title,
        "https://www.douyin.com/",
        Some(" - 抖音"),
        "Douyin",
        "douyin",
        trace_id,
    )
    .await
}

/// Download Xiaohongshu video directly from video URL
async fn download_xiaohongshu_direct(
    app: AppHandle,
    video_url: String,
    cookies: Option<String>,
    title: Option<String>,
    trace_id: String,
) -> Result<DownloadResult, String> {
    download_video_direct(
        app,
        video_url,
        cookies,
        title,
        "https://www.xiaohongshu.com/",
        Some(" - 小红书"),
        "Xiaohongshu",
        "xiaohongshu",
        trace_id,
    )
    .await
}

/// Parse yt-dlp progress line: [download] XX.X% of XXX at XXX ETA XXX
fn parse_progress(line: &str) -> Option<DownloadProgress> {
    static YTDLP_PERCENT_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\[download\]\s+([0-9]+(?:\.[0-9]+)?)%").expect("invalid yt-dlp percent regex")
    });
    static YTDLP_SPEED_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\sat\s+(.+?)(?:\s+ETA|\s*$)").expect("invalid yt-dlp speed regex")
    });
    static YTDLP_ETA_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\sETA\s+([0-9:]+)").expect("invalid yt-dlp eta regex"));

    let percent = YTDLP_PERCENT_RE
        .captures(line)
        .and_then(|caps| caps.get(1))
        .and_then(|value| value.as_str().parse::<f32>().ok())?;

    let speed = YTDLP_SPEED_RE
        .captures(line)
        .and_then(|caps| caps.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Downloading...".to_string());

    let eta = YTDLP_ETA_RE
        .captures(line)
        .and_then(|caps| caps.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "N/A".to_string());

    Some(DownloadProgress {
        trace_id: String::new(),
        percent,
        stage: DownloadProgressStage::Downloading,
        speed,
        eta,
    })
}

fn infer_ytdlp_stage(line: &str) -> Option<DownloadProgressStage> {
    let lower = line.to_ascii_lowercase();

    if lower.contains("downloading webpage")
        || lower.contains("downloading player")
        || lower.contains("extracting")
        || lower.contains("extractor")
    {
        return Some(DownloadProgressStage::Preparing);
    }

    if lower.contains("[merger]") || lower.contains("merging formats") {
        return Some(DownloadProgressStage::Merging);
    }

    if lower.contains("[ffmpeg]") || lower.contains("post-process") {
        return Some(DownloadProgressStage::PostProcessing);
    }

    if lower.contains("frame=") && lower.contains("time=") {
        return Some(DownloadProgressStage::PostProcessing);
    }

    if lower.contains("[download] destination")
        || (lower.contains("[download]") && !lower.contains('%'))
    {
        return Some(DownloadProgressStage::Downloading);
    }

    None
}

fn capture_ytdlp_file_path(line: &str) -> Option<String> {
    // Format 1: [Merger] Merging formats into "/path/file.mkv" or "D:\path\file.mp4"
    // Format 2: [download] Destination: /path/file.mkv or D:\path\file.mp4
    // Format 3: [download] /path/file.mkv has already been downloaded
    static YTDLP_QUOTED_PATH_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#""([^"]+)""#).expect("invalid merge path regex"));
    static YTDLP_ALREADY_DOWNLOADED_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"^\[download\]\s+(?P<path>.+?)\s+has already been downloaded(?:\s|$)"#)
            .expect("invalid already-downloaded path regex")
    });

    if line.contains("[Merger]") {
        return YTDLP_QUOTED_PATH_RE
            .captures(line)
            .and_then(|caps| caps.get(1))
            .map(|value| value.as_str().to_string());
    }

    if let Some(idx) = line.find("Destination:") {
        let path = line[idx + "Destination:".len()..].trim().trim_matches('"');
        if !path.is_empty() {
            return Some(path.to_string());
        }
    }

    if let Some(captures) = YTDLP_ALREADY_DOWNLOADED_RE.captures(line) {
        let path = captures
            .name("path")
            .map(|value| value.as_str().trim().trim_matches('"'))
            .unwrap_or_default();
        if !path.is_empty() {
            return Some(path.to_string());
        }
    }

    None
}

fn read_ytdlp_reported_output_path(report_path: &Path) -> Option<String> {
    let bytes = fs::read(report_path).ok()?;
    let contents = String::from_utf8_lossy(&bytes);
    contents
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| {
            line.trim_start_matches('\u{feff}')
                .trim_matches('"')
                .to_string()
        })
        .filter(|line| !line.is_empty())
}

#[derive(Default)]
struct YtdlpHeartbeatState {
    last_percent: Option<f32>,
    last_ffmpeg_time_seconds: Option<f64>,
    last_output_bytes: Option<u64>,
    last_stage_status: Option<String>,
}

#[derive(Default)]
struct YtdlpHeartbeatEvent {
    hard_heartbeat: bool,
    soft_heartbeat: bool,
}

fn parse_ffmpeg_time_seconds(line: &str) -> Option<f64> {
    static FFMPEG_TIME_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)").expect("invalid ffmpeg time regex")
    });
    let captures = FFMPEG_TIME_RE.captures(line)?;
    let hours = captures.get(1)?.as_str().parse::<f64>().ok()?;
    let minutes = captures.get(2)?.as_str().parse::<f64>().ok()?;
    let seconds = captures.get(3)?.as_str().parse::<f64>().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn strip_ansi_escape_sequences(raw: &str) -> String {
    static ANSI_ESCAPE_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\x1B\[[0-?]*[ -/]*[@-~]").expect("invalid ansi escape regex")
    });
    ANSI_ESCAPE_RE.replace_all(raw, "").into_owned()
}

fn infer_ytdlp_stage_status(stage: DownloadProgressStage, line: &str) -> String {
    let lower = line.to_ascii_lowercase();
    match stage {
        DownloadProgressStage::Preparing => {
            if lower.contains("downloading webpage")
                || lower.contains("downloading player")
                || lower.contains("extracting")
                || lower.contains("extractor")
            {
                "Extracting metadata...".to_string()
            } else {
                "Preparing download...".to_string()
            }
        }
        DownloadProgressStage::Downloading => {
            if lower.contains("[download] destination") {
                "Starting media transfer...".to_string()
            } else {
                DownloadProgressStage::Downloading.label().to_string()
            }
        }
        DownloadProgressStage::Merging => "Merging audio/video...".to_string(),
        DownloadProgressStage::PostProcessing => "Finalizing output...".to_string(),
    }
}

fn mark_hard_heartbeat_from_output_growth(
    last_file_path: &Option<String>,
    heartbeat_state: &mut YtdlpHeartbeatState,
) -> bool {
    let Some(path_str) = last_file_path else {
        heartbeat_state.last_output_bytes = None;
        return false;
    };

    let path = Path::new(path_str);
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    let current_size = metadata.len();

    let hard_heartbeat = match heartbeat_state.last_output_bytes {
        Some(last_size) => current_size > last_size,
        None => false,
    };
    heartbeat_state.last_output_bytes = Some(current_size);
    hard_heartbeat
}

fn is_watchdog_timeout_candidate(
    last_hard_heartbeat_at: std::time::Instant,
    last_soft_heartbeat_at: Option<std::time::Instant>,
    now: std::time::Instant,
) -> bool {
    let hard_timeout = std::time::Duration::from_secs(YTDLP_HARD_HEARTBEAT_TIMEOUT_SECS);
    let soft_grace = std::time::Duration::from_secs(YTDLP_SOFT_HEARTBEAT_GRACE_SECS);
    let hard_elapsed = now.duration_since(last_hard_heartbeat_at);

    if hard_elapsed <= hard_timeout {
        return false;
    }

    if hard_elapsed > hard_timeout + soft_grace {
        return true;
    }

    let soft_recent = last_soft_heartbeat_at
        .map(|soft_at| now.duration_since(soft_at) <= soft_grace)
        .unwrap_or(false);
    !soft_recent
}

fn process_ytdlp_output_line(
    app: &AppHandle,
    line: &str,
    last_file_path: &mut Option<String>,
    last_stage: &mut DownloadProgressStage,
    heartbeat_state: &mut YtdlpHeartbeatState,
    captured_artifact_paths: &mut HashSet<PathBuf>,
    trace_id: &str,
) -> YtdlpHeartbeatEvent {
    let mut heartbeat_event = YtdlpHeartbeatEvent::default();

    for raw_segment in line.replace('\r', "\n").lines() {
        let normalized_line = strip_ansi_escape_sequences(raw_segment);
        let normalized_line = normalized_line.trim();
        if normalized_line.is_empty() {
            continue;
        }

        if let Some(progress) = parse_progress(normalized_line) {
            let progress_percent = progress.percent;
            let progress_speed = progress.speed.clone();
            let progress_eta = progress.eta.clone();
            if heartbeat_state
                .last_percent
                .map(|last_percent| progress.percent > last_percent + f32::EPSILON)
                .unwrap_or(true)
            {
                heartbeat_event.hard_heartbeat = true;
            }
            heartbeat_state.last_percent = Some(progress.percent);
            heartbeat_state.last_stage_status = None;
            let _ = app.emit(
                "video-download-progress",
                DownloadProgress {
                    trace_id: trace_id.to_string(),
                    ..progress
                },
            );
            maybe_log_runtime_progress(
                trace_id,
                DownloadProgressStage::Downloading,
                progress_percent,
                progress_speed.as_str(),
                progress_eta.as_str(),
            );
            *last_stage = DownloadProgressStage::Downloading;
        } else if let Some(stage) = infer_ytdlp_stage(normalized_line) {
            let stage_status = infer_ytdlp_stage_status(stage, normalized_line);
            let should_emit = *last_stage != stage
                || heartbeat_state
                    .last_stage_status
                    .as_deref()
                    .map(|last_status| last_status != stage_status.as_str())
                    .unwrap_or(true);
            if should_emit {
                let _ = app.emit(
                    "video-download-progress",
                    DownloadProgress {
                        trace_id: trace_id.to_string(),
                        percent: -1.0,
                        stage,
                        speed: stage_status.clone(),
                        eta: "".to_string(),
                    },
                );
            }
            maybe_log_runtime_progress(trace_id, stage, -1.0, stage_status.as_str(), "");
            *last_stage = stage;
            heartbeat_state.last_stage_status = Some(stage_status);
            heartbeat_event.soft_heartbeat = true;
        }

        if let Some(ffmpeg_time_seconds) = parse_ffmpeg_time_seconds(normalized_line) {
            if heartbeat_state
                .last_ffmpeg_time_seconds
                .map(|last_time| ffmpeg_time_seconds > last_time + 0.01)
                .unwrap_or(true)
            {
                heartbeat_event.hard_heartbeat = true;
            }
            heartbeat_state.last_ffmpeg_time_seconds = Some(ffmpeg_time_seconds);
        }

        if let Some(path) = capture_ytdlp_file_path(normalized_line) {
            if last_file_path.as_deref() != Some(path.as_str()) {
                heartbeat_state.last_output_bytes = None;
            }
            captured_artifact_paths.insert(PathBuf::from(path.as_str()));
            *last_file_path = Some(path);
        }
    }

    heartbeat_event
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

#[derive(serde::Deserialize)]
struct EmbeddedPinterestSidecarLock {
    #[serde(rename = "flowselectSidecarVersion")]
    flowselect_sidecar_version: String,
    upstream: EmbeddedPinterestSidecarUpstream,
}

#[derive(serde::Deserialize)]
struct EmbeddedPinterestSidecarUpstream {
    package: String,
    version: String,
}

#[derive(serde::Serialize, Clone)]
pub struct PinterestDownloaderInfo {
    pub current: String,
    #[serde(rename = "packageName")]
    pub package_name: String,
    #[serde(rename = "flowselectSidecarVersion")]
    pub flowselect_sidecar_version: String,
    #[serde(rename = "updateChannel")]
    pub update_channel: String,
}

fn pinterest_downloader_info_from_lock_json(
    lock_json: &str,
) -> Result<PinterestDownloaderInfo, String> {
    let lock: EmbeddedPinterestSidecarLock = serde_json::from_str(lock_json).map_err(|err| {
        format!(
            "Failed to parse bundled Pinterest downloader metadata: {}",
            err
        )
    })?;

    if lock.upstream.package.trim().is_empty() {
        return Err(
            "Bundled Pinterest downloader metadata is missing upstream.package".to_string(),
        );
    }
    if lock.upstream.version.trim().is_empty() {
        return Err(
            "Bundled Pinterest downloader metadata is missing upstream.version".to_string(),
        );
    }
    if lock.flowselect_sidecar_version.trim().is_empty() {
        return Err(
            "Bundled Pinterest downloader metadata is missing flowselectSidecarVersion".to_string(),
        );
    }

    Ok(PinterestDownloaderInfo {
        current: lock.upstream.version,
        package_name: lock.upstream.package,
        flowselect_sidecar_version: lock.flowselect_sidecar_version,
        update_channel: "app_release".to_string(),
    })
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct YtdlpLatestCacheEntry {
    latest: String,
    fetched_at_ms: u64,
}

fn ytdlp_binary_filename() -> Result<&'static str, String> {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Ok("yt-dlp-x86_64-pc-windows-msvc.exe")
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok("yt-dlp-aarch64-apple-darwin")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Ok("yt-dlp-x86_64-apple-darwin")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Ok("yt-dlp-x86_64-unknown-linux-gnu")
    } else {
        Err(format!(
            "Unsupported platform for yt-dlp update: {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        ))
    }
}

fn ytdlp_download_url() -> Result<&'static str, String> {
    if cfg!(target_os = "windows") {
        Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
    } else if cfg!(target_os = "macos") {
        Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos")
    } else if cfg!(target_os = "linux") {
        Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp")
    } else {
        Err(format!(
            "Unsupported platform for yt-dlp download: {}",
            std::env::consts::OS
        ))
    }
}

fn ytdlp_binary_path(app: &AppHandle) -> Result<PathBuf, String> {
    let file_name = ytdlp_binary_filename()?;
    let candidates = binary_candidate_paths(app, file_name);
    if let Some(path) = candidates.iter().find(|path| path.exists()) {
        println!(">>> [Rust] Using bundled yt-dlp from: {:?}", path);
        return Ok(path.clone());
    }

    candidates
        .into_iter()
        .next()
        .ok_or_else(|| format!("Failed to resolve yt-dlp path for {}", file_name))
}

async fn get_local_ytdlp_version(app: &AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::process::CommandEvent;

    let ytdlp_path = ytdlp_binary_path(app)?;
    let shell = app.shell();
    let (mut rx, _child) = shell
        .command(ytdlp_path.to_string_lossy().to_string())
        .args(["--version"])
        .spawn()
        .map_err(|spawn_err| {
            format!(
                "Failed to spawn yt-dlp for version check at {:?}: {}",
                ytdlp_path, spawn_err
            )
        })?;

    let mut current_version = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                current_version = String::from_utf8_lossy(&line).trim().to_string();
            }
            CommandEvent::Terminated(_) => break,
            _ => {}
        }
    }

    if current_version.is_empty() {
        return Err("Failed to get current yt-dlp version".to_string());
    }

    Ok(current_version)
}

#[tauri::command]
async fn check_ytdlp_version(app: AppHandle) -> Result<YtdlpVersionInfo, String> {
    let current_version = get_local_ytdlp_version(&app).await?;
    let (latest_version, latest_error) = resolve_latest_ytdlp_version(&app).await;
    let update_available = latest_version
        .as_ref()
        .map(|latest_version| current_version != *latest_version);

    Ok(YtdlpVersionInfo {
        current: current_version,
        latest: latest_version,
        update_available,
        latest_error,
    })
}

#[tauri::command]
fn get_pinterest_downloader_info() -> Result<PinterestDownloaderInfo, String> {
    pinterest_downloader_info_from_lock_json(PINTEREST_SIDECAR_LOCK_JSON)
}

#[derive(serde::Serialize, Clone)]
pub struct YtdlpUpdateProgress {
    pub percent: f32,
    pub downloaded: u64,
    pub total: u64,
}

#[tauri::command]
async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    println!(">>> [Rust] Starting yt-dlp update");

    let ytdlp_path = ytdlp_binary_path(&app)?;
    let download_url = ytdlp_download_url()?;
    println!(
        ">>> [Rust] CARGO_MANIFEST_DIR: {}",
        env!("CARGO_MANIFEST_DIR")
    );
    println!(">>> [Rust] ytdlp_path: {:?}", ytdlp_path);
    println!(">>> [Rust] ytdlp_path exists: {}", ytdlp_path.exists());
    println!(">>> [Rust] ytdlp download url: {}", download_url);

    // Download from GitHub
    let client = reqwest::Client::new();
    let response = client
        .get(download_url)
        .header("User-Agent", "FlowSelect-App")
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    // 使用系统临时目录
    let temp_path = std::env::temp_dir().join(format!("yt-dlp-update-{}.tmp", std::process::id()));

    // 确保目标目录存在
    if let Some(parent) = ytdlp_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;

        downloaded += chunk.len() as u64;

        // Emit progress
        let percent = if total_size > 0 {
            (downloaded as f32 / total_size as f32) * 100.0
        } else {
            0.0
        };

        let _ = app.emit(
            "ytdlp-update-progress",
            YtdlpUpdateProgress {
                percent,
                downloaded,
                total: total_size,
            },
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;
    drop(file);

    let mut last_copy_err: Option<std::io::Error> = None;
    for attempt in 1..=3 {
        match tokio::fs::copy(&temp_path, &ytdlp_path).await {
            Ok(_) => {
                last_copy_err = None;
                break;
            }
            Err(err) => {
                println!(
                    ">>> [Rust] yt-dlp binary replace attempt {} failed: {}",
                    attempt, err
                );
                last_copy_err = Some(err);
                if attempt < 3 {
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
            }
        }
    }

    if let Some(err) = last_copy_err {
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(format!(
            "Failed to replace yt-dlp binary at {:?}: {}",
            ytdlp_path, err
        ));
    }

    #[cfg(unix)]
    tokio::fs::set_permissions(&ytdlp_path, std::fs::Permissions::from_mode(0o755))
        .await
        .map_err(|e| format!("Failed to set executable permission: {}", e))?;

    let _ = tokio::fs::remove_file(&temp_path).await;

    let current_version = get_local_ytdlp_version(&app).await?;
    println!(
        ">>> [Rust] yt-dlp updated successfully, current version: {}",
        current_version
    );
    Ok(current_version)
}

fn migrate_legacy_config_if_needed(
    app: &tauri::AppHandle,
    config_dir: &Path,
    config_path: &Path,
) -> Result<(), String> {
    if config_path.exists() {
        return Ok(());
    }

    let base_config_dir = app
        .path()
        .config_dir()
        .map_err(|e| format!("Failed to get base config dir: {}", e))?;

    for legacy_identifier in LEGACY_APP_IDENTIFIERS {
        let legacy_config_path = base_config_dir
            .join(legacy_identifier)
            .join("settings.json");
        if !legacy_config_path.exists() {
            continue;
        }

        fs::create_dir_all(config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
        fs::copy(&legacy_config_path, config_path).map_err(|e| {
            format!(
                "Failed to migrate config from {:?} to {:?}: {}",
                legacy_config_path, config_path, e
            )
        })?;
        println!(
            ">>> [Rust] Migrated config from {:?} to {:?}",
            legacy_config_path, config_path
        );
        break;
    }

    Ok(())
}

fn get_config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;
    let config_path = config_dir.join("settings.json");

    migrate_legacy_config_if_needed(app, &config_dir, &config_path)?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    Ok(config_path)
}

fn get_logs_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config_path = get_config_path(app)?;
    let config_dir = config_path
        .parent()
        .ok_or_else(|| "Failed to resolve config directory".to_string())?;
    let log_dir = config_dir.join("logs");
    fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log dir: {}", e))?;
    Ok(log_dir)
}

fn get_ytdlp_latest_cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_path = get_config_path(app)?;
    let config_dir = config_path
        .parent()
        .ok_or_else(|| "Failed to resolve config directory".to_string())?;
    Ok(config_dir.join(YTDLP_LATEST_CACHE_FILE_NAME))
}

fn read_ytdlp_latest_cache(app: &tauri::AppHandle) -> Option<YtdlpLatestCacheEntry> {
    let cache_path = match get_ytdlp_latest_cache_path(app) {
        Ok(path) => path,
        Err(err) => {
            println!(
                ">>> [Rust] Failed to resolve yt-dlp latest cache path: {}",
                err
            );
            return None;
        }
    };

    if !cache_path.exists() {
        return None;
    }

    let raw = match fs::read_to_string(&cache_path) {
        Ok(raw) => raw,
        Err(err) => {
            println!(
                ">>> [Rust] Failed to read yt-dlp latest cache {:?}: {}",
                cache_path, err
            );
            return None;
        }
    };

    match serde_json::from_str::<YtdlpLatestCacheEntry>(&raw) {
        Ok(entry) => Some(entry),
        Err(err) => {
            println!(
                ">>> [Rust] Failed to parse yt-dlp latest cache {:?}: {}",
                cache_path, err
            );
            None
        }
    }
}

fn write_ytdlp_latest_cache(app: &tauri::AppHandle, latest: &str, fetched_at_ms: u64) {
    let cache_path = match get_ytdlp_latest_cache_path(app) {
        Ok(path) => path,
        Err(err) => {
            println!(
                ">>> [Rust] Failed to resolve yt-dlp latest cache path: {}",
                err
            );
            return;
        }
    };

    let payload = YtdlpLatestCacheEntry {
        latest: latest.to_string(),
        fetched_at_ms,
    };

    let serialized = match serde_json::to_string_pretty(&payload) {
        Ok(serialized) => serialized,
        Err(err) => {
            println!(
                ">>> [Rust] Failed to serialize yt-dlp latest cache: {}",
                err
            );
            return;
        }
    };

    if let Err(err) = fs::write(&cache_path, serialized) {
        println!(
            ">>> [Rust] Failed to write yt-dlp latest cache {:?}: {}",
            cache_path, err
        );
    }
}

async fn fetch_latest_ytdlp_version() -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .header("User-Agent", "FlowSelect-App")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch GitHub API: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API error: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    json.get("tag_name")
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .ok_or("Failed to get tag_name from GitHub response".to_string())
}

async fn resolve_latest_ytdlp_version(app: &tauri::AppHandle) -> (Option<String>, Option<String>) {
    let now_ms = now_timestamp_ms();
    let cached_entry = read_ytdlp_latest_cache(app);

    if let Some(entry) = cached_entry.as_ref() {
        let age_ms = now_ms.saturating_sub(u128::from(entry.fetched_at_ms));
        if age_ms <= YTDLP_LATEST_CACHE_TTL_MS {
            return (Some(entry.latest.clone()), None);
        }
    }

    match fetch_latest_ytdlp_version().await {
        Ok(latest) => {
            let fetched_at_ms = u64::try_from(now_ms).ok().unwrap_or(u64::MAX);
            write_ytdlp_latest_cache(app, &latest, fetched_at_ms);
            (Some(latest), None)
        }
        Err(err) => {
            if let Some(entry) = cached_entry {
                println!(
                    ">>> [Rust] Latest yt-dlp lookup failed, using cached value {}: {}",
                    entry.latest, err
                );
                (Some(entry.latest), Some(err))
            } else {
                println!(
                    ">>> [Rust] Latest yt-dlp lookup failed without cache: {}",
                    err
                );
                (None, Some(err))
            }
        }
    }
}

fn support_log_unavailable(reason: &str) -> String {
    format!("unavailable ({})", sanitize_support_log_field(reason))
}

fn sanitize_support_log_field(value: &str) -> String {
    value.replace(['\r', '\n'], " ").trim().to_string()
}

fn summarize_support_log_text(value: &str, limit: usize) -> String {
    let sanitized = sanitize_runtime_text(value);
    let mut chars = sanitized.chars();
    let preview: String = chars.by_ref().take(limit).collect();
    if chars.next().is_some() {
        format!("{}...", preview)
    } else {
        preview
    }
}

fn support_log_optional_setting(value: Option<&str>) -> String {
    value
        .map(sanitize_support_log_field)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unset".to_string())
}

fn support_log_bool_value(value: bool) -> &'static str {
    if value {
        "true"
    } else {
        "false"
    }
}

fn default_flowselect_output_dir() -> PathBuf {
    desktop_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("FlowSelect_Received")
}

fn resolve_support_log_output_path(
    config: Option<&serde_json::Value>,
    config_parse_error: Option<&str>,
) -> String {
    match config {
        Some(config) => config
            .get("outputPath")
            .and_then(|value| value.as_str())
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(default_flowselect_output_dir)
            .to_string_lossy()
            .to_string(),
        None => support_log_unavailable(config_parse_error.unwrap_or("invalid config JSON")),
    }
}

fn summarize_support_log_file_path(raw: Option<&str>) -> Option<String> {
    let sanitized = sanitize_support_log_field(raw?);
    if sanitized.is_empty() {
        return None;
    }
    Some(
        Path::new(&sanitized)
            .file_name()
            .and_then(|value| value.to_str())
            .map(sanitize_support_log_field)
            .filter(|value| !value.is_empty())
            .unwrap_or(sanitized),
    )
}

fn push_support_log_detail(parts: &mut Vec<String>, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        parts.push(format!("{}={}", key, value));
    }
}

fn build_support_log_runtime_line(
    ts_ms: Option<u64>,
    trace_id: Option<&str>,
    kind: &str,
    event: &str,
    details: Vec<String>,
) -> String {
    let mut parts = Vec::with_capacity(details.len() + 4);
    parts.push(format!(
        "ts_ms={}",
        ts_ms
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string())
    ));
    if let Some(trace_id) = trace_id.filter(|value| !value.is_empty()) {
        parts.push(format!("trace_id={}", trace_id));
    }
    parts.push(format!("kind={}", kind));
    parts.push(format!("event={}", event));
    parts.extend(details);
    parts.join(" ")
}

fn render_support_log_download_event(
    ts_ms: Option<u64>,
    trace_id: Option<&str>,
    event: &str,
    payload: Option<&serde_json::Value>,
) -> Option<String> {
    let null_payload = serde_json::Value::Null;
    let payload = payload.unwrap_or(&null_payload);

    match event {
        "start" => {
            let mode = payload.get("mode").and_then(|value| value.as_str())?;
            let mut details = vec![format!("mode={}", sanitize_support_log_field(mode))];
            push_support_log_detail(
                &mut details,
                "platform",
                payload
                    .get("platform")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "url",
                payload
                    .get("url")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "resolved_url",
                payload
                    .get("resolvedUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "page_url",
                payload
                    .get("pageUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "pin_id",
                payload
                    .get("pinId")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "quality",
                payload
                    .get("quality")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "mime_type",
                payload
                    .get("mimeType")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "original_filename",
                summarize_support_log_file_path(
                    payload
                        .get("originalFilename")
                        .and_then(|value| value.as_str()),
                ),
            );
            push_support_log_detail(
                &mut details,
                "clip_mode",
                payload
                    .get("clipMode")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "has_clip_range",
                payload
                    .get("hasClipRange")
                    .and_then(|value| value.as_bool())
                    .map(|value| support_log_bool_value(value).to_string()),
            );
            push_support_log_detail(
                &mut details,
                "rename_enabled",
                payload
                    .get("renameEnabled")
                    .and_then(|value| value.as_bool())
                    .map(|value| support_log_bool_value(value).to_string()),
            );
            push_support_log_detail(
                &mut details,
                "ae_friendly_conversion_enabled",
                payload
                    .get("aeFriendlyConversionEnabled")
                    .and_then(|value| value.as_bool())
                    .map(|value| support_log_bool_value(value).to_string()),
            );
            push_support_log_detail(
                &mut details,
                "output_dir",
                payload
                    .get("outputDir")
                    .or_else(|| payload.get("outputPath"))
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            Some(build_support_log_runtime_line(
                ts_ms,
                trace_id,
                "lifecycle",
                event,
                details,
            ))
        }
        "complete" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "mode",
                payload
                    .get("mode")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "platform",
                payload
                    .get("platform")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "resolved_url",
                payload
                    .get("resolvedUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "mime_type",
                payload
                    .get("mimeType")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "content_type",
                payload
                    .get("contentType")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "original_filename",
                summarize_support_log_file_path(
                    payload
                        .get("originalFilename")
                        .and_then(|value| value.as_str()),
                ),
            );
            push_support_log_detail(
                &mut details,
                "source_filename",
                summarize_support_log_file_path(
                    payload
                        .get("sourceFilename")
                        .and_then(|value| value.as_str()),
                ),
            );
            push_support_log_detail(
                &mut details,
                "success",
                payload
                    .get("success")
                    .and_then(|value| value.as_bool())
                    .map(|value| support_log_bool_value(value).to_string()),
            );
            push_support_log_detail(
                &mut details,
                "file",
                summarize_support_log_file_path(
                    payload.get("filePath").and_then(|value| value.as_str()),
                ),
            );
            push_support_log_detail(
                &mut details,
                "exit_code",
                payload
                    .get("exitCode")
                    .and_then(|value| value.as_i64())
                    .map(|value| value.to_string()),
            );
            push_support_log_detail(
                &mut details,
                "error",
                payload
                    .get("error")
                    .and_then(|value| value.as_str())
                    .map(|value| summarize_support_log_text(value, SUPPORT_LOG_TEXT_PREVIEW_LIMIT)),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "terminal", event, details,
            ))
        }
        "protected_image_fallback_requested" => {
            let mut details = vec!["mode=protected_image_fallback".to_string()];
            push_support_log_detail(
                &mut details,
                "resolved_url",
                payload
                    .get("resolvedUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "page_url",
                payload
                    .get("pageUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "output_dir",
                payload
                    .get("outputDir")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "route", event, details,
            ))
        }
        "protected_image_fallback_complete" => {
            let mut details = vec!["mode=protected_image_fallback".to_string()];
            push_support_log_detail(
                &mut details,
                "resolved_url",
                payload
                    .get("resolvedUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "page_url",
                payload
                    .get("pageUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "success",
                payload
                    .get("success")
                    .and_then(|value| value.as_bool())
                    .map(|value| support_log_bool_value(value).to_string()),
            );
            push_support_log_detail(
                &mut details,
                "file",
                summarize_support_log_file_path(
                    payload.get("filePath").and_then(|value| value.as_str()),
                ),
            );
            push_support_log_detail(
                &mut details,
                "code",
                payload
                    .get("code")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "error",
                payload
                    .get("error")
                    .and_then(|value| value.as_str())
                    .map(|value| summarize_support_log_text(value, SUPPORT_LOG_TEXT_PREVIEW_LIMIT)),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "terminal", event, details,
            ))
        }
        "http_416_retry"
        | "youtube_cookie_retry"
        | "ae_safe_probe_warning"
        | "ae_safe_gpu_fallback" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "reason",
                payload
                    .get("reason")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "disable_resume_artifacts",
                payload
                    .get("disableResumeArtifacts")
                    .and_then(|value| value.as_bool())
                    .map(|value| support_log_bool_value(value).to_string()),
            );
            push_support_log_detail(
                &mut details,
                "gpu_encoder",
                payload
                    .get("gpuEncoder")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "path",
                summarize_support_log_file_path(
                    payload.get("path").and_then(|value| value.as_str()),
                ),
            );
            push_support_log_detail(
                &mut details,
                "error",
                payload
                    .get("error")
                    .and_then(|value| value.as_str())
                    .map(|value| summarize_support_log_text(value, SUPPORT_LOG_TEXT_PREVIEW_LIMIT)),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "warning", event, details,
            ))
        }
        _ => None,
    }
}

fn render_support_log_download_trace_event(
    ts_ms: Option<u64>,
    trace_id: Option<&str>,
    event: &str,
    payload: Option<&serde_json::Value>,
) -> Option<String> {
    let null_payload = serde_json::Value::Null;
    let payload = payload.unwrap_or(&null_payload);
    let nested_payload = payload.get("payload").unwrap_or(payload);

    match event {
        "route_policy" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "policy",
                nested_payload
                    .get("policy")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "route", event, details,
            ))
        }
        "route_selected" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "route",
                nested_payload
                    .get("route")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "platform",
                nested_payload
                    .get("platform")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "attempt",
                nested_payload
                    .get("attempt")
                    .and_then(|value| value.as_u64())
                    .map(|value| value.to_string()),
            );
            push_support_log_detail(
                &mut details,
                "reason",
                nested_payload
                    .get("reason")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "source",
                nested_payload
                    .get("source")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "route", event, details,
            ))
        }
        "attempt_start" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "attempt",
                nested_payload
                    .get("attempt")
                    .and_then(|value| value.as_u64())
                    .map(|value| value.to_string()),
            );
            push_support_log_detail(
                &mut details,
                "route",
                nested_payload
                    .get("route")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            Some(build_support_log_runtime_line(
                ts_ms,
                trace_id,
                "lifecycle",
                event,
                details,
            ))
        }
        "attempt_failed" | "pinterest_hint_fallback_selected" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "attempt",
                nested_payload
                    .get("attempt")
                    .and_then(|value| value.as_u64())
                    .map(|value| value.to_string()),
            );
            push_support_log_detail(
                &mut details,
                "route",
                nested_payload
                    .get("route")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "reason",
                nested_payload
                    .get("reason")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "pin_id",
                nested_payload
                    .get("pinId")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "video_url",
                nested_payload
                    .get("videoUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "error",
                nested_payload
                    .get("error")
                    .or_else(|| nested_payload.get("resolverError"))
                    .and_then(|value| value.as_str())
                    .map(|value| summarize_support_log_text(value, SUPPORT_LOG_TEXT_PREVIEW_LIMIT)),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "warning", event, details,
            ))
        }
        "fallback_selected" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "from_route",
                nested_payload
                    .get("fromRoute")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "reason",
                nested_payload
                    .get("reason")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "error",
                nested_payload
                    .get("error")
                    .and_then(|value| value.as_str())
                    .map(|value| summarize_support_log_text(value, SUPPORT_LOG_TEXT_PREVIEW_LIMIT)),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "route", event, details,
            ))
        }
        "terminal" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "outcome",
                nested_payload
                    .get("outcome")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "final_route",
                nested_payload
                    .get("finalRoute")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "route_chain",
                nested_payload
                    .get("routeChain")
                    .and_then(|value| value.as_array())
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|item| item.as_str())
                            .map(sanitize_support_log_field)
                            .collect::<Vec<_>>()
                            .join(">")
                    })
                    .filter(|value| !value.is_empty()),
            );
            push_support_log_detail(
                &mut details,
                "duration_ms",
                nested_payload
                    .get("durationMs")
                    .and_then(|value| value.as_u64())
                    .map(|value| value.to_string()),
            );
            push_support_log_detail(
                &mut details,
                "error",
                nested_payload
                    .get("error")
                    .and_then(|value| value.as_str())
                    .map(|value| summarize_support_log_text(value, SUPPORT_LOG_TEXT_PREVIEW_LIMIT)),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "terminal", event, details,
            ))
        }
        "pinterest_candidate_selected" => {
            let mut details = Vec::new();
            push_support_log_detail(
                &mut details,
                "pin_id",
                nested_payload
                    .get("pinId")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            push_support_log_detail(
                &mut details,
                "video_url",
                nested_payload
                    .get("videoUrl")
                    .and_then(|value| value.as_str())
                    .map(sanitize_support_log_field),
            );
            Some(build_support_log_runtime_line(
                ts_ms, trace_id, "route", event, details,
            ))
        }
        _ => None,
    }
}

fn build_support_log_runtime_evidence_lines(raw_lines: &[String]) -> Vec<String> {
    let mut evidence_lines = raw_lines
        .iter()
        .filter_map(|raw_line| {
            let parsed = match serde_json::from_str::<serde_json::Value>(raw_line) {
                Ok(parsed) => parsed,
                Err(_) => {
                    let preview =
                        summarize_support_log_text(raw_line, SUPPORT_LOG_TEXT_PREVIEW_LIMIT);
                    let lowered = preview.to_ascii_lowercase();
                    return if lowered.contains("error") || lowered.contains("warning") {
                        Some(build_support_log_runtime_line(
                            None,
                            None,
                            "warning",
                            "raw_line",
                            vec![format!("message={}", preview)],
                        ))
                    } else {
                        None
                    };
                }
            };

            let scope = parsed.get("scope").and_then(|value| value.as_str())?;
            let event = parsed.get("event").and_then(|value| value.as_str())?;
            let ts_ms = parsed.get("tsMs").and_then(|value| value.as_u64());
            let trace_id = parsed.get("traceId").and_then(|value| value.as_str());
            let payload = parsed.get("payload");

            match scope {
                "download" => render_support_log_download_event(ts_ms, trace_id, event, payload),
                "download_trace" => {
                    render_support_log_download_trace_event(ts_ms, trace_id, event, payload)
                }
                _ => None,
            }
        })
        .collect::<Vec<_>>();

    if evidence_lines.len() > SUPPORT_LOG_RUNTIME_EVIDENCE_LINE_LIMIT {
        evidence_lines.drain(..evidence_lines.len() - SUPPORT_LOG_RUNTIME_EVIDENCE_LINE_LIMIT);
    }

    evidence_lines
}

fn build_support_log_settings_lines(
    config: Option<&serde_json::Value>,
    output_path: &str,
    autostart: &str,
    shortcut: &str,
    config_parse_error: Option<&str>,
) -> Vec<String> {
    let mut lines = Vec::new();

    if let Some(err) = config_parse_error {
        lines.push(format!(
            "config_parse_error={}",
            summarize_support_log_text(err, SUPPORT_LOG_TEXT_PREVIEW_LIMIT)
        ));
    }

    lines.push(format!(
        "output_path={}",
        sanitize_support_log_field(output_path)
    ));
    lines.push(format!(
        "autostart={}",
        sanitize_support_log_field(autostart)
    ));
    lines.push(format!(
        "shortcut={}",
        support_log_optional_setting(Some(shortcut))
    ));

    if let Some(config) = config {
        let rename_rule = get_rename_rule_config(config);
        let preferences = VideoDownloadPreferences::from_config(config);
        lines.push(format!(
            "rename_media_on_download={}",
            support_log_bool_value(is_rename_media_enabled(config))
        ));
        lines.push(format!(
            "rename_rule_preset={}",
            rename_rule.preset.as_counter_key()
        ));
        lines.push(format!(
            "rename_prefix={}",
            support_log_optional_setting(Some(rename_rule.prefix.as_str()))
        ));
        lines.push(format!(
            "rename_suffix={}",
            support_log_optional_setting(Some(rename_rule.suffix.as_str()))
        ));
        lines.push(format!(
            "ae_portal_enabled={}",
            support_log_bool_value(
                config
                    .get("aePortalEnabled")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false)
            )
        ));
        lines.push(format!(
            "ae_exe_path={}",
            support_log_optional_setting(config.get("aeExePath").and_then(|value| value.as_str()))
        ));
        lines.push(format!(
            "video_download_quality={}",
            preferences.ytdlp_quality.as_str()
        ));
        lines.push(format!(
            "ae_friendly_conversion_enabled={}",
            support_log_bool_value(preferences.ae_friendly_conversion_enabled)
        ));
    } else {
        let unavailable = support_log_unavailable("invalid config JSON");
        lines.push(format!("rename_media_on_download={}", unavailable));
        lines.push(format!("rename_rule_preset={}", unavailable));
        lines.push(format!("rename_prefix={}", unavailable));
        lines.push(format!("rename_suffix={}", unavailable));
        lines.push(format!("ae_portal_enabled={}", unavailable));
        lines.push(format!("ae_exe_path={}", unavailable));
        lines.push(format!("video_download_quality={}", unavailable));
        lines.push(format!("ae_friendly_conversion_enabled={}", unavailable));
    }

    lines
}

fn render_support_log_section(title: &str, lines: &[String]) -> String {
    let mut rendered = format!("[{}]\n", title);
    for line in lines {
        rendered.push_str(line);
        rendered.push('\n');
    }
    rendered
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = get_config_path(&app)?;

    if config_path.exists() {
        fs::read_to_string(&config_path).map_err(|e| format!("Failed to read config: {}", e))
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let config_path = get_config_path(&app)?;
    let previous_language = if config_path.exists() {
        fs::read_to_string(&config_path)
            .ok()
            .and_then(|config_str| resolve_language_from_config_str(&config_str))
            .unwrap_or(FALLBACK_LANGUAGE)
    } else {
        FALLBACK_LANGUAGE
    };
    let next_language = resolve_language_from_config_str(&json);

    fs::write(&config_path, &json).map_err(|e| format!("Failed to write config: {}", e))?;

    if let Some(next_language) = next_language {
        if previous_language != next_language {
            println!(
                ">>> [Rust] Language changed: {} -> {}",
                previous_language, next_language
            );
            notify_language_changed(&app, next_language);
        }
    } else {
        println!(
            ">>> [Rust] Skipped language sync after save_config because config JSON is invalid"
        );
    }

    Ok(())
}

fn persist_output_path(app: tauri::AppHandle, next_output_path: String) -> Result<bool, String> {
    let config_str = get_config(app.clone())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    let previous_output_path = config
        .get("outputPath")
        .and_then(|value| value.as_str())
        .unwrap_or("");

    if previous_output_path == next_output_path {
        return Ok(false);
    }

    config["outputPath"] = serde_json::Value::String(next_output_path.clone());
    let json =
        serde_json::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;
    save_config(app.clone(), json)?;
    let _ = app.emit(
        "output-path-changed",
        serde_json::json!({ "path": next_output_path }),
    );
    reset_rename_counter(app)?;
    Ok(true)
}

fn resolve_current_output_folder_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config
        .get("outputPath")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            desktop_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("FlowSelect_Received")
        }))
}

fn close_context_menu_window(app: &tauri::AppHandle) {
    if let Some(context_menu) = app.get_webview_window("context-menu") {
        let _ = app.emit("context-menu-closed", ());
        let _ = context_menu.close();
    }
}

#[derive(Clone, Copy, Debug)]
struct VideoDownloadPreferences {
    ytdlp_quality: YtdlpQualityPreference,
    ae_friendly_conversion_enabled: bool,
}

impl Default for VideoDownloadPreferences {
    fn default() -> Self {
        Self {
            ytdlp_quality: YtdlpQualityPreference::Balanced,
            ae_friendly_conversion_enabled: false,
        }
    }
}

impl VideoDownloadPreferences {
    fn from_config(config: &serde_json::Value) -> Self {
        let quality_raw = config
            .get(DEFAULT_VIDEO_DOWNLOAD_QUALITY_CONFIG_KEY)
            .and_then(|value| value.as_str())
            .or_else(|| {
                config
                    .get(LEGACY_VIDEO_DOWNLOAD_QUALITY_CONFIG_KEY)
                    .and_then(|value| value.as_str())
            });

        Self {
            ytdlp_quality: YtdlpQualityPreference::parse_optional(quality_raw)
                .unwrap_or(YtdlpQualityPreference::Balanced),
            ae_friendly_conversion_enabled: config
                .get(AE_FRIENDLY_CONVERSION_CONFIG_KEY)
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
        }
    }

    fn merged_with(
        self,
        ytdlp_quality: Option<YtdlpQualityPreference>,
        ae_friendly_conversion_enabled: Option<bool>,
    ) -> Self {
        Self {
            ytdlp_quality: ytdlp_quality.unwrap_or(self.ytdlp_quality),
            ae_friendly_conversion_enabled: ae_friendly_conversion_enabled
                .unwrap_or(self.ae_friendly_conversion_enabled),
        }
    }
}

#[tauri::command]
fn begin_open_output_folder_from_context_menu(app: tauri::AppHandle) -> Result<(), String> {
    close_context_menu_window(&app);
    let path = resolve_current_output_folder_path(&app)?;
    open_folder(path.to_string_lossy().to_string())
}

#[tauri::command]
fn begin_pick_output_folder_from_context_menu(app: tauri::AppHandle) -> Result<(), String> {
    close_context_menu_window(&app);

    let main_always_on_top = app
        .get_webview_window("main")
        .and_then(|window| window.is_always_on_top().ok())
        .unwrap_or(false);

    if let Some(window) = app.get_webview_window("main") {
        if main_always_on_top {
            let _ = window.set_always_on_top(false);
        }
        let _ = window.set_focus();
    }

    let app_handle = app.clone();
    app.dialog().file().pick_folder(move |folder_path| {
        if let Some(window) = app_handle.get_webview_window("main") {
            if main_always_on_top {
                let _ = window.set_always_on_top(true);
            }
            let _ = window.set_focus();
        }

        let Some(folder_path) = folder_path else {
            return;
        };

        let path = match folder_path.into_path() {
            Ok(path) => path,
            Err(err) => {
                eprintln!(
                    ">>> [Rust] Failed to convert picked output folder path: {}",
                    err
                );
                return;
            }
        };
        let selected = path.to_string_lossy().to_string();

        if let Err(err) = persist_output_path(app_handle.clone(), selected) {
            eprintln!(
                ">>> [Rust] Failed to persist output folder from context menu: {}",
                err
            );
        }
    });

    Ok(())
}

#[tauri::command]
async fn export_support_log(app: AppHandle) -> Result<String, String> {
    let config_path = get_config_path(&app)?;
    let log_dir = get_logs_dir(&app)?;

    let generated_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to get current time: {}", e))?
        .as_millis();
    let log_path = log_dir.join(format!("flowselect-support-{}.log", generated_unix_ms));
    let runtime_log_path = runtime_log_path(&log_dir);
    let runtime_log_lines = read_runtime_log_lines(&log_dir);

    let config_raw = get_config(app.clone())?;
    let (config_value, config_parse_error) =
        match serde_json::from_str::<serde_json::Value>(&config_raw) {
            Ok(value) => (Some(value), None),
            Err(err) => (None, Some(err.to_string())),
        };
    let current_exe = std::env::current_exe()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|err| format!("unavailable ({})", err));
    let ytdlp_path = ytdlp_binary_path(&app)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|err| format!("unavailable ({})", err));
    let ffmpeg_path = ffmpeg_binary_path(&app)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|err| format!("unavailable ({})", err));
    let pinterest_path = pinterest_downloader_binary_path(&app)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|err| format!("unavailable ({})", err));
    let ytdlp_version = match get_local_ytdlp_version(&app).await {
        Ok(version) => version,
        Err(err) => format!("unavailable ({})", err),
    };
    let pinterest_info = get_pinterest_downloader_info();
    let output_path =
        resolve_support_log_output_path(config_value.as_ref(), config_parse_error.as_deref());
    let autostart = match get_autostart(app.clone()) {
        Ok(enabled) => support_log_bool_value(enabled).to_string(),
        Err(err) => support_log_unavailable(err.as_str()),
    };
    let shortcut = match config_value.as_ref() {
        Some(config) => config
            .get("shortcut")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string(),
        None => support_log_unavailable(
            config_parse_error
                .as_deref()
                .unwrap_or("invalid config JSON"),
        ),
    };
    let runtime_evidence_lines = build_support_log_runtime_evidence_lines(&runtime_log_lines);

    let environment_lines = vec![
        format!("app_version={}", env!("CARGO_PKG_VERSION")),
        format!("generated_unix_ms={}", generated_unix_ms),
        format!("os={}", std::env::consts::OS),
        format!("arch={}", std::env::consts::ARCH),
        format!("current_exe={}", current_exe),
        format!("config_path={}", config_path.display()),
        format!("log_path={}", log_path.display()),
        format!("runtime_log_path={}", runtime_log_path.display()),
    ];
    let settings_lines = build_support_log_settings_lines(
        config_value.as_ref(),
        output_path.as_str(),
        autostart.as_str(),
        shortcut.as_str(),
        config_parse_error.as_deref(),
    );
    let mut downloader_lines = vec![
        format!("yt_dlp_path={}", ytdlp_path),
        format!("yt_dlp_version={}", ytdlp_version),
        format!("pin_dlp_path={}", pinterest_path),
        format!("ffmpeg_path={}", ffmpeg_path),
    ];
    match pinterest_info {
        Ok(info) => {
            downloader_lines.push(format!("pin_dlp_version={}", info.current));
            downloader_lines.push(format!("pin_dlp_package_name={}", info.package_name));
            downloader_lines.push(format!(
                "pin_dlp_flowselect_sidecar_version={}",
                info.flowselect_sidecar_version
            ));
            downloader_lines.push(format!("pin_dlp_update_channel={}", info.update_channel));
        }
        Err(err) => {
            let unavailable = support_log_unavailable(err.as_str());
            downloader_lines.push(format!("pin_dlp_version={}", unavailable));
            downloader_lines.push(format!("pin_dlp_package_name={}", unavailable));
            downloader_lines.push(format!(
                "pin_dlp_flowselect_sidecar_version={}",
                unavailable
            ));
            downloader_lines.push(format!("pin_dlp_update_channel={}", unavailable));
        }
    }
    let runtime_section_lines = if runtime_evidence_lines.is_empty() {
        vec!["unavailable (no relevant runtime evidence found)".to_string()]
    } else {
        runtime_evidence_lines
    };

    let log_contents = format!(
        concat!(
            "FlowSelect Diagnostic Log\n",
            "=========================\n\n",
            "{}\n",
            "{}\n",
            "{}\n",
            "{}"
        ),
        render_support_log_section("environment", &environment_lines),
        render_support_log_section("settings", &settings_lines),
        render_support_log_section("downloaders", &downloader_lines),
        render_support_log_section("runtime_evidence", &runtime_section_lines)
    );

    fs::write(&log_path, log_contents)
        .map_err(|e| format!("Failed to write support log: {}", e))?;
    println!(">>> [Rust] Support log exported to {:?}", log_path);

    Ok(log_path.to_string_lossy().to_string())
}

#[tauri::command]
fn reset_rename_counter(app: tauri::AppHandle) -> Result<bool, String> {
    let config_str = get_config(app.clone())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    clear_rename_sequence_counters(&mut config)?;

    let json =
        serde_json::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;
    save_config(app, json)?;
    println!(">>> [Rust] Rename counter reset");
    Ok(true)
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("Failed to get autostart status: {}", e))
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    if enabled {
        autostart
            .enable()
            .map_err(|e| format!("Failed to enable autostart: {}", e))
    } else {
        autostart
            .disable()
            .map_err(|e| format!("Failed to disable autostart: {}", e))
    }
}

#[tauri::command]
fn get_current_shortcut(app: AppHandle) -> Result<String, String> {
    let config_str = get_config(app)?;
    let config: serde_json::Value =
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config
        .get("shortcut")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

fn register_shortcut_internal(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let shortcut_manager = app.global_shortcut();
    let state = app.state::<RegisteredShortcut>();

    // Unregister old shortcut first
    if let Some(old_shortcut) = state.current.lock().unwrap().take() {
        let _ = shortcut_manager.unregister(old_shortcut);
    }

    if shortcut.is_empty() {
        return Ok(());
    }

    // Parse and register new shortcut
    let new_shortcut: Shortcut = shortcut
        .parse()
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;

    let app_handle = app.clone();
    shortcut_manager
        .on_shortcut(new_shortcut.clone(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let now_ms = now_timestamp_ms();
                {
                    let state = app_handle.state::<RegisteredShortcut>();
                    let mut last_trigger_ms = state.last_trigger_ms.lock().unwrap();
                    if now_ms.saturating_sub(*last_trigger_ms) < SHORTCUT_TOGGLE_COOLDOWN_MS {
                        return;
                    }
                    *last_trigger_ms = now_ms;
                }

                let app_for_main_thread = app_handle.clone();
                let dispatch_result = app_handle.run_on_main_thread(move || {
                    if let Some(window) = app_for_main_thread.get_webview_window("main") {
                        let is_visible = window.is_visible().unwrap_or(false);
                        let is_focused = window.is_focused().unwrap_or(false);
                        let cursor_position = app_for_main_thread
                            .cursor_position()
                            .ok()
                            .or_else(|| window.cursor_position().ok());

                        let should_hide = if is_visible && is_focused {
                            if let Some(cursor) = cursor_position {
                                is_cursor_inside_window(&window, cursor.x, cursor.y)
                            } else {
                                true
                            }
                        } else {
                            false
                        };

                        if should_hide {
                            let _ = window.hide();
                            return;
                        }

                        let position =
                            resolve_main_window_position_near_cursor(&app_for_main_thread, &window);
                        show_main_window(&app_for_main_thread, position);
                    }
                });

                if let Err(err) = dispatch_result {
                    println!(">>> [Rust] shortcut main-thread dispatch failed: {}", err);
                }
            }
        })
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    // Store the new shortcut
    *state.current.lock().unwrap() = Some(new_shortcut);

    Ok(())
}

#[tauri::command]
fn register_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    register_shortcut_internal(&app, &shortcut)
}

#[tauri::command]
fn unregister_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    if shortcut.is_empty() {
        return Ok(());
    }

    let shortcut_manager = app.global_shortcut();
    let state = app.state::<RegisteredShortcut>();

    let parsed: Shortcut = shortcut
        .parse()
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;

    shortcut_manager
        .unregister(parsed)
        .map_err(|e| format!("Failed to unregister shortcut: {}", e))?;

    // Clear stored shortcut
    *state.current.lock().unwrap() = None;

    Ok(())
}

#[tauri::command]
fn set_window_size(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| format!("Failed to set window size: {}", e))
    } else {
        Err("Window not found".to_string())
    }
}

#[tauri::command]
fn set_window_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        println!(">>> [Rust] set_window_position physical=({}, {})", x, y);
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(|e| format!("Failed to set window position: {}", e))
    } else {
        Err("Window not found".to_string())
    }
}

#[tauri::command]
fn is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let open_command = match std::env::consts::OS {
        "windows" => "explorer",
        "macos" => "open",
        "linux" => "xdg-open",
        os => {
            return Err(format!(
                "Opening folder is not supported on platform: {}",
                os
            ))
        }
    };

    std::process::Command::new(open_command)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open folder with {}: {}", open_command, e))?;

    Ok(())
}

#[tauri::command]
fn toggle_devtools(app: AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        if let Some(window) = app
            .get_webview_window("settings")
            .or_else(|| app.get_webview_window("main"))
        {
            window.open_devtools();
            return Ok(());
        }
        return Err("Window not found".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        return Err(
            "Windows WebView2 limitation: programmatic close_devtools is unsupported".to_string(),
        );
    }

    #[cfg(not(target_os = "windows"))]
    let mut closed_any = false;
    #[cfg(not(target_os = "windows"))]
    if let Some(window) = app.get_webview_window("settings") {
        window.close_devtools();
        closed_any = true;
    }
    #[cfg(not(target_os = "windows"))]
    if let Some(window) = app.get_webview_window("main") {
        window.close_devtools();
        closed_any = true;
    }

    #[cfg(not(target_os = "windows"))]
    if closed_any {
        Ok(())
    } else {
        Err("Window not found".to_string())
    }
}

#[tauri::command]
async fn start_ws_server_internal(app: &AppHandle) -> Result<String, String> {
    let state = app.state::<WsServerState>();

    // Check if already running
    if *state.is_running.lock().unwrap() {
        return Ok("WebSocket server already running".to_string());
    }

    let addr: SocketAddr = "127.0.0.1:39527".parse().unwrap();

    // Use socket2 to set SO_REUSEADDR before binding
    let socket = socket2::Socket::new(
        socket2::Domain::IPV4,
        socket2::Type::STREAM,
        Some(socket2::Protocol::TCP),
    )
    .map_err(|e| format!("Failed to create socket: {}", e))?;

    socket
        .set_reuse_address(true)
        .map_err(|e| format!("Failed to set reuse address: {}", e))?;
    socket
        .bind(&addr.into())
        .map_err(|e| format!("Failed to bind: {}", e))?;
    socket
        .listen(128)
        .map_err(|e| format!("Failed to listen: {}", e))?;
    socket
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to set nonblocking: {}", e))?;

    let std_listener: std::net::TcpListener = socket.into();
    let listener = tokio::net::TcpListener::from_std(std_listener)
        .map_err(|e| format!("Failed to convert to tokio listener: {}", e))?;

    // Create shutdown channel
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    *state.shutdown_tx.lock().unwrap() = Some(shutdown_tx.clone());
    *state.is_running.lock().unwrap() = true;

    // Create broadcast channel for client messages
    let (broadcast_tx, _) = broadcast::channel::<String>(16);
    *state.broadcast_tx.lock().unwrap() = Some(broadcast_tx.clone());

    let app_handle = app.clone();

    // Spawn server task
    tokio::spawn(async move {
        loop {
            let mut shutdown_rx = shutdown_tx.subscribe();

            tokio::select! {
                result = listener.accept() => {
                    if let Ok((stream, _)) = result {
                        let app_clone = app_handle.clone();
                        let broadcast_rx = broadcast_tx.subscribe();
                        tokio::spawn(handle_ws_connection(stream, app_clone, broadcast_rx));
                    }
                }
                _ = shutdown_rx.recv() => {
                    println!(">>> [WS] Server shutting down");
                    break;
                }
            }
        }
    });

    println!(">>> [WS] Server started on {}", addr);
    Ok(format!("WebSocket server started on {}", addr))
}

#[tauri::command]
async fn start_ws_server(app: AppHandle) -> Result<String, String> {
    start_ws_server_internal(&app).await
}

async fn handle_ws_connection(
    stream: tokio::net::TcpStream,
    app: AppHandle,
    mut broadcast_rx: broadcast::Receiver<String>,
) {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            println!(">>> [WS] Handshake failed: {}", e);
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();
    println!(">>> [WS] Client connected");
    let mut disconnect_error: Option<String> = None;

    loop {
        tokio::select! {
            // Handle incoming messages from client
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let response = process_ws_message(&text, &app).await;
                        let json = serde_json::to_string(&response).unwrap_or_default();
                        if write.send(Message::Text(json)).await.is_err() {
                            disconnect_error = Some("response send failed".to_string());
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(err)) => {
                        disconnect_error = Some(format!("read error: {}", err));
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
            // Handle broadcast messages
            broadcast_msg = broadcast_rx.recv() => {
                match broadcast_msg {
                    Ok(msg) => {
                        if write.send(Message::Text(msg)).await.is_err() {
                            disconnect_error = Some("broadcast send failed".to_string());
                            break;
                        }
                    }
                    Err(err) => {
                        disconnect_error = Some(format!("broadcast recv error: {}", err));
                        break;
                    }
                }
            }
        }
    }
    if let Some(err) = disconnect_error {
        println!(">>> [WS] Client disconnected with error: {}", err);
    }
}

async fn process_ws_message(text: &str, app: &AppHandle) -> WsResponse {
    let msg: WsMessage = match serde_json::from_str(text) {
        Ok(m) => m,
        Err(e) => {
            return WsResponse {
                success: false,
                message: Some(format!("Invalid JSON: {}", e)),
                data: None,
            };
        }
    };

    println!(">>> [WS] Action: {}", msg.action);

    match msg.action.as_str() {
        "ping" => WsResponse {
            success: true,
            message: Some("pong".to_string()),
            data: None,
        },
        "get_theme" => match get_config(app.clone()) {
            Ok(config_str) => {
                let config: serde_json::Value =
                    serde_json::from_str(&config_str).unwrap_or_default();
                let theme = config
                    .get("theme")
                    .and_then(|v| v.as_str())
                    .unwrap_or("black")
                    .to_string();
                WsResponse {
                    success: true,
                    message: None,
                    data: Some(serde_json::json!({
                        "action": "theme_info",
                        "theme": theme
                    })),
                }
            }
            Err(e) => WsResponse {
                success: false,
                message: Some(format!("Failed to get config: {}", e)),
                data: None,
            },
        },
        WS_ACTION_GET_LANGUAGE => {
            let language = get_config(app.clone())
                .ok()
                .and_then(|config_str| resolve_language_from_config_str(&config_str))
                .unwrap_or(FALLBACK_LANGUAGE);
            WsResponse {
                success: true,
                message: None,
                data: Some(serde_json::json!({
                    "action": WS_ACTION_LANGUAGE_INFO,
                    "language": language
                })),
            }
        }
        "sync_download_preferences" => {
            if let Some(data) = msg.data {
                let incoming_quality = parse_ytdlp_quality_preference_override(&data);
                let incoming_ae = parse_ae_friendly_conversion_enabled_override(&data);

                if incoming_quality.is_none() && incoming_ae.is_none() {
                    return WsResponse {
                        success: false,
                        message: Some("Missing download preference fields".to_string()),
                        data: None,
                    };
                }

                match resolve_video_download_preferences(app) {
                    Ok(current_preferences) => {
                        let next_preferences =
                            current_preferences.merged_with(incoming_quality, incoming_ae);
                        match persist_video_download_preferences(app.clone(), next_preferences) {
                            Ok(_) => WsResponse {
                                success: true,
                                message: Some("Download preferences synced".to_string()),
                                data: Some(serde_json::json!({
                                    "quality": next_preferences.ytdlp_quality.as_str(),
                                    "aeFriendlyConversionEnabled": next_preferences.ae_friendly_conversion_enabled,
                                })),
                            },
                            Err(err) => WsResponse {
                                success: false,
                                message: Some(format!(
                                    "Failed to persist download preferences: {}",
                                    err
                                )),
                                data: None,
                            },
                        }
                    }
                    Err(err) => WsResponse {
                        success: false,
                        message: Some(format!("Failed to resolve download preferences: {}", err)),
                        data: None,
                    },
                }
            } else {
                WsResponse {
                    success: false,
                    message: Some("Missing data".to_string()),
                    data: None,
                }
            }
        }
        "save_image" => {
            if let Some(data) = msg.data {
                let url = data.get("url").and_then(|v| v.as_str());
                if let Some(url) = url {
                    match download_image(app.clone(), url.to_string(), None, None).await {
                        Ok(path) => WsResponse {
                            success: true,
                            message: Some(path),
                            data: None,
                        },
                        Err(e) => WsResponse {
                            success: false,
                            message: Some(e),
                            data: None,
                        },
                    }
                } else {
                    WsResponse {
                        success: false,
                        message: Some("Missing url".to_string()),
                        data: None,
                    }
                }
            } else {
                WsResponse {
                    success: false,
                    message: Some("Missing data".to_string()),
                    data: None,
                }
            }
        }
        "save_data_url" => {
            if let Some(data) = msg.data {
                let request_id = extract_ws_request_id(&data);
                let with_request_id = |code: Option<&str>| build_ws_request_data(&request_id, code);
                let data_url = data
                    .get("dataUrl")
                    .or_else(|| data.get("data_url"))
                    .and_then(|v| v.as_str());
                if let Some(data_url) = data_url {
                    let target_dir = data
                        .get("targetDir")
                        .or_else(|| data.get("target_dir"))
                        .and_then(|v| v.as_str())
                        .map(|v| v.to_string());
                    let original_filename = data
                        .get("originalFilename")
                        .or_else(|| data.get("original_filename"))
                        .and_then(|v| v.as_str())
                        .map(|v| v.to_string());
                    let require_rename_enabled = data
                        .get("requireRenameEnabled")
                        .or_else(|| data.get("require_rename_enabled"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    if require_rename_enabled {
                        match get_config(app.clone()) {
                            Ok(config_str) => {
                                let config: serde_json::Value =
                                    serde_json::from_str(&config_str).unwrap_or_default();
                                if !is_rename_media_enabled(&config) {
                                    return WsResponse {
                                        success: false,
                                        message: Some("rename_disabled".to_string()),
                                        data: with_request_id(Some("rename_disabled")),
                                    };
                                }
                            }
                            Err(e) => {
                                return WsResponse {
                                    success: false,
                                    message: Some(format!("Failed to get config: {}", e)),
                                    data: with_request_id(Some("config_error")),
                                };
                            }
                        }
                    }

                    match save_data_url(
                        app.clone(),
                        data_url.to_string(),
                        target_dir,
                        original_filename,
                    )
                    .await
                    {
                        Ok(path) => WsResponse {
                            success: true,
                            message: Some(path),
                            data: with_request_id(None),
                        },
                        Err(e) => WsResponse {
                            success: false,
                            message: Some(e),
                            data: with_request_id(Some("save_data_url_failed")),
                        },
                    }
                } else {
                    WsResponse {
                        success: false,
                        message: Some("Missing dataUrl".to_string()),
                        data: with_request_id(Some("missing_data_url")),
                    }
                }
            } else {
                WsResponse {
                    success: false,
                    message: Some("Missing data".to_string()),
                    data: None,
                }
            }
        }
        "protected_image_resolution_result" => {
            if let Some(data) = msg.data {
                let request_id = extract_ws_request_id(&data);
                let with_request_id = |code: Option<&str>| build_ws_request_data(&request_id, code);
                let correlation_request_id = data
                    .get("correlationRequestId")
                    .or_else(|| data.get("correlation_request_id"))
                    .and_then(|value| value.as_str());

                if let Some(correlation_request_id) = correlation_request_id {
                    let result = ProtectedImageResolutionResult {
                        success: data
                            .get("success")
                            .and_then(|value| value.as_bool())
                            .unwrap_or(false),
                        file_path: normalize_optional_nonempty_string(
                            data.get("filePath")
                                .or_else(|| data.get("file_path"))
                                .and_then(|value| value.as_str()),
                        ),
                        code: normalize_optional_nonempty_string(
                            data.get("code").and_then(|value| value.as_str()),
                        ),
                        error: normalize_optional_nonempty_string(
                            data.get("error").and_then(|value| value.as_str()),
                        ),
                    };

                    if let Some(sender) =
                        take_pending_protected_image_request(correlation_request_id)
                    {
                        let _ = sender.send(result);
                        WsResponse {
                            success: true,
                            message: Some("protected_image_resolution_received".to_string()),
                            data: with_request_id(None),
                        }
                    } else {
                        WsResponse {
                            success: false,
                            message: Some(
                                "Unknown protected image correlation request".to_string(),
                            ),
                            data: with_request_id(Some("unknown_correlation_request")),
                        }
                    }
                } else {
                    WsResponse {
                        success: false,
                        message: Some("Missing correlationRequestId".to_string()),
                        data: with_request_id(Some("missing_correlation_request_id")),
                    }
                }
            } else {
                WsResponse {
                    success: false,
                    message: Some("Missing data".to_string()),
                    data: None,
                }
            }
        }
        "video_selected" => {
            if let Some(data) = msg.data {
                let request_id = extract_ws_request_id(&data);
                let with_request_id = |code: Option<&str>| build_ws_request_data(&request_id, code);
                if let Some(url) = data.get("url").and_then(|v| v.as_str()) {
                    // Extract cookies and optional direct candidates from extension.
                    let cookies = data.get("cookies").and_then(|v| v.as_str());
                    let video_url = data.get("videoUrl").and_then(|v| v.as_str());
                    let page_url = data.get("pageUrl").and_then(|v| v.as_str()).unwrap_or(url);
                    let title = data.get("title").and_then(|v| v.as_str());
                    let trace_id = next_download_trace_id();
                    let persisted_preferences = match resolve_video_download_preferences(app) {
                        Ok(preferences) => preferences,
                        Err(err) => {
                            println!(
                                ">>> [Rust] Failed to resolve persisted download preferences, using defaults: {}",
                                err
                            );
                            VideoDownloadPreferences::default()
                        }
                    };
                    let incoming_ytdlp_quality = parse_ytdlp_quality_preference_override(&data);
                    let incoming_ae_friendly_conversion_enabled =
                        parse_ae_friendly_conversion_enabled_override(&data);
                    let resolved_preferences = persisted_preferences.merged_with(
                        incoming_ytdlp_quality,
                        incoming_ae_friendly_conversion_enabled,
                    );
                    if incoming_ytdlp_quality.is_some()
                        || incoming_ae_friendly_conversion_enabled.is_some()
                    {
                        if let Err(err) =
                            persist_video_download_preferences(app.clone(), resolved_preferences)
                        {
                            println!(
                                ">>> [Rust] Failed to persist synced download preferences: {}",
                                err
                            );
                        }
                    }
                    let ytdlp_quality = resolved_preferences.ytdlp_quality;
                    let ae_friendly_conversion_enabled =
                        resolved_preferences.ae_friendly_conversion_enabled;
                    let clip_range = match parse_clip_time_range(&data) {
                        Ok(value) => value,
                        Err(err) => {
                            let result = DownloadResult {
                                trace_id: trace_id.clone(),
                                success: false,
                                file_path: None,
                                error: Some(err.clone()),
                            };
                            let _ = app.emit("video-download-complete", result);
                            return WsResponse {
                                success: false,
                                message: Some(err),
                                data: with_request_id(Some("invalid_clip_range")),
                            };
                        }
                    };
                    let video_candidates = parse_extension_video_candidates(&data);
                    let douyin_direct_candidates = collect_direct_candidates_for_platform(
                        DirectPlatform::Douyin,
                        page_url,
                        video_url,
                        &video_candidates,
                    );
                    let xiaohongshu_direct_candidates = collect_direct_candidates_for_platform(
                        DirectPlatform::Xiaohongshu,
                        page_url,
                        video_url,
                        &video_candidates,
                    );
                    let app_clone = app.clone();
                    log_download_trace(
                        &trace_id,
                        "ws_video_selected",
                        serde_json::json!({
                            "url": url,
                            "pageUrl": page_url,
                            "hasVideoUrl": video_url.is_some_and(|value| !value.is_empty()),
                            "videoCandidatesCount": video_candidates.len(),
                            "douyinDirectCandidateCount": douyin_direct_candidates.len(),
                            "xiaohongshuDirectCandidateCount": xiaohongshu_direct_candidates.len(),
                            "douyinCacheHit": douyin_direct_candidates.iter().any(|candidate| candidate.origin == "cache"),
                            "xiaohongshuCacheHit": xiaohongshu_direct_candidates.iter().any(|candidate| candidate.origin == "cache"),
                            "hasCookies": cookies.is_some_and(|value| !value.is_empty()),
                            "hasTitle": title.is_some_and(|value| !value.is_empty()),
                            "hasClipRange": clip_range.is_some(),
                            "clipStartSec": clip_range.as_ref().map(|range| range.start_seconds),
                            "clipEndSec": clip_range.as_ref().map(|range| range.end_seconds),
                            "ytdlpQuality": ytdlp_quality.as_str(),
                            "aeFriendlyConversionEnabled": ae_friendly_conversion_enabled,
                        }),
                    );

                    let queued_task = if is_douyin_url(page_url) || is_douyin_url(url) {
                        QueuedVideoTask::Douyin {
                            page_url: page_url.to_string(),
                            title: title.map(|value| value.to_string()),
                            cookies_header: cookies.and_then(netscape_cookies_to_header),
                            cookies_path: cookies
                                .filter(|value| !value.is_empty())
                                .and_then(|value| save_extension_cookies(value).ok()),
                            direct_candidates: douyin_direct_candidates,
                            ytdlp_quality,
                            ae_friendly_conversion_enabled,
                            trace_id: trace_id.clone(),
                        }
                    } else if is_pinterest_url(page_url) || is_pinterest_url(url) {
                        QueuedVideoTask::Pinterest {
                            page_url: page_url.to_string(),
                            title: title.map(|value| value.to_string()),
                            cookies_header: cookies.and_then(netscape_cookies_to_header),
                            cookies_path: cookies
                                .filter(|value| !value.is_empty())
                                .and_then(|value| save_extension_cookies(value).ok()),
                            video_url_hint: video_url.and_then(normalize_video_candidate_url),
                            video_candidates,
                            trace_id: trace_id.clone(),
                        }
                    } else if is_xiaohongshu_url(page_url) || is_xiaohongshu_url(url) {
                        QueuedVideoTask::Xiaohongshu {
                            page_url: page_url.to_string(),
                            title: title.map(|value| value.to_string()),
                            cookies_header: cookies.and_then(netscape_cookies_to_header),
                            cookies_path: cookies
                                .filter(|value| !value.is_empty())
                                .and_then(|value| save_extension_cookies(value).ok()),
                            direct_candidates: xiaohongshu_direct_candidates,
                            ytdlp_quality,
                            ae_friendly_conversion_enabled,
                            trace_id: trace_id.clone(),
                        }
                    } else {
                        QueuedVideoTask::Smart {
                            url: url.to_string(),
                            title: title.map(|value| value.to_string()),
                            cookies_path: cookies
                                .filter(|value| !value.is_empty())
                                .and_then(|value| save_extension_cookies(value).ok()),
                            clip_range: clip_range.clone(),
                            ytdlp_quality,
                            ae_friendly_conversion_enabled,
                            trace_id: trace_id.clone(),
                        }
                    };

                    enqueue_video_task(&app_clone, queued_task);
                    schedule_video_task_queue_pump(app_clone.clone());

                    WsResponse {
                        success: true,
                        message: Some("Download queued".to_string()),
                        data: with_request_id(None),
                    }
                } else {
                    WsResponse {
                        success: false,
                        message: Some("Missing url in data".to_string()),
                        data: with_request_id(Some("missing_url")),
                    }
                }
            } else {
                WsResponse {
                    success: false,
                    message: Some("Missing data".to_string()),
                    data: None,
                }
            }
        }
        _ => WsResponse {
            success: false,
            message: Some(format!("Unknown action: {}", msg.action)),
            data: None,
        },
    }
}

#[tauri::command]
fn stop_ws_server(app: AppHandle) -> Result<String, String> {
    let state = app.state::<WsServerState>();

    if !*state.is_running.lock().unwrap() {
        return Ok("WebSocket server not running".to_string());
    }

    if let Some(tx) = state.shutdown_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }

    *state.is_running.lock().unwrap() = false;
    *state.broadcast_tx.lock().unwrap() = None;
    println!(">>> [WS] Server stopped");
    Ok("WebSocket server stopped".to_string())
}

#[tauri::command]
fn broadcast_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let state = app.state::<WsServerState>();

    let broadcast_tx = state.broadcast_tx.lock().unwrap();
    if let Some(tx) = broadcast_tx.as_ref() {
        let msg = serde_json::json!({
            "action": "theme_changed",
            "data": { "theme": theme }
        });
        let _ = tx.send(msg.to_string());
        println!(">>> [WS] Broadcasted theme: {}", theme);
        Ok(())
    } else {
        Err("WebSocket server not running".to_string())
    }
}

#[tauri::command]
fn get_ws_server_status(app: AppHandle) -> bool {
    let state = app.state::<WsServerState>();
    let is_running = *state.is_running.lock().unwrap();
    is_running
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(RegisteredShortcut {
            current: Mutex::new(None),
            last_trigger_ms: Mutex::new(0),
        })
        .manage(NativeTrayState {
            menu_items: Mutex::new(None),
        })
        .manage(WsServerState {
            shutdown_tx: Mutex::new(None),
            is_running: Mutex::new(false),
            broadcast_tx: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            list_files,
            process_files,
            get_clipboard_files,
            get_config,
            save_config,
            begin_open_output_folder_from_context_menu,
            begin_pick_output_folder_from_context_menu,
            export_support_log,
            reset_rename_counter,
            get_autostart,
            set_autostart,
            get_current_shortcut,
            register_shortcut,
            unregister_shortcut,
            download_image,
            save_data_url,
            download_video,
            queue_video_download,
            cancel_download,
            send_to_ae,
            check_ytdlp_version,
            get_pinterest_downloader_info,
            update_ytdlp,
            is_directory,
            open_folder,
            toggle_devtools,
            start_ws_server,
            stop_ws_server,
            get_ws_server_status,
            broadcast_theme,
            set_window_size,
            set_window_position
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _ = app
                    .handle()
                    .set_activation_policy(ActivationPolicy::Accessory);
                let _ = app.handle().set_dock_visibility(false);
            }

            set_runtime_log_dir(&app.handle());
            append_runtime_log_event(
                "app",
                "startup",
                None,
                serde_json::json!({
                    "os": std::env::consts::OS,
                    "arch": std::env::consts::ARCH,
                    "version": env!("CARGO_PKG_VERSION"),
                }),
            );

            // Create Tray Menu
            let initial_tray_labels = load_current_native_tray_labels(&app.handle());
            let quit_i =
                MenuItem::with_id(app, "quit", &initial_tray_labels.quit, true, None::<&str>)?;
            let show_i = MenuItem::with_id(
                app,
                "show",
                &initial_tray_labels.show_window,
                true,
                None::<&str>,
            )?;
            let settings_i = MenuItem::with_id(
                app,
                "settings",
                &initial_tray_labels.settings,
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&show_i, &settings_i, &quit_i])?;

            if let Ok(mut menu_items) = app.state::<NativeTrayState>().menu_items.lock() {
                *menu_items = Some(TrayMenuItems {
                    show: show_i.clone(),
                    settings: settings_i.clone(),
                    quit: quit_i.clone(),
                });
            } else {
                println!(">>> [Rust] Failed to store tray menu state");
            }

            // Build Tray Icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        show_main_window(app, None);
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.set_focus();
                        } else {
                            let settings_window_title =
                                load_current_native_tray_labels(app).settings;
                            let mut settings_builder = tauri::WebviewWindowBuilder::new(
                                app,
                                "settings",
                                tauri::WebviewUrl::App("/settings".into()),
                            )
                            .title(&settings_window_title)
                            .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
                            .decorations(false)
                            .resizable(false);

                            settings_builder = if let Some((x, y)) =
                                resolve_settings_window_position_near_main(app)
                            {
                                settings_builder.position(x, y)
                            } else {
                                settings_builder.center()
                            };

                            let _ = settings_builder.build();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        show_main_window(&app, None);
                    }
                })
                .build(app)?;

            // Load and register shortcut from config
            let app_handle = app.handle().clone();
            let config_path = get_config_path(&app_handle);
            if let Ok(path) = config_path {
                if path.exists() {
                    if let Ok(config_str) = fs::read_to_string(&path) {
                        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) {
                            if let Some(shortcut) = config.get("shortcut").and_then(|v| v.as_str())
                            {
                                if !shortcut.is_empty() {
                                    let _ = register_shortcut_internal(&app_handle, shortcut);
                                }
                            }
                        }
                    }
                }
            }

            // Hide from taskbar
            if let Some(window) = app.get_webview_window("main") {
                keep_window_off_taskbar(&window);
            }

            #[cfg(not(target_os = "windows"))]
            {
                // Enable devtools if devMode is enabled
                if let Ok(path) = get_config_path(&app.handle()) {
                    if path.exists() {
                        if let Ok(config_str) = fs::read_to_string(&path) {
                            if let Ok(config) =
                                serde_json::from_str::<serde_json::Value>(&config_str)
                            {
                                if config
                                    .get("devMode")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false)
                                {
                                    if let Some(window) = app.get_webview_window("main") {
                                        window.open_devtools();
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Auto-start WebSocket server for browser extension
            let app_handle_ws = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_ws_server_internal(&app_handle_ws).await {
                    println!(">>> [WS] Auto-start failed: {}", e);
                }
            });

            #[cfg(target_os = "macos")]
            start_macos_hover_activation_monitor(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Only prevent close for main window
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| match event {
            tauri::RunEvent::Exit => {}
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_pinterest_fixture(name: &str) -> String {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("pinterest")
            .join(name);
        fs::read_to_string(&path)
            .unwrap_or_else(|err| panic!("failed to read fixture {}: {}", path.display(), err))
    }

    fn load_pinterest_fixture_json(name: &str) -> serde_json::Value {
        serde_json::from_str(&load_pinterest_fixture(name))
            .unwrap_or_else(|err| panic!("failed to parse fixture {}: {}", name, err))
    }

    #[test]
    fn extract_pinterest_pin_id_accepts_only_canonical_numeric_pin_urls() {
        assert_eq!(
            extract_pinterest_pin_id("https://www.pinterest.com/pin/403705554121341216/"),
            Some("403705554121341216".to_string())
        );
        assert_eq!(
            extract_pinterest_pin_id("https://www.pinterest.com/pin/not-a-number/"),
            None
        );
        assert_eq!(
            extract_pinterest_pin_id("https://www.pinterest.com/board/123456789/"),
            None
        );
    }

    #[test]
    fn extract_pinterest_json_blocks_reads_pws_data_scripts() {
        let fixture_body = load_pinterest_fixture("top-level-video.json");
        let html = format!(
            r#"<html><head><script>window.__PWS_DATA__ = {};</script></head></html>"#,
            fixture_body
        );

        let blocks = extract_pinterest_json_blocks(&html);

        assert_eq!(blocks.len(), 1);
        let resolved = resolve_pinterest_pin_media_from_value(
            &blocks[0],
            "403705554121341216",
            "https://www.pinterest.com/pin/403705554121341216/",
            None,
            None,
        )
        .expect("expected top-level fixture to resolve");

        assert_eq!(
            resolved.video.expect("expected top-level video").url,
            "https://v1.pinimg.com/videos/iht/expmp4/top-level-720.mp4"
        );
    }

    #[test]
    fn resolve_pinterest_pin_media_prefers_top_level_video_fixture() {
        let fixture = load_pinterest_fixture_json("top-level-video.json");

        let resolved = resolve_pinterest_pin_media_from_value(
            &fixture,
            "403705554121341216",
            "https://www.pinterest.com/pin/403705554121341216/",
            None,
            None,
        )
        .expect("expected top-level fixture to resolve");

        assert_eq!(resolved.pin_id, "403705554121341216");
        assert_eq!(
            resolved.image.url,
            "https://i.pinimg.com/originals/top-level-video.jpg"
        );
        assert_eq!(
            resolved.video.expect("expected top-level video").url,
            "https://v1.pinimg.com/videos/iht/expmp4/top-level-720.mp4"
        );
    }

    #[test]
    fn resolve_pinterest_pin_media_prefers_matching_carousel_slot() {
        let fixture = load_pinterest_fixture_json("carousel-video.json");

        let resolved = resolve_pinterest_pin_media_from_value(
            &fixture,
            "987654321012345678",
            "https://www.pinterest.com/pin/987654321012345678/",
            None,
            None,
        )
        .expect("expected carousel fixture to resolve");

        let video = resolved.video.expect("expected carousel video");
        assert_eq!(
            video.url,
            "https://v1.pinimg.com/videos/iht/expmp4/carousel-current-720.mp4"
        );
        assert_eq!(
            video.poster_url,
            Some("https://i.pinimg.com/originals/carousel-current.jpg".to_string())
        );
    }

    #[test]
    fn resolve_pinterest_pin_media_returns_image_only_fixture_without_video() {
        let fixture = load_pinterest_fixture_json("image-only.json");

        let resolved = resolve_pinterest_pin_media_from_value(
            &fixture,
            "551122334455667788",
            "https://www.pinterest.com/pin/551122334455667788/",
            None,
            None,
        )
        .expect("expected image-only fixture to resolve");

        assert_eq!(resolved.pin_id, "551122334455667788");
        assert_eq!(
            resolved.image.url,
            "https://i.pinimg.com/originals/image-only.jpg"
        );
        assert!(resolved.video.is_none());
    }

    #[test]
    fn pinterest_downloader_info_matches_embedded_lock_metadata() {
        let info = pinterest_downloader_info_from_lock_json(PINTEREST_SIDECAR_LOCK_JSON)
            .expect("expected embedded lock metadata to parse");
        let lock: serde_json::Value = serde_json::from_str(PINTEREST_SIDECAR_LOCK_JSON)
            .expect("expected embedded lock JSON to decode");

        assert_eq!(
            info.package_name,
            lock.get("upstream")
                .and_then(|upstream| upstream.get("package"))
                .and_then(|value| value.as_str())
                .expect("expected upstream.package in embedded lock")
        );
        assert_eq!(
            info.current,
            lock.get("upstream")
                .and_then(|upstream| upstream.get("version"))
                .and_then(|value| value.as_str())
                .expect("expected upstream.version in embedded lock")
        );
        assert_eq!(
            info.flowselect_sidecar_version,
            lock.get("flowselectSidecarVersion")
                .and_then(|value| value.as_str())
                .expect("expected flowselectSidecarVersion in embedded lock")
        );
        assert_eq!(info.update_channel, "app_release");
    }

    #[test]
    fn support_log_settings_summary_stays_download_diagnostic_focused() {
        let config = serde_json::json!({
            "outputPath": r"D:\Downloads",
            "theme": "black",
            "language": "zh-CN",
            "renameMediaOnDownload": true,
            "renameRulePreset": "prefix_number",
            "renamePrefix": "Flow",
            "renameSuffix": "done",
            "aePortalEnabled": true,
            "aeExePath": r"C:\Program Files\Adobe\AfterFX.exe",
            "defaultVideoDownloadQuality": "best",
            "aeFriendlyConversionEnabled": true
        });

        let lines = build_support_log_settings_lines(
            Some(&config),
            r"D:\Downloads",
            "true",
            "Ctrl+Shift+Y",
            None,
        );
        let rendered = lines.join("\n");

        assert!(rendered.contains("output_path=D:\\Downloads"));
        assert!(rendered.contains("autostart=true"));
        assert!(rendered.contains("shortcut=Ctrl+Shift+Y"));
        assert!(rendered.contains("rename_media_on_download=true"));
        assert!(rendered.contains("rename_rule_preset=prefix_number"));
        assert!(rendered.contains("rename_prefix=Flow"));
        assert!(rendered.contains("rename_suffix=done"));
        assert!(rendered.contains("ae_portal_enabled=true"));
        assert!(rendered.contains(r"ae_exe_path=C:\Program Files\Adobe\AfterFX.exe"));
        assert!(rendered.contains("video_download_quality=best"));
        assert!(rendered.contains("ae_friendly_conversion_enabled=true"));
        assert!(!rendered.contains("theme="));
        assert!(!rendered.contains("language="));
    }

    #[test]
    fn support_log_runtime_evidence_filters_noise_and_keeps_key_transitions() {
        let lines = vec![
            serde_json::json!({
                "tsMs": 10,
                "scope": "download",
                "event": "progress",
                "traceId": "dl-1",
                "payload": {
                    "stage": "downloading",
                    "percent": 42.0
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 12,
                "scope": "download_trace",
                "event": "route_selected",
                "traceId": "dl-1",
                "payload": {
                    "traceId": "dl-1",
                    "stage": "route_selected",
                    "tsMs": 12,
                    "payload": {
                        "route": "yt-dlp",
                        "reason": "yt_dlp_first"
                    }
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 13,
                "scope": "download",
                "event": "youtube_cookie_retry",
                "traceId": "dl-1",
                "payload": {
                    "reason": "challenge_or_format_failure"
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 14,
                "scope": "download",
                "event": "complete",
                "traceId": "dl-1",
                "payload": {
                    "mode": "yt-dlp",
                    "success": false,
                    "error": "first line\nsecond line"
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 15,
                "scope": "download_trace",
                "event": "terminal",
                "traceId": "dl-1",
                "payload": {
                    "traceId": "dl-1",
                    "stage": "terminal",
                    "tsMs": 15,
                    "payload": {
                        "outcome": "all_failed",
                        "finalRoute": "yt-dlp",
                        "routeChain": ["yt-dlp"],
                        "durationMs": 1234,
                        "error": "extractor failed"
                    }
                }
            })
            .to_string(),
        ];

        let evidence = build_support_log_runtime_evidence_lines(&lines);
        let rendered = evidence.join("\n");

        assert_eq!(evidence.len(), 4);
        assert!(!rendered.contains("event=progress"));
        assert!(rendered.contains("kind=route event=route_selected route=yt-dlp"));
        assert!(rendered.contains("kind=warning event=youtube_cookie_retry"));
        assert!(rendered.contains("kind=terminal event=complete mode=yt-dlp success=false"));
        assert!(rendered.contains("error=first line | second line"));
        assert!(rendered.contains("kind=terminal event=terminal outcome=all_failed"));
        assert!(rendered.contains("route_chain=yt-dlp"));
    }

    #[test]
    fn support_log_runtime_evidence_keeps_image_download_breadcrumbs() {
        let lines = vec![
            serde_json::json!({
                "tsMs": 20,
                "scope": "download",
                "event": "start",
                "payload": {
                    "mode": "image",
                    "url": "https://www.solarsystemscope.com/textures/earth.html",
                    "resolvedUrl": "https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg",
                    "renameEnabled": false,
                    "outputDir": r"D:\Downloads"
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 21,
                "scope": "download",
                "event": "complete",
                "payload": {
                    "mode": "image",
                    "success": false,
                    "url": "https://www.solarsystemscope.com/textures/earth.html",
                    "resolvedUrl": "https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg",
                    "error": "Unexpected non-image response content-type: text/html"
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 22,
                "scope": "download",
                "event": "start",
                "payload": {
                    "mode": "data_url",
                    "mimeType": "image/png",
                    "originalFilename": "capture.png",
                    "renameEnabled": false,
                    "outputDir": r"D:\Downloads"
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 23,
                "scope": "download",
                "event": "complete",
                "payload": {
                    "mode": "data_url",
                    "success": true,
                    "mimeType": "image/png",
                    "originalFilename": "capture.png",
                    "filePath": r"D:\Downloads\capture.png"
                }
            })
            .to_string(),
        ];

        let evidence = build_support_log_runtime_evidence_lines(&lines);
        let rendered = evidence.join("\n");

        assert_eq!(evidence.len(), 4);
        assert!(rendered.contains("kind=lifecycle event=start mode=image"));
        assert!(rendered.contains(
            "resolved_url=https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg"
        ));
        assert!(rendered.contains(
            "kind=terminal event=complete mode=image resolved_url=https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg success=false"
        ));
        assert!(rendered.contains("error=Unexpected non-image response content-type: text/html"));
        assert!(rendered.contains("kind=lifecycle event=start mode=data_url mime_type=image/png"));
        assert!(rendered.contains("original_filename=capture.png"));
        assert!(rendered.contains("kind=terminal event=complete mode=data_url mime_type=image/png"));
        assert!(rendered.contains("file=capture.png"));
    }

    #[test]
    fn support_log_runtime_evidence_keeps_protected_image_fallback_breadcrumbs() {
        let lines = vec![
            serde_json::json!({
                "tsMs": 30,
                "scope": "download",
                "event": "complete",
                "payload": {
                    "mode": "image",
                    "success": false,
                    "resolvedUrl": "https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg",
                    "error": "HTTP error: 403 (content-type: text/html)"
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 31,
                "scope": "download",
                "event": "protected_image_fallback_requested",
                "payload": {
                    "mode": "protected_image_fallback",
                    "resolvedUrl": "https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg",
                    "pageUrl": "https://www.solarsystemscope.com/textures/earth.html",
                    "outputDir": r"D:\Downloads"
                }
            })
            .to_string(),
            serde_json::json!({
                "tsMs": 32,
                "scope": "download",
                "event": "protected_image_fallback_complete",
                "payload": {
                    "mode": "protected_image_fallback",
                    "resolvedUrl": "https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg",
                    "pageUrl": "https://www.solarsystemscope.com/textures/earth.html",
                    "success": true,
                    "filePath": r"D:\Downloads\2k_earth_nightmap.jpg"
                }
            })
            .to_string(),
        ];

        let evidence = build_support_log_runtime_evidence_lines(&lines);
        let rendered = evidence.join("\n");

        assert_eq!(evidence.len(), 3);
        assert!(rendered.contains(
            "kind=terminal event=complete mode=image resolved_url=https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg success=false"
        ));
        assert!(rendered.contains(
            "kind=route event=protected_image_fallback_requested mode=protected_image_fallback"
        ));
        assert!(rendered.contains("page_url=https://www.solarsystemscope.com/textures/earth.html"));
        assert!(rendered.contains(
            "kind=terminal event=protected_image_fallback_complete mode=protected_image_fallback"
        ));
        assert!(rendered.contains("success=true"));
        assert!(rendered.contains("file=2k_earth_nightmap.jpg"));
    }

    #[test]
    fn capture_ytdlp_file_path_reads_destination_lines() {
        let line = r#"[download] Destination: C:\Users\10\Downloads\sample.mp4"#;

        assert_eq!(
            capture_ytdlp_file_path(line),
            Some(r#"C:\Users\10\Downloads\sample.mp4"#.to_string())
        );
    }

    #[test]
    fn capture_ytdlp_file_path_reads_merger_lines() {
        let line = r#"[Merger] Merging formats into "C:\Users\10\Downloads\sample.mkv""#;

        assert_eq!(
            capture_ytdlp_file_path(line),
            Some(r#"C:\Users\10\Downloads\sample.mkv"#.to_string())
        );
    }

    #[test]
    fn capture_ytdlp_file_path_reads_already_downloaded_lines() {
        let line = r#"[download] C:\Users\10\Downloads\sample.mkv has already been downloaded"#;

        assert_eq!(
            capture_ytdlp_file_path(line),
            Some(r#"C:\Users\10\Downloads\sample.mkv"#.to_string())
        );
    }
}
