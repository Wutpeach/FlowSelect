use std::fs;
use std::path::Path;

use clipboard_win::{formats, get_clipboard};
use dirs::desktop_dir;

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

#[tauri::command]
fn process_files(paths: Vec<String>) -> Result<String, String> {
    println!(">>> [Rust] Receiving files to process: {:?}", paths);

    let desktop = desktop_dir().ok_or("Failed to get desktop directory")?;
    let target_dir = desktop.join("FlowSelect_Received");

    if !target_dir.exists() {
        fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    let mut copied_count = 0;
    for path_str in &paths {
        let source = Path::new(path_str);
        if source.exists() && source.is_file() {
            if let Some(file_name) = source.file_name() {
                let dest = target_dir.join(file_name);
                fs::copy(source, &dest)
                    .map_err(|e| format!("Failed to copy {}: {}", path_str, e))?;
                copied_count += 1;
            }
        }
    }

    Ok(format!("Copied {} files to {:?}", copied_count, target_dir))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![list_files, process_files, get_clipboard_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
