use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use regex::Regex;

use tokio::sync::broadcast;

#[cfg(windows)]
use clipboard_win::{formats, get_clipboard};
use dirs::desktop_dir;
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_shell::ShellExt;

// Store current registered shortcut
struct RegisteredShortcut {
    current: Mutex<Option<Shortcut>>,
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

#[derive(Clone, Debug)]
struct ExtensionVideoCandidate {
    url: String,
    candidate_type: Option<String>,
    source: Option<String>,
    confidence: Option<String>,
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

#[derive(Clone, Debug)]
struct DirectCandidateCacheEntry {
    url: String,
    expires_at_ms: u128,
}

// Store current download process PID
static DOWNLOAD_CHILD: Mutex<Option<u32>> = Mutex::new(None);

// Global cancel flag for all downloads
static DOWNLOAD_CANCELLED: Mutex<bool> = Mutex::new(false);
// Incremental sequence for download trace ids.
static DOWNLOAD_TRACE_SEQ: AtomicU64 = AtomicU64::new(1);
static DIRECT_CANDIDATE_CACHE: LazyLock<Mutex<HashMap<String, DirectCandidateCacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
const DIRECT_CANDIDATE_CACHE_TTL_MS: u128 = 5 * 60 * 1000;
const DIRECT_CANDIDATE_CACHE_MAX_ENTRIES: usize = 256;

fn keep_window_off_taskbar(_window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        let _ = _window.set_skip_taskbar(true);
    }
}

fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(ActivationPolicy::Accessory);
        let _ = app.set_dock_visibility(false);
        let _ = app.show();
    }

    if let Some(window) = app.get_webview_window("main") {
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
                        show_main_window(&app_for_main_thread);
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
fn get_deno_path(app: &AppHandle) -> Result<PathBuf, String> {
    // 根据平台选择可执行文件名
    #[cfg(target_os = "windows")]
    let exe_name = "deno.exe";
    #[cfg(not(target_os = "windows"))]
    let exe_name = "deno";

    if cfg!(debug_assertions) {
        // 开发模式：从 binaries 目录读取
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        Ok(manifest_dir.join("binaries").join(exe_name))
    } else {
        // 发布模式：从 resources 目录读取
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;
        Ok(resource_dir.join("binaries").join(exe_name))
    }
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

#[tauri::command]
async fn download_image(
    app: AppHandle,
    url: String,
    target_dir: Option<String>,
) -> Result<String, String> {
    println!(">>> [Rust] Downloading image from: {}", url);
    let resolved_url = resolve_image_download_url(&url);
    if resolved_url != url {
        println!(
            ">>> [Rust] Resolved image URL from wrapper: {} -> {}",
            url, resolved_url
        );
    }

    // Determine target directory (read from config if not provided)
    let final_target_dir = if let Some(dir) = target_dir {
        std::path::PathBuf::from(dir)
    } else {
        let config_str = get_config(app.clone())?;
        let config: serde_json::Value = serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config: {}", e))?;

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

    // Create directory if not exists
    if !final_target_dir.exists() {
        fs::create_dir_all(&final_target_dir)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    // Download image
    let response = reqwest::Client::new()
        .get(&resolved_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    // Reject obvious HTML/text payloads to avoid saving pages as image files.
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|ct| ct.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if content_type.starts_with("text/") {
        return Err(format!(
            "Unexpected non-image response content-type: {}",
            content_type
        ));
    }

    // Get extension from Content-Type.
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

    // Get next sequence number
    let seq_num = get_next_sequence_number(&final_target_dir)?;
    let filename = format!("{}.{}", seq_num, ext);
    let dest_path = final_target_dir.join(&filename);

    // Write to file
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

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

fn resolve_image_download_url(raw_url: &str) -> String {
    let trimmed = raw_url.trim();
    if let Some(parsed) = url::Url::parse(trimmed).ok() {
        let host = parsed
            .host_str()
            .unwrap_or_default()
            .to_ascii_lowercase();
        let path = parsed.path().to_ascii_lowercase();
        let is_google_wrapper = (host == "google.com"
            || host == "www.google.com"
            || host.ends_with(".google.com"))
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

    // Determine target directory (read from config if not provided)
    let final_target_dir = if let Some(dir) = target_dir {
        std::path::PathBuf::from(dir)
    } else {
        let config_str = get_config(app.clone())?;
        let config: serde_json::Value = serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config: {}", e))?;

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

    // Create directory if not exists
    if !final_target_dir.exists() {
        fs::create_dir_all(&final_target_dir)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    // Get next sequence number
    let seq_num = get_next_sequence_number(&final_target_dir)?;
    let filename = format!("{}.{}", seq_num, ext);
    let dest_path = final_target_dir.join(&filename);

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
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    pub percent: f32,
    pub speed: String,
    pub eta: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DownloadRoute {
    DirectDouyin,
    DirectXiaohongshu,
    YtDlp,
}

impl DownloadRoute {
    fn as_str(self) -> &'static str {
        match self {
            Self::DirectDouyin => "direct_douyin",
            Self::DirectXiaohongshu => "direct_xiaohongshu",
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

fn next_download_trace_id() -> String {
    let seq = DOWNLOAD_TRACE_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("dl-{}-{}", now_timestamp_ms(), seq)
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
) -> Result<DownloadResult, String> {
    match platform {
        DirectPlatform::Douyin => {
            download_douyin_direct(app, video_url, cookies_header, title).await
        }
        DirectPlatform::Xiaohongshu => {
            download_xiaohongshu_direct(app, video_url, cookies_header, title).await
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
        Some(trace_id),
        Some(vec![direct_route]),
    )
    .await
    .map_err(|err| stage_error("fallback", err.as_str()))
}

/// Internal download function that supports both extension cookies and browser cookies
async fn download_video_internal(
    app: AppHandle,
    url: String,
    extension_cookies_path: Option<PathBuf>,
    clip_range: Option<ClipTimeRange>,
) -> Result<DownloadResult, String> {
    use tauri_plugin_shell::process::CommandEvent;

    println!(">>> [Rust] Starting video download: {}", url);

    // Reset cancel flag at start of new download
    *DOWNLOAD_CANCELLED.lock().unwrap() = false;

    // Get config
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value =
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

    // Check if video should go to separate folder
    let video_separate_folder = config
        .get("videoSeparateFolder")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let output_dir = if video_separate_folder {
        base_output_dir.join("Videos")
    } else {
        base_output_dir
    };

    // Create output directory if not exists
    if !output_dir.exists() {
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    // Check if should keep original video name
    let keep_original_name = config
        .get("videoKeepOriginalName")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let output_template = if keep_original_name {
        output_dir.join("%(title)s.%(ext)s")
    } else {
        let seq_num = get_next_sequence_number(&output_dir)?;
        output_dir.join(format!("{}.%(ext)s", seq_num))
    };

    // Build args
    let mut args = vec![
        "-f".to_string(),
        "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b/best[ext=mp4]/best".to_string(),
        "--merge-output-format".to_string(),
        "mp4".to_string(),
        "--no-keep-video".to_string(),
        "-S".to_string(),
        "ext:mp4:m4a".to_string(),
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
        "-o".to_string(),
        output_template.to_string_lossy().to_string(),
    ];

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

    if let Some(range) = clip_range {
        let start = format_seconds_for_download_section(range.start_seconds);
        let end = format_seconds_for_download_section(range.end_seconds);
        println!(">>> [Rust] Section download enabled: {} -> {}", start, end);
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
            percent: -1.0, // Negative value indicates indeterminate state
            speed: "Preparing...".to_string(),
            eta: "".to_string(),
        },
    );

    // Spawn yt-dlp process
    let shell = app.shell();
    let (mut rx, child) = shell
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .args(&args)
        .env("PATH", &env_path)
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

    // Store child process PID for cancellation
    *DOWNLOAD_CHILD.lock().unwrap() = Some(child.pid());

    let mut stdout_buffer = String::new();
    let mut stderr_buffer = String::new();
    let mut last_file_path: Option<String> = None;

    // Process events from yt-dlp
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line);
                println!(">>> [yt-dlp] {}", line_str);
                stdout_buffer.push_str(&line_str);
                stdout_buffer.push('\n');

                // Parse progress line: [download] XX.X% of XXX at XXX ETA XXX
                if line_str.contains("[download]") && line_str.contains("%") {
                    if let Some(progress) = parse_progress(&line_str) {
                        let _ = app.emit("video-download-progress", progress);
                    }
                }

                // Capture file path - two formats:
                // Format 1: [Merger] Merging formats into "D:\path\file.mp4" (quoted)
                // Format 2: [download] Destination: D:\path\file.mp4 (unquoted)
                if line_str.contains("[Merger]") {
                    let re = Regex::new(r#""([A-Za-z]:\\[^"]+)""#).unwrap();
                    if let Some(caps) = re.captures(&line_str) {
                        last_file_path = Some(caps.get(1).unwrap().as_str().to_string());
                    }
                } else if line_str.contains("Destination:") {
                    if let Some(idx) = line_str.find("Destination:") {
                        let path = line_str[idx + 12..].trim();
                        if path.len() > 2 && path.chars().nth(1) == Some(':') {
                            last_file_path = Some(path.to_string());
                        }
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line);
                println!(">>> [yt-dlp stderr] {}", line_str);
                stderr_buffer.push_str(&line_str);
                stderr_buffer.push('\n');
            }
            CommandEvent::Terminated(payload) => {
                // Clear download PID
                *DOWNLOAD_CHILD.lock().unwrap() = None;

                // Cleanup extension cookies file
                if let Some(ref cookies_path) = extension_cookies_path {
                    if let Err(e) = fs::remove_file(cookies_path) {
                        println!(
                            ">>> [Rust] Warning: Failed to cleanup extension cookies: {}",
                            e
                        );
                    } else {
                        println!(">>> [Rust] Cleaned up extension cookies file");
                    }
                }

                let success = payload.code == Some(0);
                let result = DownloadResult {
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
                    } else {
                        Some(stderr_buffer.clone())
                    },
                };

                // Emit completion event
                let _ = app.emit("video-download-complete", result.clone());

                // Cleanup .m4a residual files after successful download
                if success {
                    if let Some(ref final_path) = last_file_path {
                        let final_path = std::path::Path::new(final_path);
                        if let Some(parent) = final_path.parent() {
                            if let Ok(entries) = std::fs::read_dir(parent) {
                                for entry in entries.flatten() {
                                    let path = entry.path();
                                    if let Some(ext) = path.extension() {
                                        if ext == "m4a" {
                                            println!(
                                                ">>> [Rust] Cleaning up residual file: {:?}",
                                                path
                                            );
                                            let _ = std::fs::remove_file(&path);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // AE Portal
                if success {
                    if let Some(ref path) = last_file_path {
                        let app_for_ae = app.clone();
                        let path_for_ae = path.clone();
                        tokio::spawn(async move {
                            let _ = send_to_ae(app_for_ae, path_for_ae).await;
                        });
                    }
                }

                return Ok(result);
            }
            _ => {}
        }
    }

    // Fallback if loop exits without Terminated event
    let result = DownloadResult {
        success: false,
        file_path: None,
        error: Some("Process ended unexpectedly".to_string()),
    };
    // Emit complete event with error to close progress bar
    let _ = app.emit("video-download-complete", result.clone());
    Ok(result)
}

/// Public command for downloading video (used by frontend paste/drag)
#[tauri::command]
async fn download_video(app: AppHandle, url: String) -> Result<DownloadResult, String> {
    download_video_internal(app, url, None, None).await
}

#[tauri::command]
async fn cancel_download(app: AppHandle) -> Result<bool, String> {
    println!(">>> [Rust] cancel_download called");

    // Set global cancel flag
    *DOWNLOAD_CANCELLED.lock().unwrap() = true;

    // 1. 终止下载进程 (for yt-dlp)
    if let Some(pid) = DOWNLOAD_CHILD.lock().unwrap().take() {
        println!(">>> [Rust] Killing yt-dlp process with PID: {}", pid);
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .output();
        }
    }

    // 2. 等待进程完全终止
    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;

    // 3. 清理临时文件
    if let Ok(config_str) = get_config(app) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) {
            let base_output_dir = config
                .get("outputPath")
                .and_then(|v| v.as_str())
                .map(|s| std::path::PathBuf::from(s))
                .unwrap_or_else(|| {
                    desktop_dir()
                        .unwrap_or_else(|| std::path::PathBuf::from("."))
                        .join("FlowSelect_Received")
                });

            // Check base dir and Videos subdir (if enabled)
            let video_separate = config
                .get("videoSeparateFolder")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let dirs_to_check = if video_separate {
                vec![base_output_dir.clone(), base_output_dir.join("Videos")]
            } else {
                vec![base_output_dir]
            };

            let now = std::time::SystemTime::now();
            let video_extensions = ["mp4", "webm", "mkv", "flv", "avi", "mov"];

            for output_dir in dirs_to_check {
                if let Ok(entries) = fs::read_dir(&output_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let ext = path
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("")
                            .to_lowercase();

                        // Delete .part files (yt-dlp temp files)
                        if ext == "part" {
                            println!(">>> [Rust] Deleting temp file: {:?}", path);
                            let _ = fs::remove_file(&path);
                            continue;
                        }

                        // Delete recently modified video files
                        if video_extensions.contains(&ext.as_str()) {
                            if let Ok(metadata) = entry.metadata() {
                                if let Ok(modified) = metadata.modified() {
                                    // Delete if modified within last 30 seconds
                                    if let Ok(duration) = now.duration_since(modified) {
                                        if duration.as_secs() < 30 {
                                            println!(
                                                ">>> [Rust] Deleting recent video file: {:?}",
                                                path
                                            );
                                            let _ = fs::remove_file(&path);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

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
        raw.as_str().and_then(|value| value.trim().parse::<f64>().ok())
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

        let result = download_douyin_direct(app, url, cookie_header, title).await;
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

        let result = download_xiaohongshu_direct(app, url, cookie_header, title).await;
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
            "policy": "yt_dlp_first_direct_plus_sidecar",
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
            if *DOWNLOAD_CANCELLED.lock().unwrap() {
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
) -> Result<DownloadResult, String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    println!(
        ">>> [Rust] Starting {} direct download: {}",
        platform, video_url
    );
    // Reset cancel flag for a fresh direct download.
    *DOWNLOAD_CANCELLED.lock().unwrap() = false;

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
    let config: serde_json::Value =
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

    let video_separate = config
        .get("videoSeparateFolder")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let output_dir = if video_separate {
        base_output_dir.join("Videos")
    } else {
        base_output_dir
    };

    if !output_dir.exists() {
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Check videoKeepOriginalName setting
    let keep_original_name = config
        .get("videoKeepOriginalName")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let output_path = if keep_original_name && title.is_some() {
        let raw_title = title.as_ref().unwrap();
        // Clean title: strip site suffix and invalid filename characters
        let stripped_title = if let Some(suffix) = title_suffix_to_strip {
            raw_title.trim_end_matches(suffix).trim()
        } else {
            raw_title.trim()
        };
        let clean_title = stripped_title
            .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
            .chars()
            .take(100) // Limit filename length
            .collect::<String>();

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

    // Send initial progress event to show download started
    let _ = app.emit(
        "video-download-progress",
        DownloadProgress {
            percent: if total_size > 0 { 0.0 } else { -1.0 }, // -1 indicates indeterminate
            speed: "Starting...".to_string(),
            eta: "N/A".to_string(),
        },
    );

    let mut file = tokio::fs::File::create(&output_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        if *DOWNLOAD_CANCELLED.lock().unwrap() {
            println!(">>> [Rust] {} direct download cancelled by user", platform);
            let _ = file.flush().await;
            drop(file);
            let _ = tokio::fs::remove_file(&output_path).await;
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
                let _ = app.emit(
                    "video-download-progress",
                    DownloadProgress {
                        percent,
                        speed: format!("{:.1} MB", downloaded as f64 / 1_000_000.0),
                        eta: "N/A".to_string(),
                    },
                );
            } else {
                // Indeterminate progress - show downloaded size
                let _ = app.emit(
                    "video-download-progress",
                    DownloadProgress {
                        percent: -1.0,
                        speed: format!("{:.1} MB", downloaded as f64 / 1_000_000.0),
                        eta: "N/A".to_string(),
                    },
                );
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;

    let file_path = output_path.to_string_lossy().to_string();
    println!(">>> [Rust] {} video saved: {}", platform, file_path);

    let result = DownloadResult {
        success: true,
        file_path: Some(file_path.clone()),
        error: None,
    };

    let _ = app.emit("video-download-complete", result.clone());

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
    )
    .await
}

/// Download Xiaohongshu video directly from video URL
async fn download_xiaohongshu_direct(
    app: AppHandle,
    video_url: String,
    cookies: Option<String>,
    title: Option<String>,
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
    )
    .await
}

/// Parse yt-dlp progress line: [download] XX.X% of XXX at XXX ETA XXX
fn parse_progress(line: &str) -> Option<DownloadProgress> {
    // Extract percentage
    let percent = line
        .split('%')
        .next()?
        .split_whitespace()
        .last()?
        .parse::<f32>()
        .ok()?;

    Some(DownloadProgress {
        percent,
        speed: "yt-dlp".to_string(),
        eta: "N/A".to_string(),
    })
}

#[derive(serde::Serialize, Clone)]
pub struct YtdlpVersionInfo {
    pub current: String,
    pub latest: String,
    #[serde(rename = "updateAvailable")]
    pub update_available: bool,
}

#[tauri::command]
async fn check_ytdlp_version(app: AppHandle) -> Result<YtdlpVersionInfo, String> {
    use tauri_plugin_shell::process::CommandEvent;

    // 1. Get current version by running yt-dlp --version
    let shell = app.shell();
    let (mut rx, _child) = shell
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .args(["--version"])
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

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

    // 2. Get latest version from GitHub API
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

    let latest_version = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or("Failed to get tag_name from GitHub response")?
        .to_string();

    // 3. Compare versions
    let update_available = current_version != latest_version;

    Ok(YtdlpVersionInfo {
        current: current_version,
        latest: latest_version,
        update_available,
    })
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

    // Get sidecar path - different for dev vs release
    let sidecar_path = if cfg!(debug_assertions) {
        // Dev: use compile-time manifest directory
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .join("binaries")
            .join("yt-dlp-x86_64-pc-windows-msvc.exe")
    } else {
        // Release: use resource directory
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;
        resource_dir
            .join("binaries")
            .join("yt-dlp-x86_64-pc-windows-msvc.exe")
    };
    println!(
        ">>> [Rust] CARGO_MANIFEST_DIR: {}",
        env!("CARGO_MANIFEST_DIR")
    );
    println!(">>> [Rust] sidecar_path: {:?}", sidecar_path);
    println!(">>> [Rust] sidecar_path exists: {}", sidecar_path.exists());

    // Download from GitHub
    let client = reqwest::Client::new();
    let response = client
        .get("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
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
    let temp_path = std::env::temp_dir().join("yt-dlp-update.exe.tmp");

    // 确保目标目录存在
    if let Some(parent) = sidecar_path.parent() {
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

    // Replace old file with new one (use copy + remove for cross-partition support)
    if sidecar_path.exists() {
        tokio::fs::remove_file(&sidecar_path)
            .await
            .map_err(|e| format!("Failed to remove old file: {}", e))?;
    }

    tokio::fs::copy(&temp_path, &sidecar_path)
        .await
        .map_err(|e| format!("Failed to copy temp file: {}", e))?;

    let _ = tokio::fs::remove_file(&temp_path).await;

    println!(">>> [Rust] yt-dlp updated successfully");

    // Get new version
    let version_info = check_ytdlp_version(app).await?;
    Ok(version_info.current)
}

fn get_config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    Ok(config_dir.join("settings.json"))
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

    fs::write(&config_path, json).map_err(|e| format!("Failed to write config: {}", e))
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
                if let Some(window) = app_handle.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        // Position window: bottom-left of cursor
                        if let Ok(pos) = window.cursor_position() {
                            let window_width = 200.0;
                            let x = pos.x - 50.0 - window_width;
                            let y = pos.y + 50.0;
                            let _ = window
                                .set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                        }
                        show_main_window(&app_handle);
                    }
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
        window
            .set_position(tauri::LogicalPosition::new(x, y))
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
fn toggle_devtools(app: AppHandle, enabled: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if enabled {
            window.open_devtools();
        } else {
            window.close_devtools();
        }
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

    loop {
        tokio::select! {
            // Handle incoming messages from client
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let response = process_ws_message(&text, &app).await;
                        let json = serde_json::to_string(&response).unwrap_or_default();
                        if write.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(_)) => break,
                    None => break,
                    _ => {}
                }
            }
            // Handle broadcast messages
            broadcast_msg = broadcast_rx.recv() => {
                match broadcast_msg {
                    Ok(msg) => {
                        if write.send(Message::Text(msg)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        }
    }
    println!(">>> [WS] Client disconnected");
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
        "save_image" => {
            if let Some(data) = msg.data {
                let url = data.get("url").and_then(|v| v.as_str());
                if let Some(url) = url {
                    match download_image(app.clone(), url.to_string(), None).await {
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
        "video_selected" => {
            if let Some(data) = msg.data {
                if let Some(url) = data.get("url").and_then(|v| v.as_str()) {
                    // Extract cookies and optional direct candidates from extension.
                    let cookies = data.get("cookies").and_then(|v| v.as_str());
                    let video_url = data.get("videoUrl").and_then(|v| v.as_str());
                    let page_url = data.get("pageUrl").and_then(|v| v.as_str()).unwrap_or(url);
                    let title = data.get("title").and_then(|v| v.as_str());
                    let clip_range = match parse_clip_time_range(&data) {
                        Ok(value) => value,
                        Err(err) => {
                            let result = DownloadResult {
                                success: false,
                                file_path: None,
                                error: Some(err.clone()),
                            };
                            let _ = app.emit("video-download-complete", result);
                            return WsResponse {
                                success: false,
                                message: Some(err),
                                data: None,
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
                    let trace_id = next_download_trace_id();

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
                        }),
                    );

                    if is_douyin_url(page_url) || is_douyin_url(url) {
                        let page_url_owned = page_url.to_string();
                        let title_owned = title.map(|value| value.to_string());
                        let cookies_header = cookies.and_then(netscape_cookies_to_header);
                        let cookies_path = cookies
                            .filter(|value| !value.is_empty())
                            .and_then(|value| save_extension_cookies(value).ok());
                        let trace_id_for_task = trace_id.clone();
                        tokio::spawn(async move {
                            if let Err(err) = download_platform_direct_with_retry(
                                app_clone.clone(),
                                DirectPlatform::Douyin,
                                page_url_owned,
                                title_owned,
                                cookies_header,
                                cookies_path,
                                douyin_direct_candidates,
                                trace_id_for_task.clone(),
                            )
                            .await
                            {
                                println!(">>> [Rust] Douyin direct pipeline error: {}", err);
                                let result = DownloadResult {
                                    success: false,
                                    file_path: None,
                                    error: Some(err),
                                };
                                let _ = app_clone.emit("video-download-complete", result);
                            }
                        });
                    } else if is_xiaohongshu_url(page_url) || is_xiaohongshu_url(url) {
                        let page_url_owned = page_url.to_string();
                        let title_owned = title.map(|value| value.to_string());
                        let cookies_header = cookies.and_then(netscape_cookies_to_header);
                        let cookies_path = cookies
                            .filter(|value| !value.is_empty())
                            .and_then(|value| save_extension_cookies(value).ok());
                        let trace_id_for_task = trace_id.clone();
                        tokio::spawn(async move {
                            if let Err(err) = download_platform_direct_with_retry(
                                app_clone.clone(),
                                DirectPlatform::Xiaohongshu,
                                page_url_owned,
                                title_owned,
                                cookies_header,
                                cookies_path,
                                xiaohongshu_direct_candidates,
                                trace_id_for_task.clone(),
                            )
                            .await
                            {
                                println!(">>> [Rust] Xiaohongshu direct pipeline error: {}", err);
                                let result = DownloadResult {
                                    success: false,
                                    file_path: None,
                                    error: Some(err),
                                };
                                let _ = app_clone.emit("video-download-complete", result);
                            }
                        });
                    } else {
                        // Use smart download dispatcher
                        let url_owned = url.to_string();
                        let title_owned = title.map(|value| value.to_string());
                        let cookies_path = cookies
                            .filter(|value| !value.is_empty())
                            .and_then(|value| save_extension_cookies(value).ok());
                        let trace_id_for_task = trace_id.clone();
                        let clip_range_for_task = clip_range.clone();
                        tokio::spawn(async move {
                            if let Err(err) = download_video_smart(
                                app_clone.clone(),
                                url_owned,
                                title_owned,
                                cookies_path,
                                clip_range_for_task,
                                Some(trace_id_for_task.clone()),
                                None,
                            )
                            .await
                            {
                                println!(">>> [Rust] Smart download error: {}", err);
                                // Emit complete event with error to close progress bar
                                let result = DownloadResult {
                                    success: false,
                                    file_path: None,
                                    error: Some(err),
                                };
                                let _ = app_clone.emit("video-download-complete", result);
                            }
                        });
                    }

                    WsResponse {
                        success: true,
                        message: Some("Download started".to_string()),
                        data: None,
                    }
                } else {
                    WsResponse {
                        success: false,
                        message: Some("Missing url in data".to_string()),
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
            get_autostart,
            set_autostart,
            get_current_shortcut,
            register_shortcut,
            unregister_shortcut,
            download_image,
            save_data_url,
            download_video,
            cancel_download,
            send_to_ae,
            check_ytdlp_version,
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

            // Create Tray Menu
            let quit_i = MenuItem::with_id(app, "quit", "Quit FlowSelect", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &settings_i, &quit_i])?;

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
                        show_main_window(app);
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.set_focus();
                        } else {
                            let _ = tauri::WebviewWindowBuilder::new(
                                app,
                                "settings",
                                tauri::WebviewUrl::App("/settings".into()),
                            )
                            .title("Settings")
                            .inner_size(320.0, 400.0)
                            .center()
                            .decorations(false)
                            .resizable(false)
                            .build();
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
                        show_main_window(&app);
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

            // Enable devtools if devMode is enabled
            if let Ok(path) = get_config_path(&app.handle()) {
                if path.exists() {
                    if let Ok(config_str) = fs::read_to_string(&path) {
                        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) {
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
        .run(|app, event| {
            match event {
                tauri::RunEvent::Reopen { .. } => {
                    show_main_window(app);
                }
                tauri::RunEvent::Exit => {}
                _ => {}
            }
        });
}
