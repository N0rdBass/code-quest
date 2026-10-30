// Code Quest desktop shell. The whole app lives in ../app (HTML/JS);
// Rust only decides where progress is saved and reads/writes that file.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

const DATA_FOLDER: &str = "code-quest-data";
const SAVE_FILE: &str = "progress.json";
const MAX_SAVE_BYTES: usize = 5 * 1024 * 1024;

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// The folder the app "lives in", as the user sees it:
/// - Linux AppImage: the folder holding the .AppImage (the exe itself is in a read-only mount)
/// - macOS: the folder holding Code Quest.app (not Contents/MacOS inside it)
/// - otherwise: the folder holding the executable
fn app_home() -> Option<PathBuf> {
    if let Ok(appimage) = std::env::var("APPIMAGE") {
        return Path::new(&appimage).parent().map(Path::to_path_buf);
    }
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.to_path_buf();
    if cfg!(target_os = "macos") {
        // .../Code Quest.app/Contents/MacOS/code-quest -> .../
        if let Some(app_bundle) = dir.ancestors().find(|p| p.extension().is_some_and(|e| e == "app")) {
            return app_bundle.parent().map(Path::to_path_buf);
        }
    }
    Some(dir)
}

fn is_writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    let ok = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

/// Portable mode first: save next to the app, so progress travels on a USB stick.
/// If that folder is read-only (e.g. installed in Program Files), fall back to the
/// normal per-user app data folder.
fn resolve_data_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Some(home) = app_home() {
        let portable = home.join(DATA_FOLDER);
        if is_writable(&portable) {
            return portable;
        }
    }
    let fallback = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(DATA_FOLDER));
    let _ = fs::create_dir_all(&fallback);
    fallback
}

fn data_dir() -> Result<&'static PathBuf, String> {
    DATA_DIR.get().ok_or_else(|| "data folder not ready".to_string())
}

#[tauri::command]
fn load_progress() -> Result<String, String> {
    let path = data_dir()?.join(SAVE_FILE);
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("could not read {}: {e}", path.display())),
    }
}

#[tauri::command]
fn save_progress(json: String) -> Result<(), String> {
    if json.len() > MAX_SAVE_BYTES {
        return Err("save is too large".into());
    }
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("not valid JSON: {e}"))?;
    let dir = data_dir()?;
    let path = dir.join(SAVE_FILE);
    let tmp = dir.join(format!("{SAVE_FILE}.tmp"));
    // Write to a temp file and rename, so pulling the USB stick mid-save
    // can't leave a half-written progress file behind.
    let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn data_location() -> Result<String, String> {
    Ok(data_dir()?.display().to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = resolve_data_dir(app.handle());
            let _ = DATA_DIR.set(dir);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_progress, save_progress, data_location])
        .run(tauri::generate_context!())
        .expect("error while running Code Quest");
}
