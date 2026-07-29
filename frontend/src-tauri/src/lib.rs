use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

const SERVICE_NAME: &str = "FocusTask";
const AUTH_STATE_ACCOUNT: &str = "auth_state";
const LEGACY_TOKEN_ACCOUNT: &str = "auth_token";
const LEGACY_USERNAME_ACCOUNT: &str = "auth_username";
const REPORT_EXPORT_DIRECTORY: [&str; 2] = ["Focus Task", "Reports"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
struct AuthState {
    token: String,
    username: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
struct StoredAuthState {
    token: String,
    username: String,
    // Older installations stored AuthState directly and therefore have no
    // marker. Missing means committed so those sessions remain readable.
    #[serde(default)]
    pending: bool,
}

#[derive(Serialize, Deserialize)]
struct NativeNotificationPayload {
    title: String,
    body: String,
}

fn keyring_entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, account).map_err(|err| err.to_string())
}

fn read_credential(account: &str) -> Result<Option<String>, String> {
    match keyring_entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn deserialize_stored_auth_state(serialized: &str) -> Result<StoredAuthState, String> {
    let state: StoredAuthState = serde_json::from_str(serialized)
        .map_err(|_| "Windows Credential Manager 中的登录状态格式无效".to_string())?;
    if state.token.trim().is_empty() {
        return Err("Windows Credential Manager 中的登录令牌为空".to_string());
    }
    Ok(state)
}

fn serialize_stored_auth_state(state: &AuthState, pending: bool) -> Result<String, String> {
    serde_json::to_string(&StoredAuthState {
        token: state.token.clone(),
        username: state.username.clone(),
        pending,
    })
    .map_err(|_| "无法序列化登录状态".to_string())
}

fn deserialize_auth_state(serialized: &str) -> Result<AuthState, String> {
    let state = deserialize_stored_auth_state(serialized)?;
    if state.pending {
        return Err("Windows Credential Manager 中的登录状态尚未确认，请重新登录".to_string());
    }
    Ok(AuthState {
        token: state.token,
        username: state.username,
    })
}

fn verify_pending_auth_state(serialized: &str, expected: &AuthState) -> Result<(), String> {
    let saved = deserialize_stored_auth_state(serialized)?;
    if saved.pending && saved.token == expected.token && saved.username == expected.username {
        Ok(())
    } else {
        Err("Windows Credential Manager 未保留完整待确认登录状态".to_string())
    }
}

fn clear_accounts<F>(accounts: &[&str], mut delete: F) -> Result<(), String>
where
    F: FnMut(&str) -> Result<(), String>,
{
    let mut failures = Vec::new();
    for account in accounts {
        if let Err(err) = delete(account) {
            failures.push(format!("{account}: {err}"));
        }
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "无法完整清除 Windows 凭据管理器登录状态：{}",
            failures.join("；")
        ))
    }
}

