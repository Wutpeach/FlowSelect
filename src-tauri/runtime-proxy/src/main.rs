#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const WINDOWS_CREATE_NO_WINDOW: u32 = 0x08000000;

fn main() {
    std::process::exit(run());
}

fn run() -> i32 {
    match resolve_real_executable_path() {
        Ok(real_executable_path) => spawn_and_wait(real_executable_path),
        Err(err) => {
            eprintln!("{}", err);
            1
        }
    }
}

fn resolve_real_executable_path() -> Result<PathBuf, String> {
    let current_executable = std::env::current_exe()
        .map_err(|err| format!("Failed to resolve current proxy path: {}", err))?;
    let executable_name = current_executable
        .file_name()
        .ok_or_else(|| {
            format!(
                "Failed to resolve proxy executable name from {:?}",
                current_executable
            )
        })?
        .to_os_string();
    let parent_dir = current_executable.parent().ok_or_else(|| {
        format!(
            "Failed to resolve proxy executable directory from {:?}",
            current_executable
        )
    })?;
    let real_executable_path = parent_dir.join("real").join(executable_name);
    if !real_executable_path.exists() {
        return Err(format!(
            "Failed to resolve proxied runtime binary at {:?}",
            real_executable_path
        ));
    }
    Ok(real_executable_path)
}

fn spawn_and_wait(real_executable_path: PathBuf) -> i32 {
    let mut command = Command::new(&real_executable_path);
    command
        .args(std::env::args_os().skip(1))
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    configure_hidden_cli_command(&mut command);

    match command.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(err) => {
            eprintln!(
                "Failed to spawn proxied runtime binary {:?}: {}",
                display_path(&real_executable_path),
                err
            );
            1
        }
    }
}

fn display_path(path: &Path) -> OsString {
    path.as_os_str().to_os_string()
}

fn configure_hidden_cli_command(command: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(WINDOWS_CREATE_NO_WINDOW);
    }
    command
}
