use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

const SERVICE_NAME: &str = "FocusTask";
const TOKEN_ACCOUNT: &str = "auth_token";
const USERNAME_ACCOUNT: &str = "auth_username";
const REPORT_EXPORT_DIRECTORY: [&str; 2] = ["Focus Task", "Reports"];

#[derive(Serialize, Deserialize, Clone)]
struct AuthState {
    token: String,
    username: String,
}

#[derive(Serialize, Deserialize)]
struct NativeNotificationPayload {
    title: String,
    body: String,
}

fn keyring_entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, account).map_err(|err| err.to_string())
}

#[tauri::command]
fn load_auth_state() -> Result<Option<AuthState>, String> {
    let token_entry = keyring_entry(TOKEN_ACCOUNT)?;
    let username_entry = keyring_entry(USERNAME_ACCOUNT)?;

    let token = match token_entry.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    let username = match username_entry.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => String::new(),
        Err(err) => return Err(err.to_string()),
    };

    Ok(Some(AuthState { token, username }))
}

#[tauri::command]
fn save_auth_state(state: AuthState) -> Result<(), String> {
    keyring_entry(TOKEN_ACCOUNT)?
        .set_password(&state.token)
        .map_err(|err| err.to_string())?;
    keyring_entry(USERNAME_ACCOUNT)?
        .set_password(&state.username)
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn clear_auth_state() -> Result<(), String> {
    for account in [TOKEN_ACCOUNT, USERNAME_ACCOUNT] {
        if let Err(err) = keyring_entry(account)?.delete_credential() {
            if !matches!(err, keyring::Error::NoEntry) {
                return Err(err.to_string());
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:notifications"])
            .status()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("当前客户端仅支持在 Windows 中打开通知设置".to_string())
}

#[tauri::command]
fn append_log(app: tauri::AppHandle, level: String, message: String) -> Result<(), String> {
    let log_dir = app.path().app_log_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&log_dir).map_err(|err| err.to_string())?;
    let path = log_dir.join("frontend.log");
    let line = format!("[{}] {}\n", level, message);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|err| err.to_string())?;
    file.write_all(line.as_bytes())
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn report_export_directory(documents_dir: &Path) -> PathBuf {
    documents_dir
        .join(REPORT_EXPORT_DIRECTORY[0])
        .join(REPORT_EXPORT_DIRECTORY[1])
}

fn is_reserved_windows_filename(stem: &str) -> bool {
    matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn sanitize_report_filename(filename: &str) -> Result<String, String> {
    let mut clean = String::with_capacity(filename.len());
    for character in filename.trim().chars() {
        if character.is_control()
            || matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            )
        {
            clean.push('_');
        } else {
            clean.push(character);
        }
    }

    let mut clean = clean
        .trim()
        .trim_matches(|character: char| character == '.' || character == ' ')
        .chars()
        .take(120)
        .collect::<String>();
    clean = clean
        .trim_end_matches(|character: char| character == '.' || character == ' ')
        .to_string();

    if clean.is_empty() {
        return Err("导出文件名不能为空".to_string());
    }

    let stem = clean.split('.').next().unwrap_or_default();
    if is_reserved_windows_filename(stem) {
        clean = format!("report-{clean}");
    }
    if !clean.to_ascii_lowercase().ends_with(".md") {
        clean.push_str(".md");
    }
    Ok(clean)
}

fn report_output_path(documents_dir: &Path, filename: &str) -> Result<PathBuf, String> {
    let directory = report_export_directory(documents_dir);
    let output = directory.join(sanitize_report_filename(filename)?);
    if output.parent() != Some(directory.as_path()) {
        return Err("导出文件路径无效".to_string());
    }
    Ok(output)
}

fn write_report_markdown(
    documents_dir: &Path,
    filename: &str,
    markdown: &str,
) -> Result<PathBuf, String> {
    let output = report_output_path(documents_dir, filename)?;
    let parent = output
        .parent()
        .ok_or_else(|| "导出文件路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|err| format!("无法创建报告导出目录：{err}"))?;
    fs::write(&output, markdown.as_bytes()).map_err(|err| format!("无法保存报告文件：{err}"))?;
    Ok(output)
}

fn existing_report_output_path(documents_dir: &Path, filename: &str) -> Result<PathBuf, String> {
    let output = report_output_path(documents_dir, filename)?;
    if !output.is_file() {
        return Err("文件尚未下载到“文档\\Focus Task\\Reports”，请先下载。".to_string());
    }
    Ok(output)
}

fn documents_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .document_dir()
        .map_err(|err| format!("无法定位 Windows 文档目录：{err}"))
}

fn reveal_report_file(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg("/select,")
            .arg(path)
            .spawn()
            .map_err(|err| format!("无法打开资源管理器：{err}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("当前客户端仅支持在 Windows 中打开报告文件夹".to_string())
}

#[tauri::command]
fn save_report_markdown(
    app: tauri::AppHandle,
    filename: String,
    markdown: String,
) -> Result<(), String> {
    write_report_markdown(&documents_directory(&app)?, &filename, &markdown)?;
    Ok(())
}

#[tauri::command]
fn save_and_reveal_report_markdown(
    app: tauri::AppHandle,
    filename: String,
    markdown: String,
) -> Result<(), String> {
    let output = write_report_markdown(&documents_directory(&app)?, &filename, &markdown)?;
    reveal_report_file(&output)
}

#[tauri::command]
fn reveal_report_markdown(app: tauri::AppHandle, filename: String) -> Result<(), String> {
    let output = existing_report_output_path(&documents_directory(&app)?, &filename)?;
    reveal_report_file(&output)
}

#[tauri::command]
fn send_native_notification(
    app_handle: tauri::AppHandle,
    payload: NativeNotificationPayload,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        app_handle
            .notification()
            .builder()
            .title(payload.title)
            .body(payload.body)
            .show()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("当前客户端仅支持在 Windows 中发送原生通知".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            load_auth_state,
            save_auth_state,
            clear_auth_state,
            open_notification_settings,
            send_native_notification,
            append_log,
            save_report_markdown,
            save_and_reveal_report_markdown,
            reveal_report_markdown
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Focus Task")
        .run(|_, _| {});
}

#[cfg(test)]
mod report_export_tests {
    use super::*;

    #[test]
    fn report_filename_removes_path_components_and_forces_markdown_extension() {
        assert_eq!(
            sanitize_report_filename(r"..\reports/evil.exe").unwrap(),
            "_reports_evil.exe.md"
        );
        assert_eq!(
            sanitize_report_filename("monthly.md").unwrap(),
            "monthly.md"
        );
    }

    #[test]
    fn report_filename_avoids_windows_device_names() {
        assert_eq!(sanitize_report_filename("CON").unwrap(), "report-CON.md");
    }

    #[test]
    fn report_output_cannot_escape_the_controlled_documents_directory() {
        let documents = Path::new("documents");
        let directory = report_export_directory(documents);
        let output = report_output_path(documents, r"..\..\outside.txt").unwrap();

        assert!(output.starts_with(&directory));
        assert_eq!(
            output.file_name().and_then(|name| name.to_str()),
            Some("_.._outside.txt.md")
        );
    }

    #[test]
    fn report_markdown_is_written_beneath_the_controlled_directory() {
        let root = std::env::temp_dir().join(format!(
            "focus-task-report-export-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);

        let output = write_report_markdown(&root, "task-42.md", "# report").unwrap();
        assert!(output.starts_with(report_export_directory(&root)));
        assert_eq!(fs::read_to_string(&output).unwrap(), "# report");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reveal_requires_a_previously_saved_report_file() {
        let root = std::env::temp_dir().join(format!(
            "focus-task-report-reveal-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);

        let error = existing_report_output_path(&root, "task-42.md").unwrap_err();
        assert_eq!(
            error,
            "文件尚未下载到“文档\\Focus Task\\Reports”，请先下载。"
        );

        let saved = write_report_markdown(&root, "task-42.md", "# report").unwrap();
        assert_eq!(
            existing_report_output_path(&root, "task-42.md").unwrap(),
            saved
        );

        fs::remove_dir_all(&root).unwrap();
    }
}