fn delete_credential(account: &str) -> Result<(), String> {
    match keyring_entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

fn clear_legacy_auth_state() -> Result<(), String> {
    clear_accounts(
        &[LEGACY_TOKEN_ACCOUNT, LEGACY_USERNAME_ACCOUNT],
        delete_credential,
    )
}

fn clear_auth_state_entries<F>(mut delete: F) -> Result<(), String>
where
    F: FnMut(&str) -> Result<(), String>,
{
    // Delete both legacy records before the new atomic record. If either
    // legacy deletion fails, leave auth_state intact so the next launch keeps
    // using the current session instead of falling back to an old token.
    clear_accounts(
        &[LEGACY_TOKEN_ACCOUNT, LEGACY_USERNAME_ACCOUNT],
        |account| delete(account),
    )?;
    delete(AUTH_STATE_ACCOUNT)
}

fn cleanup_failed_auth_save<F>(mut delete: F) -> Result<(), String>
where
    F: FnMut(&str) -> Result<(), String>,
{
    // A failed save leaves auth_state in the pending form, which is a startup
    // gate. Clear both legacy records first; if either deletion fails, retain
    // that gate so load_auth_state cannot fall back to an old account. Only
    // remove the pending record after legacy cleanup completely succeeds.
    clear_accounts(
        &[LEGACY_TOKEN_ACCOUNT, LEGACY_USERNAME_ACCOUNT],
        |account| delete(account),
    )?;
    delete(AUTH_STATE_ACCOUNT)
}

fn load_legacy_auth_state() -> Result<Option<AuthState>, String> {
    let token = read_credential(LEGACY_TOKEN_ACCOUNT)?;
    let username = read_credential(LEGACY_USERNAME_ACCOUNT)?;

    match token {
        Some(token) if !token.trim().is_empty() => Ok(Some(AuthState {
            token,
            username: username.unwrap_or_default(),
        })),
        _ => Ok(None),
    }
}

fn load_auth_state_with<R, L>(mut read: R, load_legacy: L) -> Result<Option<AuthState>, String>
where
    R: FnMut(&str) -> Result<Option<String>, String>,
    L: FnOnce() -> Result<Option<AuthState>, String>,
{
    if let Some(serialized) = read(AUTH_STATE_ACCOUNT)? {
        // A pending record is deliberately an error rather than a signal to
        // fall back to legacy credentials. That prevents a failed save from
        // reviving either the new token or an older account at next startup.
        return deserialize_auth_state(&serialized).map(Some);
    }

    load_legacy()
}

#[tauri::command]
fn load_auth_state() -> Result<Option<AuthState>, String> {
    load_auth_state_with(read_credential, load_legacy_auth_state)
}

fn save_auth_state_with<W, R, D>(
    state: &AuthState,
    mut write: W,
    mut read: R,
    mut delete: D,
) -> Result<(), String>
where
    W: FnMut(&str) -> Result<(), String>,
    R: FnMut() -> Result<Option<String>, String>,
    D: FnMut(&str) -> Result<(), String>,
{
    let save_result = (|| {
        let pending = serialize_stored_auth_state(state, true)?;
        write(&pending)?;

        match read()? {
            Some(saved) => verify_pending_auth_state(&saved, state)?,
            None => {
                return Err("Windows Credential Manager 未保留待确认登录状态".to_string());
            }
        }

        // This second successful keyring write is the commit. Do not add a
        // post-commit read that could report failure after an active record
        // already exists; any earlier failure leaves only a pending record,
        // which load_auth_state deliberately rejects.
        let committed = serialize_stored_auth_state(state, false)?;
        write(&committed)
    })();

    if let Err(error) = save_result {
        // Cleanup is only best effort. The pending marker above is the
        // fail-closed guarantee when Windows refuses to delete the record.
        return match cleanup_failed_auth_save(|account| delete(account)) {
            Ok(()) => Err(error),
            Err(cleanup_error) => Err(format!("{error}；清理失败：{cleanup_error}")),
        };
    }

    Ok(())
}

fn write_auth_state_credential(serialized: &str) -> Result<(), String> {
    keyring_entry(AUTH_STATE_ACCOUNT)?
        .set_password(serialized)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn save_auth_state(state: AuthState) -> Result<(), String> {
    if state.token.trim().is_empty() {
        return Err("拒绝保存空登录令牌".to_string());
    }

    save_auth_state_with(
        &state,
        write_auth_state_credential,
        || read_credential(AUTH_STATE_ACCOUNT),
        delete_credential,
    )?;

    // The new record contains token and username atomically. Legacy cleanup is
    // best effort after a committed save; later logout starts with both legacy
    // records and deliberately preserves auth_state if that cleanup is incomplete.
    let _ = clear_legacy_auth_state();
    Ok(())
}

#[tauri::command]
fn clear_auth_state() -> Result<(), String> {
    clear_auth_state_entries(delete_credential)
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

    // The folder action can be triggered more than once. `create_new` makes
    // the first writer win without a check-then-write race, so a user-edited
    // Markdown file is never replaced by a later report snapshot.
    let mut file = match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output)
    {
        Ok(file) => file,
        Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(&output)
                .map_err(|metadata_err| format!("无法检查已有报告文件：{metadata_err}"))?;
            if metadata.file_type().is_file() {
                return Ok(output);
            }
            return Err("报告文件路径已被非普通文件占用，无法保存。".to_string());
        }
        Err(err) => return Err(format!("无法保存报告文件：{err}")),
    };
    file.write_all(markdown.as_bytes())
        .map_err(|err| format!("无法保存报告文件：{err}"))?;
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
    fn existing_user_report_file_is_revealed_without_being_overwritten() {
        let root = std::env::temp_dir().join(format!(
            "focus-task-report-preserve-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let output = report_output_path(&root, "task-42.md").unwrap();
        fs::create_dir_all(output.parent().unwrap()).unwrap();
        fs::write(&output, "# 用户手工编辑").unwrap();

        let returned = write_report_markdown(&root, "task-42.md", "# 服务快照").unwrap();

        assert_eq!(returned, output);
        assert_eq!(fs::read_to_string(&output).unwrap(), "# 用户手工编辑");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn repeated_report_saves_keep_the_first_created_markdown() {
        let root = std::env::temp_dir().join(format!(
            "focus-task-report-repeat-save-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);

        let first = write_report_markdown(&root, "task-42.md", "# 首次保存").unwrap();
        let second = write_report_markdown(&root, "task-42.md", "# 重复保存").unwrap();

        assert_eq!(first, second);
        assert_eq!(fs::read_to_string(&first).unwrap(), "# 首次保存");

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

#[cfg(test)]
mod auth_state_tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    #[test]
    fn committed_auth_state_round_trips_while_pending_state_is_rejected() {
        let expected = AuthState {
            token: "service-jwt".to_string(),
            username: "alice".to_string(),
        };

        let legacy_serialized = serde_json::to_string(&expected).unwrap();
        assert_eq!(
            deserialize_auth_state(&legacy_serialized).unwrap(),
            expected
        );

        let committed = serialize_stored_auth_state(&expected, false).unwrap();
        assert_eq!(deserialize_auth_state(&committed).unwrap(), expected);

        let pending = serialize_stored_auth_state(&expected, true).unwrap();
        let pending_error = deserialize_auth_state(&pending).unwrap_err();
        assert!(pending_error.contains("尚未确认"));

        assert!(deserialize_auth_state("not-json").is_err());
        assert!(deserialize_auth_state(r#"{"token":"","username":"alice"}"#).is_err());
    }

    #[test]
    fn verified_pending_state_commits_without_a_post_commit_read() {
        let expected = AuthState {
            token: "service-jwt".to_string(),
            username: "alice".to_string(),
        };
        let stored = Rc::new(RefCell::new(None::<String>));
        let writes = Rc::new(RefCell::new(Vec::<String>::new()));

        save_auth_state_with(
            &expected,
            {
                let stored = Rc::clone(&stored);
                let writes = Rc::clone(&writes);
                move |serialized| {
                    writes.borrow_mut().push(serialized.to_string());
                    *stored.borrow_mut() = Some(serialized.to_string());
                    Ok(())
                }
            },
            {
                let stored = Rc::clone(&stored);
                move || Ok(stored.borrow().clone())
            },
            |_| Ok(()),
        )
        .unwrap();

        assert_eq!(writes.borrow().len(), 2);
        assert!(
            deserialize_stored_auth_state(&writes.borrow()[0])
                .unwrap()
                .pending
        );
        assert!(
            !deserialize_stored_auth_state(&writes.borrow()[1])
                .unwrap()
                .pending
        );
        assert_eq!(
            load_auth_state_with(
                {
                    let stored = Rc::clone(&stored);
                    move |_| Ok(stored.borrow().clone())
                },
                || Ok(None),
            )
            .unwrap(),
            Some(expected)
        );
    }

    #[test]
    fn failed_pending_save_is_rejected_after_auth_state_delete_failure_and_restart() {
        let new_state = AuthState {
            token: "new-service-jwt".to_string(),
            username: "bob".to_string(),
        };
        let stored = Rc::new(RefCell::new(None::<String>));
        let deleted = Rc::new(RefCell::new(Vec::<String>::new()));

        let error = save_auth_state_with(
            &new_state,
            {
                let stored = Rc::clone(&stored);
                move |serialized| {
                    *stored.borrow_mut() = Some(serialized.to_string());
                    Ok(())
                }
            },
            || Err("simulated readback failure".to_string()),
            {
                let deleted = Rc::clone(&deleted);
                move |account| {
                    deleted.borrow_mut().push(account.to_string());
                    if account == AUTH_STATE_ACCOUNT {
                        Err("simulated auth_state delete failure".to_string())
                    } else {
                        Ok(())
                    }
                }
            },
        )
        .unwrap_err();

        assert!(error.contains("simulated readback failure"));
        assert!(error.contains("simulated auth_state delete failure"));
        assert_eq!(
            *deleted.borrow(),
            vec![
                LEGACY_TOKEN_ACCOUNT.to_string(),
                LEGACY_USERNAME_ACCOUNT.to_string(),
                AUTH_STATE_ACCOUNT.to_string(),
            ]
        );
        let pending = stored.borrow().clone().unwrap();
        assert!(deserialize_stored_auth_state(&pending).unwrap().pending);

        let restart_error = load_auth_state_with(
            {
                let stored = Rc::clone(&stored);
                move |account| {
                    assert_eq!(account, AUTH_STATE_ACCOUNT);
                    Ok(stored.borrow().clone())
                }
            },
            || panic!("pending auth_state must not fall back to legacy credentials"),
        )
        .unwrap_err();
        assert!(restart_error.contains("尚未确认"));
    }

    #[test]
    fn failed_pending_save_preserves_gate_when_legacy_token_delete_fails() {
        let new_state = AuthState {
            token: "new-service-jwt".to_string(),
            username: "bob".to_string(),
        };
        let stored = Rc::new(RefCell::new(None::<String>));
        let deleted = Rc::new(RefCell::new(Vec::<String>::new()));

        let error = save_auth_state_with(
            &new_state,
            {
                let stored = Rc::clone(&stored);
                move |serialized| {
                    *stored.borrow_mut() = Some(serialized.to_string());
                    Ok(())
                }
            },
            || Err("simulated pending verification failure".to_string()),
            {
                let deleted = Rc::clone(&deleted);
                move |account| {
                    deleted.borrow_mut().push(account.to_string());
                    if account == LEGACY_TOKEN_ACCOUNT {
                        Err("simulated legacy token delete failure".to_string())
                    } else {
                        // Deleting AUTH_STATE_ACCOUNT would succeed, but the
                        // legacy failure must prevent this callback from being
                        // reached for that account.
                        Ok(())
                    }
                }
            },
        )
        .unwrap_err();

        assert!(error.contains("simulated pending verification failure"));
        assert!(error.contains("simulated legacy token delete failure"));
        assert_eq!(
            *deleted.borrow(),
            vec![
                LEGACY_TOKEN_ACCOUNT.to_string(),
                LEGACY_USERNAME_ACCOUNT.to_string(),
            ]
        );
        let pending = stored.borrow().clone().unwrap();
        assert!(deserialize_stored_auth_state(&pending).unwrap().pending);

        let restart_error = load_auth_state_with(
            {
                let stored = Rc::clone(&stored);
                move |account| {
                    assert_eq!(account, AUTH_STATE_ACCOUNT);
                    Ok(stored.borrow().clone())
                }
            },
            || panic!("pending auth_state must not fall back to legacy credentials"),
        )
        .unwrap_err();
        assert!(restart_error.contains("尚未确认"));
    }

    #[test]
    fn cleanup_attempts_both_legacy_records_before_preserving_current_session() {
        let mut attempted = Vec::new();
        let result = clear_auth_state_entries(|account| {
            attempted.push(account.to_string());
            if account == LEGACY_TOKEN_ACCOUNT {
                Err("simulated delete failure".to_string())
            } else {
                Ok(())
            }
        });

        assert_eq!(
            attempted,
            vec![
                LEGACY_TOKEN_ACCOUNT.to_string(),
                LEGACY_USERNAME_ACCOUNT.to_string(),
            ]
        );
        let error = result.unwrap_err();
        assert!(error.contains(LEGACY_TOKEN_ACCOUNT));
        assert!(error.contains("simulated delete failure"));
    }

    #[test]
    fn cleanup_removes_current_record_only_after_legacy_records_are_gone() {
        let mut attempted = Vec::new();
        clear_auth_state_entries(|account| {
            attempted.push(account.to_string());
            Ok(())
        })
        .unwrap();

        assert_eq!(
            attempted,
            vec![
                LEGACY_TOKEN_ACCOUNT.to_string(),
                LEGACY_USERNAME_ACCOUNT.to_string(),
                AUTH_STATE_ACCOUNT.to_string(),
            ]
        );
    }

    #[test]
    fn failed_save_cleanup_preserves_pending_gate_when_legacy_cleanup_fails() {
        let mut attempted = Vec::new();
        let result = cleanup_failed_auth_save(|account| {
            attempted.push(account.to_string());
            if account == LEGACY_TOKEN_ACCOUNT {
                Err("simulated legacy delete failure".to_string())
            } else {
                Ok(())
            }
        });

        assert_eq!(
            attempted,
            vec![
                LEGACY_TOKEN_ACCOUNT.to_string(),
                LEGACY_USERNAME_ACCOUNT.to_string(),
            ]
        );
        let error = result.unwrap_err();
        assert!(error.contains(LEGACY_TOKEN_ACCOUNT));
        assert!(error.contains("simulated legacy delete failure"));
    }
}
