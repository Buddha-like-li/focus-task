use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard};
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{
        CloseHandle, LocalFree, HANDLE, HLOCAL, WAIT_ABANDONED, WAIT_OBJECT_0, WAIT_TIMEOUT,
    },
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
    Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH},
    System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject},
};

const AUTH_SESSION_FILE: &str = "auth-sessions-v1.dpapi";
const AUTH_SESSION_MAGIC: &[u8] = b"FocusTaskAuth\0";
const AUTH_SESSION_FILE_VERSION: u8 = 1;
const AUTH_SESSION_STORE_VERSION: u8 = 1;
const MAX_AUTH_ACCOUNTS: usize = 8;
const MAX_AUTH_USERNAME_CHARS: usize = 128;
const MAX_AUTH_TOKEN_BYTES: usize = 48 * 1024;
const MAX_AUTH_SESSION_FILE_BYTES: usize = 1024 * 1024;
const MAX_AUTH_SESSION_PLAINTEXT_BYTES: usize = 512 * 1024;
const AUTH_SESSION_MUTEX_NAME: &str = r"Local\FocusTaskAuthSessionV1";
const AUTH_SESSION_MUTEX_TIMEOUT_MS: u32 = 10_000;
const REPORT_EXPORT_DIRECTORY: [&str; 2] = ["Focus Task", "Reports"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
struct AuthState {
    token: String,
    username: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
struct AuthAccountRecord {
    username: String,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    last_used: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
struct AuthSessionStore {
    version: u8,
    #[serde(default)]
    active_username: Option<String>,
    #[serde(default)]
    accounts: Vec<AuthAccountRecord>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AuthAccountSummary {
    username: String,
    has_session: bool,
    is_active: bool,
}

impl AuthSessionStore {
    fn empty() -> Self {
        Self {
            version: AUTH_SESSION_STORE_VERSION,
            active_username: None,
            accounts: Vec::new(),
        }
    }
}

struct AuthSessionLock(Mutex<()>);

struct AuthSessionGuard<'a> {
    _in_process: MutexGuard<'a, ()>,
    _cross_process: CrossProcessAuthSessionLock,
}

#[cfg(target_os = "windows")]
struct CrossProcessAuthSessionLock {
    handle: HANDLE,
    acquired: bool,
}

#[cfg(target_os = "windows")]
impl CrossProcessAuthSessionLock {
    fn acquire() -> Result<Self, String> {
        let name = AUTH_SESSION_MUTEX_NAME
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(format!(
                "无法锁定本机登录状态：{}",
                std::io::Error::last_os_error()
            ));
        }

        match unsafe { WaitForSingleObject(handle, AUTH_SESSION_MUTEX_TIMEOUT_MS) } {
            WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Self {
                handle,
                acquired: true,
            }),
            WAIT_TIMEOUT => {
                unsafe {
                    CloseHandle(handle);
                }
                Err("登录状态正在被另一实例处理，请稍后重试。".to_string())
            }
            _ => {
                let error = std::io::Error::last_os_error();
                unsafe {
                    CloseHandle(handle);
                }
                Err(format!("无法锁定本机登录状态：{error}"))
            }
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for CrossProcessAuthSessionLock {
    fn drop(&mut self) {
        unsafe {
            if self.acquired {
                ReleaseMutex(self.handle);
            }
            CloseHandle(self.handle);
        }
    }
}

#[cfg(not(target_os = "windows"))]
struct CrossProcessAuthSessionLock;

#[cfg(not(target_os = "windows"))]
impl CrossProcessAuthSessionLock {
    fn acquire() -> Result<Self, String> {
        Ok(Self)
    }
}

fn lock_auth_session<'a>(
    session_lock: &'a AuthSessionLock,
) -> Result<AuthSessionGuard<'a>, String> {
    let in_process = session_lock
        .0
        .lock()
        .map_err(|_| "登录状态正在处理，请稍后重试。".to_string())?;
    let cross_process = CrossProcessAuthSessionLock::acquire()?;
    Ok(AuthSessionGuard {
        _in_process: in_process,
        _cross_process: cross_process,
    })
}

#[derive(Serialize, Deserialize)]
struct NativeNotificationPayload {
    title: String,
    body: String,
}

fn normalize_username(username: &str) -> Result<String, String> {
    let normalized = username.trim();
    if normalized.is_empty()
        || normalized.chars().count() > MAX_AUTH_USERNAME_CHARS
        || normalized.chars().any(char::is_control)
    {
        return Err("用户名格式无效".to_string());
    }
    Ok(normalized.to_string())
}

fn username_key(username: &str) -> String {
    username.trim().to_string()
}

fn validate_auth_token(token: &str) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("拒绝保存空登录令牌".to_string());
    }
    if token.len() > MAX_AUTH_TOKEN_BYTES || token.chars().any(char::is_control) {
        return Err("登录令牌格式无效或过大".to_string());
    }
    Ok(())
}

