use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::net::SocketAddr;

use regex::Regex;

use tokio::sync::broadcast;

use clipboard_win::{formats, get_clipboard};
use dirs::desktop_dir;
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

// Store current download process PID
static DOWNLOAD_CHILD: Mutex<Option<u32>> = Mutex::new(None);

// videodl HTTP server state
struct VideodlServerState {
    sidecar_pid: Mutex<Option<u32>>,
    is_running: Mutex<bool>,
    port: u16,
}

impl Default for VideodlServerState {
    fn default() -> Self {
        Self {
            sidecar_pid: Mutex::new(None),
            is_running: Mutex::new(false),
            port: 18901,
        }
    }
}

/// 获取 Deno JS 运行时的路径
fn get_deno_path(app: &AppHandle) -> Result<PathBuf, String> {
    let exe_name = "deno.exe";

    if cfg!(debug_assertions) {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        Ok(manifest_dir.join("binaries").join(exe_name))
    } else {
        let resource_dir = app.path().resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;
        Ok(resource_dir.join("binaries").join(exe_name))
    }
}

#[tauri::command]
fn get_clipboard_files() -> Result<Vec<String>, String> {
    let file_list: Vec<String> = get_clipboard(formats::FileList)
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;
    Ok(file_list)
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

    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

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
        let entries = fs::read_dir(target_dir)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

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
            let ext = source
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("bin");

            // 获取下一个可用序号
            let seq_num = get_next_sequence_number(&final_target_dir)?;
            let filename = format!("{}.{}", seq_num, ext);
            let dest = final_target_dir.join(&filename);

            fs::copy(source, &dest)
                .map_err(|e| format!("Failed to copy {}: {}", path_str, e))?;
            copied_count += 1;
        }
    }

    Ok(format!("Copied {} files to {:?}", copied_count, final_target_dir))
}

