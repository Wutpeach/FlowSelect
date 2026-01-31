use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;

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
fn download_image(url: String, target_dir: Option<String>) -> Result<String, String> {
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
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_data_url(data_url: String, target_dir: Option<String>, original_filename: Option<String>) -> Result<String, String> {
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
    Ok(dest_path.to_string_lossy().to_string())
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
    let output_dir = config
        .get("outputPath")
        .and_then(|v| v.as_str())
        .map(|s| std::path::PathBuf::from(s))
        .unwrap_or_else(|| {
            desktop_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("FlowSelect_Received")
        });

    // Create output directory if not exists
    if !output_dir.exists() {
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    // Get next sequence number
    let seq_num = get_next_sequence_number(&output_dir)?;
    let output_template = output_dir.join(format!("{}.%(ext)s", seq_num));

    // Build args
    let mut args = vec![
        "-f".to_string(),
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string(),
        "--merge-output-format".to_string(),
        "mp4".to_string(),
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

    if cookies_enabled {
        if let Some(browser) = config.get("cookiesBrowser").and_then(|v| v.as_str()) {
            let valid_browsers = ["chrome", "edge", "firefox", "brave"];
            if valid_browsers.contains(&browser) {
                args.push("--cookies-from-browser".to_string());
                args.push(browser.to_string());
                println!(">>> [Rust] Using cookies from browser: {}", browser);
            }
        }
    }

    args.push(url.clone());

    // Spawn yt-dlp process
    let shell = app.shell();
    let (mut rx, _child) = shell
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .args(&args)
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

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

                // Capture file path
                if line_str.contains("[Merger]") || line_str.contains("Destination:") {
                    if let Some(path) = line_str.split(':').last() {
                        last_file_path = Some(path.trim().to_string());
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

    // Get sidecar path
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let sidecar_path = resource_dir.join("binaries").join("yt-dlp-x86_64-pc-windows-msvc.exe");
    println!(">>> [Rust] Sidecar path: {:?}", sidecar_path);

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

    // Create temp file first, then rename
    let temp_path = sidecar_path.with_extension("exe.tmp");

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

    // Replace old file with new one
    if sidecar_path.exists() {
        tokio::fs::remove_file(&sidecar_path)
            .await
            .map_err(|e| format!("Failed to remove old file: {}", e))?;
    }

    tokio::fs::rename(&temp_path, &sidecar_path)
        .await
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

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
            check_ytdlp_version,
            update_ytdlp,
            is_directory,
            open_folder
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

