use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::process::Command;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

const SERVICE_NAME: &str = "FocusTask";
const TOKEN_ACCOUNT: &str = "auth_token";
const USERNAME_ACCOUNT: &str = "auth_username";

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
            append_log
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