#[tauri::command]
async fn download_image(app: AppHandle, url: String, target_dir: Option<String>) -> Result<String, String> {
    println!(">>> [Rust] Downloading image from: {}", url);

    // Determine target directory (read from config if not provided)
    let final_target_dir = if let Some(dir) = target_dir {
        std::path::PathBuf::from(dir)
    } else {
        let config_str = get_config(app.clone())?;
        let config: serde_json::Value = serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config: {}", e))?;

        config.get("outputPath")
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
    let response = reqwest::blocking::get(&url)
        .map_err(|e| format!("Failed to download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    // Get extension from Content-Type or URL
    let ext = response.headers()
        .get("content-type")
        .and_then(|ct| ct.to_str().ok())
        .map(|ct| match ct {
            "image/png" => "png",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/bmp" => "bmp",
            "image/svg+xml" => "svg",
            _ => "jpg",
        })
        .unwrap_or("jpg");

    // Get next sequence number
    let seq_num = get_next_sequence_number(&final_target_dir)?;
    let filename = format!("{}.{}", seq_num, ext);
    let dest_path = final_target_dir.join(&filename);

    // Write to file
    let bytes = response.bytes()
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let mut file = fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

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

#[tauri::command]
async fn save_data_url(app: AppHandle, data_url: String, target_dir: Option<String>, original_filename: Option<String>) -> Result<String, String> {
    use base64::Engine;
    println!(">>> [Rust] Saving data URL");

    // Parse data URL format: data:image/jpeg;base64,<base64_data>
    if !data_url.starts_with("data:") {
        return Err("Invalid data URL format".to_string());
    }

    let data_url = &data_url[5..]; // Remove "data:" prefix
    let comma_pos = data_url.find(',')
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

        config.get("outputPath")
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
    let mut file = fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

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
    format!(r#"(function() {{
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
}})();"#, escaped_path, escaped_folder)
}

#[tauri::command]
async fn send_to_ae(app: AppHandle, file_path: String) -> Result<(), String> {
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    // 检查是否启用
    let enabled = config.get("aePortalEnabled").and_then(|v| v.as_bool()).unwrap_or(false);
    if !enabled { return Ok(()); }

    // 获取 AE 路径
    let ae_path = config.get("aeExePath").and_then(|v| v.as_str()).unwrap_or("");
    if ae_path.is_empty() { return Err("AE path not configured".to_string()); }

    // 从 outputPath 提取文件夹名
    let output_path = config.get("outputPath").and_then(|v| v.as_str()).unwrap_or("");
    let folder_name = Path::new(output_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("FlowSelect_Received");

    // 生成临时 JSX 脚本
    let jsx_content = generate_jsx_script(&file_path, folder_name);
    let temp_dir = std::env::temp_dir();
    let jsx_path = temp_dir.join("flowselect_ae_import.jsx");
    fs::write(&jsx_path, &jsx_content)
        .map_err(|e| format!("Failed to write JSX: {}", e))?;

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

/// Internal download function that supports both extension cookies and browser cookies
async fn download_video_internal(
    app: AppHandle,
    url: String,
    extension_cookies_path: Option<PathBuf>,
) -> Result<DownloadResult, String> {
    use tauri_plugin_shell::process::CommandEvent;

    println!(">>> [Rust] Starting video download: {}", url);

    // Get config
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

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
        "-o".to_string(),
        output_template.to_string_lossy().to_string(),
    ];

    // Use extension-provided cookies (from browser extension)
    if let Some(ref cookies_path) = extension_cookies_path {
        if cookies_path.exists() {
            args.push("--cookies".to_string());
            args.push(cookies_path.to_string_lossy().to_string());
            println!(">>> [Rust] Using extension cookies from: {:?}", cookies_path);
        }
    }

    args.push(url.clone());

    // 构建环境变量，将 Deno 目录添加到 PATH
    let mut env_path = std::env::var("PATH").unwrap_or_default();
    if let Ok(deno_path) = get_deno_path(&app) {
        if let Some(deno_dir) = deno_path.parent() {
            if deno_path.exists() {
                // Windows 使用分号分隔 PATH
                env_path = format!("{};{}", deno_dir.to_string_lossy(), env_path);
                println!(">>> [Rust] Added Deno to PATH: {:?}", deno_dir);
            }
        }
    }

    // Emit "preparing" event to show indeterminate progress
    let _ = app.emit("video-download-progress", DownloadProgress {
        percent: -1.0,  // Negative value indicates indeterminate state
        speed: "Preparing...".to_string(),
        eta: "".to_string(),
    });

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
                        println!(">>> [Rust] Warning: Failed to cleanup extension cookies: {}", e);
                    } else {
                        println!(">>> [Rust] Cleaned up extension cookies file");
                    }
                }

                let success = payload.code == Some(0);
                let result = DownloadResult {
                    success,
                    file_path: if success {
                        last_file_path.clone().or_else(|| Some(output_dir.to_string_lossy().to_string()))
                    } else {
                        None
                    },
                    error: if success { None } else { Some(stderr_buffer.clone()) },
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
                                            println!(">>> [Rust] Cleaning up residual file: {:?}", path);
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
    download_video_internal(app, url, None).await
}

#[tauri::command]
async fn cancel_download(app: AppHandle) -> Result<bool, String> {
    println!(">>> [Rust] cancel_download called");

    // 1. 终止下载进程
    let killed = if let Some(pid) = DOWNLOAD_CHILD.lock().unwrap().take() {
        println!(">>> [Rust] Killing process with PID: {}", pid);
        let result = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .map_err(|e| e.to_string())?;
        println!(">>> [Rust] taskkill result: {:?}", result.status);
        true
    } else {
        println!(">>> [Rust] No download process to cancel");
        false
    };

    // 2. 清理 .part 临时文件
    if killed {
        // 等待一小段时间让进程完全终止
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // 获取输出目录
        if let Ok(config_str) = get_config(app) {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) {
                let output_dir = config
                    .get("outputPath")
                    .and_then(|v| v.as_str())
                    .map(|s| std::path::PathBuf::from(s))
                    .unwrap_or_else(|| {
                        desktop_dir()
                            .unwrap_or_else(|| std::path::PathBuf::from("."))
                            .join("FlowSelect_Received")
                    });

                // 扫描并删除 .part 文件
                if let Ok(entries) = fs::read_dir(&output_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "part") {
                            println!(">>> [Rust] Deleting temp file: {:?}", path);
                            let _ = fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }

    Ok(killed)
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
    url.contains("douyin.com/video/") || url.contains("v.douyin.com") || url.contains("douyinvod.com")
}

/// Check if URL is from a Chinese video platform (for videodl routing)
fn is_china_platform_url(url: &str) -> bool {
    let patterns = [
        "bilibili.com", "b23.tv",
        "douyin.com", "v.douyin.com", "douyinvod.com",
        "kuaishou.com", "gifshow.com",
        "xiaohongshu.com", "xhslink.com",
        "v.qq.com",
        "iqiyi.com",
        "youku.com",
        "cctv.com", "cctv.cn",
        "weibo.com", "weibo.cn",
        "acfun.cn",
        "mgtv.com",
        "xigua.com", "ixigua.com",
        "zhihu.com",
    ];
    patterns.iter().any(|p| url.contains(p))
}

/// Start videodl HTTP server (sidecar)
async fn start_videodl_server(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let state = app.state::<VideodlServerState>();

    if *state.is_running.lock().unwrap() {
        return Ok(());
    }

    println!(">>> [videodl] Starting sidecar server on port {}", state.port);

    let (mut rx, child) = app.shell()
        .sidecar("videodl-server")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(["--port", &state.port.to_string()])
        .spawn()
        .map_err(|e| format!("Failed to start videodl sidecar: {}", e))?;

    // Store child PID for later cleanup
    *state.sidecar_pid.lock().unwrap() = Some(child.pid());
    *state.is_running.lock().unwrap() = true;

    // Spawn task to consume stdout/stderr
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!(">>> [videodl] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!(">>> [videodl] ERR: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    println!(">>> [videodl] Terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    // Wait for server to be ready
    tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

    // Health check
    let client = reqwest::Client::new();
    let health_url = format!("http://127.0.0.1:{}/health", state.port);

    for _ in 0..5 {
        if let Ok(resp) = client.get(&health_url).send().await {
            if resp.status().is_success() {
                println!(">>> [videodl] Server ready");
                return Ok(());
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    Err("videodl server failed to start".to_string())
}

/// Stop videodl HTTP server
fn stop_videodl_server(app: &AppHandle) {
    let state = app.state::<VideodlServerState>();

    if let Some(pid) = state.sidecar_pid.lock().unwrap().take() {
        // Kill process by PID on Windows
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();
        }
        println!(">>> [videodl] Server stopped (PID: {})", pid);
    }
    *state.is_running.lock().unwrap() = false;
}

/// Check if videodl server is running
#[tauri::command]
fn get_videodl_status(app: AppHandle) -> bool {
    let state = app.state::<VideodlServerState>();
    let is_running = *state.is_running.lock().unwrap();
    is_running
}

/// Download video using videodl HTTP server with SSE progress
async fn download_with_videodl(
    app: AppHandle,
    url: String,
    title: Option<String>,
) -> Result<DownloadResult, String> {
    use futures_util::StreamExt;

    println!(">>> [videodl] Starting download: {}", url);

    // Emit "preparing" event to show indeterminate progress
    let _ = app.emit("video-download-progress", DownloadProgress {
        percent: -1.0,
        speed: "Preparing...".to_string(),
        eta: "".to_string(),
    });

    // Ensure server is running
    start_videodl_server(&app).await?;

    let state = app.state::<VideodlServerState>();
    let port = state.port;

    // Get output directory from config
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let base_output_dir = config
        .get("outputPath")
        .and_then(|v| v.as_str())
        .map(|s| std::path::PathBuf::from(s))
        .unwrap_or_else(|| {
            desktop_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("FlowSelect_Received")
        });

    let video_separate = config.get("videoSeparateFolder")
        .and_then(|v| v.as_bool()).unwrap_or(false);

    let output_dir = if video_separate {
        base_output_dir.join("Videos")
    } else {
        base_output_dir
    };

    // Create output directory
    if !output_dir.exists() {
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Build SSE request URL
    let mut download_url = format!(
        "http://127.0.0.1:{}/download_stream?url={}&work_dir={}",
        port,
        urlencoding::encode(&url),
        urlencoding::encode(&output_dir.to_string_lossy())
    );

    // Add title if available
    if let Some(ref t) = title {
        download_url.push_str(&format!("&title={}", urlencoding::encode(t)));
    }

    let client = reqwest::Client::new();
    let response = client.get(&download_url)
        .send().await
        .map_err(|e| format!("Failed to connect to videodl: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("videodl error: {}", response.status()));
    }

    // Process SSE stream
    let mut stream = response.bytes_stream();
    let mut last_file_path: Option<String> = None;
    let mut last_title: Option<String> = None;
    let mut download_finished = false;

    while let Some(chunk) = stream.next().await {
        if download_finished { break; }

        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if line.is_empty() { continue; }

            if let Ok(event) = serde_json::from_str::<serde_json::Value>(line) {
                let status = event.get("status").and_then(|v| v.as_str()).unwrap_or("");
                println!(">>> [videodl] SSE event status: {}, raw: {}", status, line);

                match status {
                    "progress" | "downloading" => {
                        if let Some(percent) = event.get("percent").and_then(|v| v.as_f64()) {
                            println!(">>> [videodl] Emitting progress: {}%", percent);
                            let _ = app.emit("video-download-progress", DownloadProgress {
                                percent: percent as f32,
                                speed: "videodl".to_string(),
                                eta: "N/A".to_string(),
                            });
                        } else {
                            println!(">>> [videodl] No percent field in progress event");
                        }
                    }
                    "parsed" => {
                        last_title = event.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
                    }
                    "complete" => {
                        last_file_path = event.get("file_path").and_then(|v| v.as_str()).map(|s| s.to_string());
                        if last_title.is_none() {
                            last_title = event.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
                        }
                        println!(">>> [videodl] Received complete event, file: {:?}", last_file_path);
                        download_finished = true;
                    }
                    "error" => {
                        let msg = event.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error");
                        return Err(format!("videodl error: {}", msg));
                    }
                    _ => {}
                }
            }
        }
    }

    let result = DownloadResult {
        success: last_file_path.is_some(),
        file_path: last_file_path.clone(),
        error: if last_file_path.is_none() { Some("Download failed".to_string()) } else { None },
    };

    println!(">>> [videodl] Download complete, file_path: {:?}, success: {}", last_file_path, result.success);
    // Use emit() instead of emit_to() for consistency with other download functions
    let _ = app.emit("video-download-complete", result.clone());
    println!(">>> [videodl] Emitted video-download-complete event");

    // AE Portal
    if let Some(ref path) = last_file_path {
        let app_for_ae = app.clone();
        let path_for_ae = path.clone();
        tokio::spawn(async move {
            let _ = send_to_ae(app_for_ae, path_for_ae).await;
        });
    }

    Ok(result)
}

/// Smart download dispatcher with fallback logic
/// China platforms: videodl first, fallback to yt-dlp
/// International: yt-dlp first, fallback to videodl
async fn download_video_smart(
    app: AppHandle,
    url: String,
    title: Option<String>,
    extension_cookies_path: Option<PathBuf>,
) -> Result<DownloadResult, String> {
    // Check if videodl is enabled
    let config_str = get_config(app.clone())?;
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let videodl_enabled = config
        .get("videodlEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);  // 默认开启

    let is_china = is_china_platform_url(&url);

    println!(">>> [Smart] URL: {}, China: {}, videodl: {}", url, is_china, videodl_enabled);

    if videodl_enabled && is_china {
        // China platform: try videodl first
        println!(">>> [Smart] Trying videodl first for China platform");
        match download_with_videodl(app.clone(), url.clone(), title.clone()).await {
            Ok(result) if result.success => return Ok(result),
            Err(e) => println!(">>> [Smart] videodl failed: {}, trying yt-dlp", e),
            Ok(_) => println!(">>> [Smart] videodl returned failure, trying yt-dlp"),
        }
        // Fallback to yt-dlp
        download_video_internal(app, url, extension_cookies_path).await
    } else if videodl_enabled {
        // International: try yt-dlp first
        println!(">>> [Smart] Trying yt-dlp first for international platform");
        match download_video_internal(app.clone(), url.clone(), extension_cookies_path).await {
            Ok(result) if result.success => return Ok(result),
            Err(e) => println!(">>> [Smart] yt-dlp failed: {}, trying videodl", e),
            Ok(_) => println!(">>> [Smart] yt-dlp returned failure, trying videodl"),
        }
        // Fallback to videodl
        download_with_videodl(app, url, title).await
    } else {
        // videodl disabled: use yt-dlp only
        download_video_internal(app, url, extension_cookies_path).await
    }
}

/// Download Douyin video directly from video URL
async fn download_douyin_direct(
    app: AppHandle,
    video_url: String,
    cookies: Option<String>,
    title: Option<String>,
) -> Result<DownloadResult, String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    println!(">>> [Rust] Starting Douyin direct download: {}", video_url);

    // Build HTTP client with headers
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".parse().unwrap());
    headers.insert("Referer", "https://www.douyin.com/".parse().unwrap());

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
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let base_output_dir = config
        .get("outputPath")
        .and_then(|v| v.as_str())
        .map(|s| std::path::PathBuf::from(s))
        .unwrap_or_else(|| {
            desktop_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("FlowSelect_Received")
        });

    let video_separate = config.get("videoSeparateFolder")
        .and_then(|v| v.as_bool()).unwrap_or(false);

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
    let keep_original_name = config.get("videoKeepOriginalName")
        .and_then(|v| v.as_bool()).unwrap_or(false);

    let output_path = if keep_original_name && title.is_some() {
        let raw_title = title.as_ref().unwrap();
        // Clean title: remove " - 抖音" suffix and invalid filename characters
        let clean_title = raw_title
            .trim_end_matches(" - 抖音")
            .trim()
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

    // Download video
    let response = client.get(&video_url)
        .send().await
        .map_err(|e| format!("Failed to download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    // Send initial progress event to show download started
    let _ = app.emit("video-download-progress", DownloadProgress {
        percent: if total_size > 0 { 0.0 } else { -1.0 }, // -1 indicates indeterminate
        speed: "Starting...".to_string(),
        eta: "N/A".to_string(),
    });

    let mut file = tokio::fs::File::create(&output_path).await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk).await
            .map_err(|e| format!("Write error: {}", e))?;

        downloaded += chunk.len() as u64;

        // Throttle progress updates to every 100ms
        if last_emit.elapsed().as_millis() >= 100 {
            last_emit = std::time::Instant::now();
            if total_size > 0 {
                let percent = (downloaded as f32 / total_size as f32) * 100.0;
                let _ = app.emit("video-download-progress", DownloadProgress {
                    percent,
                    speed: format!("{:.1} MB", downloaded as f64 / 1_000_000.0),
                    eta: "N/A".to_string(),
                });
            } else {
                // Indeterminate progress - show downloaded size
                let _ = app.emit("video-download-progress", DownloadProgress {
                    percent: -1.0,
                    speed: format!("{:.1} MB", downloaded as f64 / 1_000_000.0),
                    eta: "N/A".to_string(),
                });
            }
        }
    }

    file.flush().await.map_err(|e| format!("Flush error: {}", e))?;

    let file_path = output_path.to_string_lossy().to_string();
    println!(">>> [Rust] Douyin video saved: {}", file_path);

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
        manifest_dir.join("binaries").join("yt-dlp-x86_64-pc-windows-msvc.exe")
    } else {
        // Release: use resource directory
        let resource_dir = app.path().resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;
        resource_dir.join("binaries").join("yt-dlp-x86_64-pc-windows-msvc.exe")
    };
    println!(">>> [Rust] CARGO_MANIFEST_DIR: {}", env!("CARGO_MANIFEST_DIR"));
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

    file.flush().await.map_err(|e| format!("Flush error: {}", e))?;
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
        fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let config_path = get_config_path(&app)?;

    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config: {}", e))
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
        autostart.enable().map_err(|e| format!("Failed to enable autostart: {}", e))
    } else {
        autostart.disable().map_err(|e| format!("Failed to disable autostart: {}", e))
    }
}

#[tauri::command]
fn get_current_shortcut(app: AppHandle) -> Result<String, String> {
    let config_str = get_config(app)?;
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config.get("shortcut")
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
                            let window_width = 220.0;
                            let x = pos.x - 50.0 - window_width;
                            let y = pos.y + 50.0;
                            let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                        }
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.set_skip_taskbar(true);
                        // Notify frontend to cancel icon mode
                        let _ = app_handle.emit("shortcut-show", ());
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
        window.set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| format!("Failed to set window size: {}", e))
    } else {
        Err("Window not found".to_string())
    }
}

#[tauri::command]
fn set_window_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_position(tauri::LogicalPosition::new(x, y))
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
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
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
    ).map_err(|e| format!("Failed to create socket: {}", e))?;

    socket.set_reuse_address(true).map_err(|e| format!("Failed to set reuse address: {}", e))?;
    socket.bind(&addr.into()).map_err(|e| format!("Failed to bind: {}", e))?;
    socket.listen(128).map_err(|e| format!("Failed to listen: {}", e))?;
    socket.set_nonblocking(true).map_err(|e| format!("Failed to set nonblocking: {}", e))?;

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
    use tokio_tungstenite::tungstenite::Message;
    use futures_util::{StreamExt, SinkExt};

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
        "get_theme" => {
            match get_config(app.clone()) {
                Ok(config_str) => {
                    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();
                    let theme = config.get("theme")
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
            }
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
                    // Extract cookies and videoUrl from extension
                    let cookies = data.get("cookies").and_then(|v| v.as_str());
                    let video_url = data.get("videoUrl").and_then(|v| v.as_str());
                    let page_url = data.get("pageUrl").and_then(|v| v.as_str()).unwrap_or(url);
                    let title = data.get("title").and_then(|v| v.as_str());

                    let app_clone = app.clone();

                    // Check if Douyin URL with direct video URL - use custom downloader
                    if (is_douyin_url(page_url) || is_douyin_url(url)) && video_url.is_some() {
                        let download_url = video_url.unwrap().to_string();
                        let cookies_owned = cookies.map(|s| s.to_string());
                        let title_owned = title.map(|s| s.to_string());
                        println!(">>> [Rust] Douyin direct video URL: {}", download_url);
                        tokio::spawn(async move {
                            if let Err(e) = download_douyin_direct(app_clone.clone(), download_url, cookies_owned, title_owned).await {
                                println!(">>> [Rust] Douyin download error: {}", e);
                                // Emit complete event with error to close progress bar
                                let result = DownloadResult {
                                    success: false,
                                    file_path: None,
                                    error: Some(e),
                                };
                                let _ = app_clone.emit("video-download-complete", result);
                            }
                        });
                    } else {
                        // Use smart download dispatcher
                        let url_owned = url.to_string();
                        let title_owned = title.map(|s| s.to_string());
                        let cookies_path = cookies
                            .filter(|s| !s.is_empty())
                            .and_then(|s| save_extension_cookies(s).ok());
                        tokio::spawn(async move {
                            if let Err(e) = download_video_smart(app_clone.clone(), url_owned, title_owned, cookies_path).await {
                                println!(">>> [Rust] Smart download error: {}", e);
                                // Emit complete event with error to close progress bar
                                let result = DownloadResult {
                                    success: false,
                                    file_path: None,
                                    error: Some(e),
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
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
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
        .manage(VideodlServerState::default())
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
            set_window_position,
            get_videodl_status
        ])
        .setup(|app| {
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
                        // Stop videodl server before exit
                        stop_videodl_server(app);
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.set_skip_taskbar(true);
                        }
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
                            .transparent(true)
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
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.set_skip_taskbar(true);
                        }
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
                            if let Some(shortcut) = config.get("shortcut").and_then(|v| v.as_str()) {
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
                let _ = window.set_skip_taskbar(true);
            }

            // Enable devtools if devMode is enabled
            if let Ok(path) = get_config_path(&app.handle()) {
                if path.exists() {
                    if let Ok(config_str) = fs::read_to_string(&path) {
                        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) {
                            if config.get("devMode").and_then(|v| v.as_bool()).unwrap_or(false) {
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
            if let tauri::RunEvent::Exit = event {
                // Stop videodl server on app exit
                stop_videodl_server(app);
                println!(">>> [App] Exit, videodl server stopped");
            }
        });
}