fn normalize_auth_state(state: &AuthState) -> Result<AuthState, String> {
    validate_auth_token(&state.token)?;
    Ok(AuthState {
        token: state.token.clone(),
        username: normalize_username(&state.username)?,
    })
}

fn normalize_auth_session_store(store: AuthSessionStore) -> Result<AuthSessionStore, String> {
    if store.version != AUTH_SESSION_STORE_VERSION {
        return Err("已保存登录状态版本不受支持".to_string());
    }
    if store.accounts.len() > MAX_AUTH_ACCOUNTS {
        return Err("已保存登录状态包含过多账户".to_string());
    }

    let mut usernames = HashSet::new();
    for account in &store.accounts {
        let normalized = normalize_username(&account.username)?;
        if normalized != account.username {
            return Err("已保存登录状态中的用户名格式无效".to_string());
        }
        if let Some(token) = account.token.as_deref() {
            validate_auth_token(token).map_err(|_| "已保存登录状态中的会话令牌无效".to_string())?;
        }
        if !usernames.insert(username_key(&account.username)) {
            return Err("已保存登录状态包含重复账户".to_string());
        }
    }

    let mut accounts = store.accounts;
    accounts.sort_by(|left, right| {
        right
            .last_used
            .cmp(&left.last_used)
            .then_with(|| username_key(&left.username).cmp(&username_key(&right.username)))
    });
    let active_username = match store.active_username {
        Some(active) => {
            let normalized = normalize_username(&active)?;
            if normalized != active {
                return Err("已保存登录状态中的当前账户格式无效".to_string());
            }
            let active_key = username_key(&active);
            let account = accounts
                .iter()
                .find(|account| username_key(&account.username) == active_key)
                .ok_or_else(|| "已保存登录状态中的当前账户不存在".to_string())?;
            if account.token.is_none() {
                return Err("已保存登录状态中的当前账户没有有效会话".to_string());
            }
            Some(account.username.clone())
        }
        None => None,
    };

    Ok(AuthSessionStore {
        version: AUTH_SESSION_STORE_VERSION,
        active_username,
        accounts,
    })
}

fn next_last_used(store: &AuthSessionStore) -> u64 {
    store
        .accounts
        .iter()
        .map(|account| account.last_used)
        .max()
        .unwrap_or(0)
        .saturating_add(1)
}

fn upsert_auth_session(
    store: &mut AuthSessionStore,
    state: &AuthState,
) -> Result<AuthState, String> {
    let state = normalize_auth_state(state)?;
    let key = username_key(&state.username);
    let last_used = next_last_used(store);
    if let Some(account) = store
        .accounts
        .iter_mut()
        .find(|account| username_key(&account.username) == key)
    {
        account.username = state.username.clone();
        account.token = Some(state.token.clone());
        account.last_used = last_used;
    } else {
        if store.accounts.len() >= MAX_AUTH_ACCOUNTS {
            let oldest = store
                .accounts
                .iter()
                .enumerate()
                .min_by(|(_, left), (_, right)| {
                    left.last_used.cmp(&right.last_used).then_with(|| {
                        username_key(&left.username).cmp(&username_key(&right.username))
                    })
                })
                .map(|(index, _)| index)
                .ok_or_else(|| "无法整理已保存账户".to_string())?;
            store.accounts.remove(oldest);
        }
        store.accounts.push(AuthAccountRecord {
            username: state.username.clone(),
            token: Some(state.token.clone()),
            last_used,
        });
    }
    store.active_username = Some(state.username.clone());
    *store = normalize_auth_session_store(store.clone())?;
    Ok(state)
}

