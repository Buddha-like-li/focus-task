import { invoke } from '@tauri-apps/api/core'
import { appLogger } from '@/composables/useAppLogger'
import { isTauriRuntime } from '@/utils/platform'

const TOKEN_KEY = 'focus-task-token'
const USERNAME_KEY = 'focus-task-username'
const REMEMBERED_USERNAME_KEY = 'focus-task-remembered-username'

interface AuthState {
  token: string
  username: string
}

function loadBrowserAuthState(): AuthState {
  return {
    token: localStorage.getItem(TOKEN_KEY) || '',
    username: localStorage.getItem(USERNAME_KEY) || '',
  }
}

function saveBrowserAuthState(state: AuthState) {
  localStorage.setItem(TOKEN_KEY, state.token)
  localStorage.setItem(USERNAME_KEY, state.username)
}

function clearBrowserAuthState() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
}

export async function loadAuthState(): Promise<AuthState> {
  if (!isTauriRuntime()) return loadBrowserAuthState()

  try {
    const state = await invoke<AuthState | null>('load_auth_state')
    if (state && state.token) return state
    return { token: '', username: '' }
  } catch (error) {
    // Do not confuse an unavailable Credential Manager with an intentional
    // signed-out state. Startup can still show LoginView, while frontend.log
    // records why the persisted session could not be restored.
    appLogger.warn('[认证] 无法从 Windows 凭据管理器恢复登录状态', error)
    return { token: '', username: '' }
  } finally {
    // Remove legacy WebView tokens after moving to Credential Manager. Tauri
    // never falls back to browser storage for bearer credentials.
    clearBrowserAuthState()
  }
}

export async function saveAuthState(state: AuthState): Promise<void> {
  if (!isTauriRuntime()) {
    saveBrowserAuthState(state)
    return
  }

  try {
    await invoke('save_auth_state', { state })
  } catch (error) {
    // LoginView surfaces this message and leaves the in-memory session unset.
    // The error detail is retained only in frontend.log; never log the token.
    appLogger.error('[认证] 无法写入 Windows 凭据管理器', error)
    throw new Error('无法保存登录状态，请检查 Windows 凭据管理器后重试。')
  } finally {
    // A keyring failure must not leave a usable bearer token in the WebView
    // store. The caller receives the error and keeps the user logged out.
    clearBrowserAuthState()
  }
}

export async function clearAuthState(): Promise<void> {
  clearBrowserAuthState()
  if (!isTauriRuntime()) return

  try {
    await invoke('clear_auth_state')
  } catch (error) {
    // A manual logout keeps the current session intact when this rejection is
    // rethrown by authStore, so the user can retry instead of reviving an old
    // account after the next app launch.
    appLogger.error('[认证] 无法清除 Windows 凭据管理器中的登录状态', error)
    throw new Error('无法清除登录状态，请检查 Windows 凭据管理器后重试。')
  }
}

export function loadRememberedUsername(): string {
  return localStorage.getItem(REMEMBERED_USERNAME_KEY) || ''
}

export function saveRememberedUsername(username: string) {
  localStorage.setItem(REMEMBERED_USERNAME_KEY, username)
}

export function clearRememberedUsername() {
  localStorage.removeItem(REMEMBERED_USERNAME_KEY)
}
