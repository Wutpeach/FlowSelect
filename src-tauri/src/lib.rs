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
use tokio_tungstenite::tungstenite::Message;
use futures_util::{StreamExt, SinkExt};

// Store current registered shortcut
struct RegisteredShortcut {
    current: Mutex<Option<Shortcut>>,
}

// WebSocket Server state
struct WsServerState {
    shutdown_tx: Mutex<Option<broadcast::Sender<()>>>,
    is_running: Mutex<bool>,
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

    // Determine target directory
    let final_target_dir = if let Some(dir) = target_dir {
        std::path::PathBuf::from(dir)
    } else {
        let desktop = desktop_dir().ok_or("Failed to get desktop directory")?;
        desktop.join("FlowSelect_Received")
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

    // Determine target directory
    let final_target_dir = if let Some(dir) = target_dir {
        std::path::PathBuf::from(dir)
    } else {
        let desktop = desktop_dir().ok_or("Failed to get desktop directory")?;
        desktop.join("FlowSelect_Received")
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

#[tauri::command]
async fn download_video(app: AppHandle, url: String) -> Result<DownloadResult, String> {
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
        "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b".to_string(),
        "--merge-output-format".to_string(),
        "mp4".to_string(),
        "--no-keep-video".to_string(),
        "-S".to_string(),
        "ext:mp4:m4a".to_string(),
        "--newline".to_string(),
        "--progress".to_string(),
        "-o".to_string(),
        output_template.to_string_lossy().to_string(),
    ];

    // Add cookies support if enabled
    let cookies_enabled = config
        .get("cookiesEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut temp_profile_path: Option<PathBuf> = None;

    if cookies_enabled {
        if let Some(browser) = config.get("cookiesBrowser").and_then(|v| v.as_str()) {
            let valid_browsers = ["chrome", "edge", "firefox", "brave"];
            if valid_browsers.contains(&browser) {
                // Try to prepare cookies profile
                if let Some(profile_path) = prepare_cookies_profile(browser) {
                    args.push("--cookies-from-browser".to_string());
                    args.push(format!("{}:{}", browser, profile_path.to_string_lossy()));
                    temp_profile_path = Some(profile_path);
                    println!(">>> [Rust] Using cookies from browser: {} with profile: {:?}", browser, temp_profile_path);
                } else {
                    println!(">>> [Rust] Warning: Could not prepare cookies profile for {}, continuing without cookies", browser);
                }
            }
        }
    }

    args.push(url.clone());

    // Spawn yt-dlp process
    let shell = app.shell();
    let (mut rx, child) = shell
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .args(&args)
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

                // Capture file path (use regex to preserve Windows drive letter)
                if line_str.contains("[Merger]") || line_str.contains("Destination:") {
                    // Match quoted path with Windows drive letter: "D:\path\file.mp4"
                    let re = Regex::new(r#""([A-Za-z]:\\[^"]+)""#).unwrap();
                    if let Some(caps) = re.captures(&line_str) {
                        last_file_path = Some(caps.get(1).unwrap().as_str().to_string());
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

                // Cleanup temp cookies profile
                if let Some(ref profile_path) = temp_profile_path {
                    if let Err(e) = fs::remove_dir_all(profile_path) {
                        println!(">>> [Rust] Warning: Failed to cleanup temp profile: {}", e);
                    } else {
                        println!(">>> [Rust] Cleaned up temp cookies profile");
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
    Ok(DownloadResult {
        success: false,
        file_path: None,
        error: Some("Process ended unexpectedly".to_string()),
    })
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
fn get_browser_cookies_path(browser: &str) -> Option<PathBuf> {
    match browser {
        "edge" => {
            std::env::var("LOCALAPPDATA").ok().map(|local| {
                PathBuf::from(local)
                    .join("Microsoft")
                    .join("Edge")
                    .join("User Data")
                    .join("Default")
                    .join("Network")
                    .join("Cookies")
            })
        }
        "chrome" => {
            std::env::var("LOCALAPPDATA").ok().map(|local| {
                PathBuf::from(local)
                    .join("Google")
                    .join("Chrome")
                    .join("User Data")
                    .join("Default")
                    .join("Network")
                    .join("Cookies")
            })
        }
        "brave" => {
            std::env::var("LOCALAPPDATA").ok().map(|local| {
                PathBuf::from(local)
                    .join("BraveSoftware")
                    .join("Brave-Browser")
                    .join("User Data")
                    .join("Default")
                    .join("Network")
                    .join("Cookies")
            })
        }
        "firefox" => {
            // Firefox uses a different structure with random profile names
            std::env::var("APPDATA").ok().and_then(|appdata| {
                let profiles_dir = PathBuf::from(appdata)
                    .join("Mozilla")
                    .join("Firefox")
                    .join("Profiles");

                if !profiles_dir.exists() {
                    return None;
                }

                // Find profile directory matching *.default* pattern
                fs::read_dir(&profiles_dir)
                    .ok()?
                    .filter_map(|e| e.ok())
                    .find(|entry| {
                        entry.file_name()
                            .to_string_lossy()
                            .contains("default")
                    })
                    .map(|entry| entry.path().join("cookies.sqlite"))
            })
        }
        _ => None,
    }
}

/// Prepare temporary cookies profile for yt-dlp
fn prepare_cookies_profile(browser: &str) -> Option<PathBuf> {
    let cookies_path = get_browser_cookies_path(browser)?;

    if !cookies_path.exists() {
        println!(">>> [Rust] Warning: Cookies file not found: {:?}", cookies_path);
        return None;
    }

    // Create temp profile directory
    let temp_dir = std::env::temp_dir();
    let profile_dir = temp_dir.join(format!("flowselect_cookies_{}", browser));

    // For Firefox, the structure is different
    if browser == "firefox" {
        // Firefox: temp_dir/flowselect_cookies_firefox/cookies.sqlite
        if let Err(e) = fs::create_dir_all(&profile_dir) {
            println!(">>> [Rust] Warning: Failed to create temp profile dir: {}", e);
            return None;
        }

        let dest_path = profile_dir.join("cookies.sqlite");
        if let Err(e) = fs::copy(&cookies_path, &dest_path) {
            println!(">>> [Rust] Warning: Failed to copy cookies: {}", e);
            return None;
        }

        println!(">>> [Rust] Copied Firefox cookies to: {:?}", dest_path);
    } else {
        // Chromium-based: temp_dir/flowselect_cookies_{browser}/Default/Network/Cookies
        let network_dir = profile_dir.join("Default").join("Network");
        if let Err(e) = fs::create_dir_all(&network_dir) {
            println!(">>> [Rust] Warning: Failed to create temp profile dir: {}", e);
            return None;
        }

        let dest_path = network_dir.join("Cookies");
        if let Err(e) = fs::copy(&cookies_path, &dest_path) {
            println!(">>> [Rust] Warning: Failed to copy cookies: {}", e);
            return None;
        }

        println!(">>> [Rust] Copied {} cookies to: {:?}", browser, dest_path);
    }

    Some(profile_dir)
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

    // Extract speed (after "at")
    let speed = line
        .split(" at ")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .unwrap_or("N/A")
        .to_string();

    // Extract ETA
    let eta = line
        .split("ETA ")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .unwrap_or("N/A")
        .to_string();

    Some(DownloadProgress { percent, speed, eta })
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
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.set_skip_taskbar(true);
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

    let addr: SocketAddr = "127.0.0.1:18900".parse().unwrap();
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind: {}", e))?;

    // Create shutdown channel
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    *state.shutdown_tx.lock().unwrap() = Some(shutdown_tx.clone());
    *state.is_running.lock().unwrap() = true;

    let app_handle = app.clone();

    // Spawn server task
    tokio::spawn(async move {
        loop {
            let mut shutdown_rx = shutdown_tx.subscribe();

            tokio::select! {
                result = listener.accept() => {
                    if let Ok((stream, _)) = result {
                        let app_clone = app_handle.clone();
                        tokio::spawn(handle_ws_connection(stream, app_clone));
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

async fn handle_ws_connection(stream: tokio::net::TcpStream, app: AppHandle) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            println!(">>> [WS] Handshake failed: {}", e);
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();
    println!(">>> [WS] Client connected");

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let response = process_ws_message(&text, &app).await;
                let json = serde_json::to_string(&response).unwrap_or_default();
                if write.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
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
                    let app_clone = app.clone();
                    let url_owned = url.to_string();
                    tokio::spawn(async move {
                        let _ = download_video(app_clone, url_owned).await;
                    });
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
    println!(">>> [WS] Server stopped");
    Ok("WebSocket server stopped".to_string())
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
            get_ws_server_status
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