fn active_auth_state(store: &AuthSessionStore) -> Option<AuthState> {
    let active_key = username_key(store.active_username.as_deref()?);
    let account = store
        .accounts
        .iter()
        .find(|account| username_key(&account.username) == active_key)?;
    let token = account.token.as_ref()?.trim();
    if token.is_empty() {
        return None;
    }
    Some(AuthState {
        token: token.to_string(),
        username: account.username.clone(),
    })
}

fn clear_auth_session(store: &mut AuthSessionStore, username: Option<&str>) -> Result<(), String> {
    let target = match username {
        Some(username) => Some(normalize_username(username)?),
        None => store.active_username.clone(),
    };
    let Some(target) = target else {
        store.active_username = None;
        return Ok(());
    };
    let target_key = username_key(&target);
    if let Some(account) = store
        .accounts
        .iter_mut()
        .find(|account| username_key(&account.username) == target_key)
    {
        account.token = None;
    }
    if store
        .active_username
        .as_deref()
        .is_some_and(|active| username_key(active) == target_key)
    {
        store.active_username = None;
    }
    Ok(())
}

fn restore_saved_auth_account(
    store: &mut AuthSessionStore,
    username: &str,
) -> Result<Option<AuthState>, String> {
    let username = normalize_username(username)?;
    let key = username_key(&username);
    let last_used = next_last_used(store);
    let Some(account) = store
        .accounts
        .iter_mut()
        .find(|account| username_key(&account.username) == key)
    else {
        return Ok(None);
    };

    account.last_used = last_used;
    let Some(token) = account
        .token
        .as_ref()
        .filter(|token| !token.trim().is_empty())
    else {
        store.active_username = None;
        return Ok(None);
    };
    let state = AuthState {
        token: token.clone(),
        username: account.username.clone(),
    };
    store.active_username = Some(state.username.clone());
    *store = normalize_auth_session_store(store.clone())?;
    Ok(Some(state))
}

fn remove_auth_account_record(store: &mut AuthSessionStore, username: &str) -> Result<(), String> {
    let username = normalize_username(username)?;
    let key = username_key(&username);
    store
        .accounts
        .retain(|account| username_key(&account.username) != key);
    if store
        .active_username
        .as_deref()
        .is_some_and(|active| username_key(active) == key)
    {
        store.active_username = None;
    }
    Ok(())
}

fn auth_account_summaries(store: &AuthSessionStore) -> Vec<AuthAccountSummary> {
    store
        .accounts
        .iter()
        .map(|account| AuthAccountSummary {
            username: account.username.clone(),
            has_session: account
                .token
                .as_ref()
                .is_some_and(|token| !token.trim().is_empty()),
            is_active: store
                .active_username
                .as_deref()
                .is_some_and(|active| username_key(active) == username_key(&account.username)),
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn copy_and_free_dpapi_blob(blob: CRYPT_INTEGER_BLOB) -> Result<Vec<u8>, String> {
    let value = if blob.cbData == 0 {
        Vec::new()
    } else if blob.pbData.is_null() {
        return Err("Windows DPAPI 返回了无效数据".to_string());
    } else {
        unsafe { std::slice::from_raw_parts(blob.pbData, blob.cbData as usize).to_vec() }
    };
    if !blob.pbData.is_null() {
        unsafe {
            LocalFree(blob.pbData as HLOCAL);
        }
    }
    Ok(value)
}

#[cfg(target_os = "windows")]
fn dpapi_protect(data: &[u8]) -> Result<Vec<u8>, String> {
    let length = u32::try_from(data.len()).map_err(|_| "登录状态过大".to_string())?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: length,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let protected = unsafe {
        CryptProtectData(
            &input,
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if protected == 0 {
        return Err(format!(
            "Windows DPAPI 加密失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    copy_and_free_dpapi_blob(output)
}

#[cfg(not(target_os = "windows"))]
fn dpapi_protect(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("当前客户端仅支持 Windows DPAPI 登录状态存储".to_string())
}

#[cfg(target_os = "windows")]
fn dpapi_unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    let length = u32::try_from(data.len()).map_err(|_| "登录状态过大".to_string())?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: length,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let unprotected = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if unprotected == 0 {
        return Err(format!(
            "Windows DPAPI 无法解密已保存的登录状态：{}",
            std::io::Error::last_os_error()
        ));
    }
    copy_and_free_dpapi_blob(output)
}

#[cfg(not(target_os = "windows"))]
fn dpapi_unprotect(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("当前客户端仅支持 Windows DPAPI 登录状态存储".to_string())
}

fn encode_auth_session_store(store: &AuthSessionStore) -> Result<Vec<u8>, String> {
    let store = normalize_auth_session_store(store.clone())?;
    let mut plaintext = serde_json::to_vec(&store).map_err(|_| "无法序列化登录状态".to_string())?;
    if plaintext.len() > MAX_AUTH_SESSION_PLAINTEXT_BYTES {
        plaintext.fill(0);
        return Err("登录状态过大".to_string());
    }
    let protected = dpapi_protect(&plaintext);
    plaintext.fill(0);
    let protected = protected?;
    let mut encoded = Vec::with_capacity(AUTH_SESSION_MAGIC.len() + 1 + protected.len());
    encoded.extend_from_slice(AUTH_SESSION_MAGIC);
    encoded.push(AUTH_SESSION_FILE_VERSION);
    encoded.extend_from_slice(&protected);
    if encoded.len() > MAX_AUTH_SESSION_FILE_BYTES {
        return Err("登录状态过大".to_string());
    }
    Ok(encoded)
}

fn decode_auth_session_store(encoded: &[u8]) -> Result<AuthSessionStore, String> {
    let header_length = AUTH_SESSION_MAGIC.len() + 1;
    if encoded.len() <= header_length
        || !encoded.starts_with(AUTH_SESSION_MAGIC)
        || encoded[AUTH_SESSION_MAGIC.len()] != AUTH_SESSION_FILE_VERSION
    {
        return Err("已保存登录状态格式无效".to_string());
    }
    let mut plaintext = dpapi_unprotect(&encoded[header_length..])?;
    let decoded = serde_json::from_slice::<AuthSessionStore>(&plaintext)
        .map_err(|_| "已保存登录状态内容无效".to_string());
    plaintext.fill(0);
    normalize_auth_session_store(decoded?)
}

fn auth_session_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("无法定位本机登录状态目录：{err}"))?
        .join(AUTH_SESSION_FILE))
}

fn auth_session_temp_path(path: &Path) -> PathBuf {
    let mut filename = path
        .file_name()
        .map(OsString::from)
        .unwrap_or_else(|| OsString::from(AUTH_SESSION_FILE));
    filename.push(format!(".{}.tmp", std::process::id()));
    path.with_file_name(filename)
}

#[cfg(target_os = "windows")]
fn replace_auth_session_file(source: &Path, destination: &Path) -> Result<(), String> {
    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let moved = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        return Err(format!(
            "无法原子更新登录状态：{}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_auth_session_file(source: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(source, destination).map_err(|err| format!("无法更新登录状态：{err}"))
}

fn write_auth_session_store(path: &Path, store: &AuthSessionStore) -> Result<(), String> {
    let encoded = encode_auth_session_store(store)?;
    let parent = path
        .parent()
        .ok_or_else(|| "本机登录状态路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|err| format!("无法创建本机登录状态目录：{err}"))?;

    let temporary = auth_session_temp_path(path);
    match fs::remove_file(&temporary) {
        Ok(()) => {}
        Err(err) if err.kind() == ErrorKind::NotFound => {}
        Err(err) => return Err(format!("无法准备登录状态临时文件：{err}")),
    }
    let write_result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|err| format!("无法写入登录状态：{err}"))?;
        file.write_all(&encoded)
            .map_err(|err| format!("无法写入登录状态：{err}"))?;
        file.sync_all()
            .map_err(|err| format!("无法确认登录状态写入：{err}"))?;
        replace_auth_session_file(&temporary, path)
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

fn read_auth_session_store(path: &Path) -> Result<Option<AuthSessionStore>, String> {
    let encoded = match fs::read(path) {
        Ok(encoded) => encoded,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(format!("无法读取本机登录状态：{err}")),
    };
    if encoded.len() > MAX_AUTH_SESSION_FILE_BYTES {
        return Err("已保存登录状态文件过大".to_string());
    }
    decode_auth_session_store(&encoded).map(Some)
}

fn load_auth_session_store(app: &tauri::AppHandle) -> Result<(PathBuf, AuthSessionStore), String> {
    let path = auth_session_store_path(app)?;
    let store = read_auth_session_store(&path)?.unwrap_or_else(AuthSessionStore::empty);
    Ok((path, store))
}

fn session_store_for_authenticated_save(path: &Path) -> AuthSessionStore {
    match read_auth_session_store(path) {
        Ok(Some(store)) => store,
        // A malformed or undecryptable vault is never used to recover a
        // session. A successful fresh login is independently authenticated,
        // so it may safely establish a new authoritative DPAPI vault.
        Ok(None) | Err(_) => AuthSessionStore::empty(),
    }
}

fn load_auth_session_store_for_authenticated_save(
    app: &tauri::AppHandle,
) -> Result<(PathBuf, AuthSessionStore), String> {
    let path = auth_session_store_path(app)?;
    let store = session_store_for_authenticated_save(&path);
    Ok((path, store))
}

fn persist_session_store(path: &Path, store: &AuthSessionStore) -> Result<(), String> {
    write_auth_session_store(path, store)
}

#[tauri::command]
fn load_auth_state(
    app: tauri::AppHandle,
    session_lock: tauri::State<'_, AuthSessionLock>,
) -> Result<Option<AuthState>, String> {
    let _guard = lock_auth_session(&session_lock)?;
    let (_, store) = load_auth_session_store(&app)?;
    Ok(active_auth_state(&store))
}

#[tauri::command]
fn list_auth_accounts(
    app: tauri::AppHandle,
    session_lock: tauri::State<'_, AuthSessionLock>,
) -> Result<Vec<AuthAccountSummary>, String> {
    let _guard = lock_auth_session(&session_lock)?;
    let (_, store) = load_auth_session_store(&app)?;
    Ok(auth_account_summaries(&store))
}

#[tauri::command]
fn save_auth_state(
    app: tauri::AppHandle,
    state: AuthState,
    session_lock: tauri::State<'_, AuthSessionLock>,
) -> Result<(), String> {
    let _guard = lock_auth_session(&session_lock)?;
    let state = normalize_auth_state(&state)?;
    let (path, mut store) = load_auth_session_store_for_authenticated_save(&app)?;
    upsert_auth_session(&mut store, &state)?;
    persist_session_store(&path, &store)
}

#[tauri::command]
fn restore_auth_account(
    app: tauri::AppHandle,
    username: String,
    session_lock: tauri::State<'_, AuthSessionLock>,
) -> Result<Option<AuthState>, String> {
    let _guard = lock_auth_session(&session_lock)?;
    let (path, mut store) = load_auth_session_store(&app)?;
    let state = restore_saved_auth_account(&mut store, &username)?;
    // Selecting an account without a valid token still deactivates the prior
    // account, so the login form cannot silently revive it after a restart.
    persist_session_store(&path, &store)?;
    Ok(state)
}

#[tauri::command]
fn clear_auth_state(
    app: tauri::AppHandle,
    username: Option<String>,
    session_lock: tauri::State<'_, AuthSessionLock>,
) -> Result<(), String> {
    let _guard = lock_auth_session(&session_lock)?;
    let (path, mut store) = load_auth_session_store(&app)?;
    clear_auth_session(&mut store, username.as_deref())?;
    // Keep an encrypted empty/username-only store so a later launch has one
    // authoritative DPAPI source and never needs another credential backend.
    persist_session_store(&path, &store)
}

#[tauri::command]
fn deactivate_auth_state(
    app: tauri::AppHandle,
    session_lock: tauri::State<'_, AuthSessionLock>,
) -> Result<(), String> {
    let _guard = lock_auth_session(&session_lock)?;
    let (path, mut store) = load_auth_session_store(&app)?;
    store.active_username = None;
    persist_session_store(&path, &store)
}

#[tauri::command]
fn remove_auth_account(
    app: tauri::AppHandle,
    username: String,
    session_lock: tauri::State<'_, AuthSessionLock>,
) -> Result<(), String> {
    let _guard = lock_auth_session(&session_lock)?;
    let (path, mut store) = load_auth_session_store(&app)?;
    remove_auth_account_record(&mut store, &username)?;
    persist_session_store(&path, &store)
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

fn is_task_report_copy_filename(filename: &str, task_id: u64) -> bool {
    let prefix = format!("task-{task_id}-");
    let Some(suffix) = filename.strip_prefix(&prefix) else {
        return false;
    };
    let Some(timestamp) = suffix.strip_suffix(".md") else {
        return false;
    };

    !timestamp.is_empty()
        && timestamp
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// Deletes only application-managed, single-task Markdown copies in the fixed
/// Documents\\Focus Task\\Reports directory. No caller-provided paths and no
/// recursive traversal are accepted here.
fn delete_task_report_copies_from_directory(
    documents_dir: &Path,
    task_id: u64,
) -> Result<usize, String> {
    if task_id == 0 {
        return Err("任务编号无效，无法清理本机报告副本。".to_string());
    }

    let directory = report_export_directory(documents_dir);
    let entries = match fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(0),
        Err(err) => return Err(format!("无法读取本机报告目录：{err}")),
    };

    let mut deleted = 0;
    for entry in entries {
        let entry = entry.map_err(|err| format!("无法读取本机报告文件：{err}"))?;
        let file_type = entry
            .file_type()
            .map_err(|err| format!("无法检查本机报告文件：{err}"))?;
        // Do not follow symlinks or recurse into directories. The command only
        // deletes direct, ordinary Markdown files generated for this task.
        if !file_type.is_file() || file_type.is_symlink() {
            continue;
        }

        let filename = entry.file_name();
        let Some(filename) = filename.to_str() else {
            continue;
        };
        if !is_task_report_copy_filename(filename, task_id) {
            continue;
        }

        fs::remove_file(entry.path()).map_err(|err| format!("无法删除本机报告副本：{err}"))?;
        deleted += 1;
    }
    Ok(deleted)
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
fn delete_task_report_copies(app: tauri::AppHandle, task_id: u64) -> Result<usize, String> {
    delete_task_report_copies_from_directory(&documents_directory(&app)?, task_id)
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
        .manage(AuthSessionLock(Mutex::new(())))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            load_auth_state,
            list_auth_accounts,
            save_auth_state,
            restore_auth_account,
            clear_auth_state,
            deactivate_auth_state,
            remove_auth_account,
            open_notification_settings,
            send_native_notification,
            append_log,
            save_report_markdown,
            save_and_reveal_report_markdown,
            reveal_report_markdown,
            delete_task_report_copies
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

    #[test]
    fn task_report_copy_filename_only_matches_the_fixed_task_markdown_pattern() {
        assert!(is_task_report_copy_filename("task-42-snapshot.md", 42));
        assert!(is_task_report_copy_filename(
            "task-42-2026-07-30T10-42-00.md",
            42
        ));
        assert!(!is_task_report_copy_filename("task-42-.md", 42));
        assert!(!is_task_report_copy_filename("task-42-snapshot.md.bak", 42));
        assert!(!is_task_report_copy_filename("task-43-snapshot.md", 42));
        assert!(!is_task_report_copy_filename("task-42-..-outside.md", 42));
    }

    #[test]
    fn deleting_task_report_copies_is_non_recursive_and_keeps_other_files() {
        let root = std::env::temp_dir().join(format!(
            "focus-task-report-purge-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let directory = report_export_directory(&root);
        fs::create_dir_all(&directory).unwrap();

        let matching_first = directory.join("task-42-snapshot.md");
        let matching_second = directory.join("task-42-2026-07-30.md");
        let other_task = directory.join("task-43-snapshot.md");
        let non_markdown = directory.join("task-42-snapshot.md.bak");
        let nested = directory.join("task-42-nested.md");
        fs::write(&matching_first, "# 删除").unwrap();
        fs::write(&matching_second, "# 删除").unwrap();
        fs::write(&other_task, "# 保留").unwrap();
        fs::write(&non_markdown, "# 保留").unwrap();
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("inside.md"), "# 保留").unwrap();

        assert_eq!(
            delete_task_report_copies_from_directory(&root, 42).unwrap(),
            2
        );
        assert!(!matching_first.exists());
        assert!(!matching_second.exists());
        assert!(other_task.is_file());
        assert!(non_markdown.is_file());
        assert!(nested.is_dir());
        assert!(nested.join("inside.md").is_file());
        assert!(delete_task_report_copies_from_directory(&root, 0).is_err());

        fs::remove_dir_all(&root).unwrap();
    }
}

#[cfg(test)]
mod auth_state_tests {
    use super::*;

    fn state(username: &str, token: &str) -> AuthState {
        AuthState {
            username: username.to_string(),
            token: token.to_string(),
        }
    }

    fn empty_store() -> AuthSessionStore {
        AuthSessionStore::empty()
    }

    #[test]
    fn rejects_invalid_usernames_tokens_duplicates_and_inconsistent_active_account() {
        assert!(normalize_auth_state(&state("", "token")).is_err());
        assert!(normalize_auth_state(&state("alice\nadmin", "token")).is_err());
        assert!(normalize_auth_state(&state("alice", "")).is_err());
        assert!(
            normalize_auth_state(&state("alice", &"x".repeat(MAX_AUTH_TOKEN_BYTES + 1),)).is_err()
        );

        let duplicate = AuthSessionStore {
            version: AUTH_SESSION_STORE_VERSION,
            active_username: None,
            accounts: vec![
                AuthAccountRecord {
                    username: "Alice".to_string(),
                    token: Some("token-a".to_string()),
                    last_used: 1,
                },
                AuthAccountRecord {
                    username: "Alice".to_string(),
                    token: Some("token-b".to_string()),
                    last_used: 2,
                },
            ],
        };
        assert!(normalize_auth_session_store(duplicate).is_err());

        let case_sensitive_accounts = AuthSessionStore {
            version: AUTH_SESSION_STORE_VERSION,
            active_username: Some("Alice".to_string()),
            accounts: vec![
                AuthAccountRecord {
                    username: "Alice".to_string(),
                    token: Some("token-a".to_string()),
                    last_used: 1,
                },
                AuthAccountRecord {
                    username: "alice".to_string(),
                    token: Some("token-b".to_string()),
                    last_used: 2,
                },
            ],
        };
        assert!(normalize_auth_session_store(case_sensitive_accounts).is_ok());

        let mut missing_active = empty_store();
        missing_active.active_username = Some("nobody".to_string());
        assert!(normalize_auth_session_store(missing_active).is_err());
    }

    #[test]
    fn keeps_multiple_accounts_and_evicts_only_the_least_recently_used() {
        let mut store = empty_store();
        for index in 0..MAX_AUTH_ACCOUNTS {
            upsert_auth_session(
                &mut store,
                &state(&format!("user-{index}"), &format!("token-{index}")),
            )
            .unwrap();
        }
        upsert_auth_session(&mut store, &state("new-user", "new-token")).unwrap();

        assert_eq!(store.accounts.len(), MAX_AUTH_ACCOUNTS);
        assert!(!store
            .accounts
            .iter()
            .any(|account| account.username == "user-0"));
        assert!(store
            .accounts
            .iter()
            .any(|account| account.username == "new-user"));
        assert_eq!(
            active_auth_state(&store),
            Some(state("new-user", "new-token"))
        );
    }

    #[test]
    fn restoring_an_account_preserves_the_other_account_token() {
        let mut store = empty_store();
        upsert_auth_session(&mut store, &state("alice", "alice-token")).unwrap();
        upsert_auth_session(&mut store, &state("bob", "bob-token")).unwrap();

        assert_eq!(
            restore_saved_auth_account(&mut store, "alice").unwrap(),
            Some(state("alice", "alice-token"))
        );
        assert_eq!(
            active_auth_state(&store),
            Some(state("alice", "alice-token"))
        );
        assert_eq!(
            store
                .accounts
                .iter()
                .find(|account| account.username == "bob")
                .and_then(|account| account.token.as_deref()),
            Some("bob-token")
        );
    }

    #[test]
    fn clearing_a_session_keeps_the_username_and_only_affects_the_target_account() {
        let mut store = empty_store();
        upsert_auth_session(&mut store, &state("alice", "alice-token")).unwrap();
        upsert_auth_session(&mut store, &state("bob", "bob-token")).unwrap();

        clear_auth_session(&mut store, Some("alice")).unwrap();
        assert_eq!(active_auth_state(&store), Some(state("bob", "bob-token")));
        assert_eq!(
            store
                .accounts
                .iter()
                .find(|account| account.username == "alice")
                .and_then(|account| account.token.as_deref()),
            None
        );
        assert!(store
            .accounts
            .iter()
            .any(|account| account.username == "alice"));

        remove_auth_account_record(&mut store, "alice").unwrap();
        assert!(!store
            .accounts
            .iter()
            .any(|account| account.username == "alice"));
        assert_eq!(active_auth_state(&store), Some(state("bob", "bob-token")));
    }

    #[test]
    fn account_summaries_never_serialize_a_token() {
        let mut store = empty_store();
        upsert_auth_session(&mut store, &state("alice", "private-token")).unwrap();

        let summaries = auth_account_summaries(&store);
        let serialized = serde_json::to_string(&summaries).unwrap();
        assert_eq!(summaries.len(), 1);
        assert!(summaries[0].has_session);
        assert!(summaries[0].is_active);
        assert!(!serialized.contains("private-token"));
        assert!(!serialized.contains("token"));
    }

    #[cfg(target_os = "windows")]
    fn auth_test_path(label: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "focus-task-auth-{label}-{}-{nonce}.dpapi",
            std::process::id()
        ))
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn dpapi_round_trips_a_valid_store() {
        let mut store = empty_store();
        upsert_auth_session(&mut store, &state("alice", "service-jwt")).unwrap();

        let encoded = encode_auth_session_store(&store).unwrap();
        assert!(encoded.starts_with(AUTH_SESSION_MAGIC));
        assert_eq!(decode_auth_session_store(&encoded).unwrap(), store);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn corrupt_vault_fails_closed_but_a_fresh_login_can_replace_it() {
        let path = auth_test_path("corrupt");
        let _ = fs::remove_file(&path);
        fs::write(&path, b"not-a-dpapi-vault").unwrap();

        assert!(read_auth_session_store(&path).is_err());
        let mut replacement = session_store_for_authenticated_save(&path);
        assert_eq!(replacement, empty_store());
        upsert_auth_session(&mut replacement, &state("alice", "fresh-token")).unwrap();
        write_auth_session_store(&path, &replacement).unwrap();
        assert_eq!(read_auth_session_store(&path).unwrap(), Some(replacement));

        fs::remove_file(path).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn named_mutex_can_be_reacquired_after_the_previous_guard_drops() {
        assert_eq!(AUTH_SESSION_MUTEX_NAME, r"Local\FocusTaskAuthSessionV1");
        let first = CrossProcessAuthSessionLock::acquire().unwrap();
        drop(first);
        CrossProcessAuthSessionLock::acquire().unwrap();
    }
}
