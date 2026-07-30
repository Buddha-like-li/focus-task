import { invoke } from '@tauri-apps/api/core'
import { appLogger } from '@/composables/useAppLogger'
import { isTauriRuntime } from '@/utils/platform'

const TOKEN_KEY = 'focus-task-token'
const USERNAME_KEY = 'focus-task-username'
const REMEMBERED_USERNAME_KEY = 'focus-task-remembered-username'

export interface AuthState {
  token: string
  username: string
}

export interface AuthAccount {
  username: string
  hasSession: boolean
  isActive: boolean
}

const EMPTY_AUTH_STATE: AuthState = { token: '', username: '' }

function loadBrowserAuthState(): AuthState {
  return {
    token: localStorage.getItem(TOKEN_KEY) || '',
    username: localStorage.getItem(USERNAME_KEY) || '',
  }
}

function saveBrowserAuthState(state: AuthState) {
  localStorage.setItem(TOKEN_KEY, state.token)
  localStorage.setItem(USERNAME_KEY, state.username)
  if (state.username) localStorage.setItem(REMEMBERED_USERNAME_KEY, state.username)
}

function clearBrowserAuthState() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
}

function clearTauriLegacyStorage() {
  // The retired WebView storage must never remain a bearer-token fallback in
  // the desktop app. Usernames are kept with the encrypted native account
  // index rather than in browser storage as well.
  clearBrowserAuthState()
  localStorage.removeItem(REMEMBERED_USERNAME_KEY)
}

function browserAccounts(): AuthAccount[] {
  const state = loadBrowserAuthState()
  const rememberedUsername = loadRememberedUsername()
  const usernames = [state.username, rememberedUsername]
    .map(username => username.trim())
    .filter((username, index, values) => !!username && values.indexOf(username) === index)

  return usernames.map(username => ({
    username,
    hasSession: username === state.username && !!state.token,
    isActive: username === state.username && !!state.token,
  }))
}

function normalizeAccounts(accounts: AuthAccount[] | null | undefined): AuthAccount[] {
  if (!Array.isArray(accounts)) return []

  const seen = new Set<string>()
  return accounts.flatMap((account) => {
    const username = typeof account?.username === 'string' ? account.username.trim() : ''
    if (!username || seen.has(username)) return []
    seen.add(username)
    return [{
      username,
      hasSession: account.hasSession === true,
      isActive: account.isActive === true,
    }]
  })
}

export async function loadAuthState(): Promise<AuthState> {
  if (!isTauriRuntime()) return loadBrowserAuthState()

  try {
    const state = await invoke<AuthState | null>('load_auth_state')
    if (state?.token && state.username) return state
    return EMPTY_AUTH_STATE
  } catch (error) {
    // Native details stay in frontend.log; this error is deliberately safe for
    // the login page and never includes a token or operating-system path.
    appLogger.warn('[认证] 无法恢复本机保存的登录状态', error)
    throw new Error('无法读取已保存的登录状态，请稍后重试。')
  } finally {
    clearTauriLegacyStorage()
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
    // Callers decide whether a persistence failure can be non-fatal for the
    // current in-memory session. Never log the state because it includes JWT.
    appLogger.error('[认证] 无法保存本机登录状态', error)
    throw new Error('无法保存登录状态，请稍后重试。')
  } finally {
    clearTauriLegacyStorage()
  }
}

export async function listAuthAccounts(): Promise<AuthAccount[]> {
  if (!isTauriRuntime()) return browserAccounts()

  try {
    const accounts = await invoke<AuthAccount[]>('list_auth_accounts')
    return normalizeAccounts(accounts)
  } catch (error) {
    appLogger.warn('[认证] 无法读取本机记住的账号', error)
    throw new Error('无法读取已记住的账号，请稍后重试。')
  } finally {
    clearTauriLegacyStorage()
  }
}

export async function restoreAuthAccount(username: string): Promise<AuthState | null> {
  const normalizedUsername = username.trim()
  if (!normalizedUsername) return null

  if (!isTauriRuntime()) {
    const state = loadBrowserAuthState()
    return state.username === normalizedUsername && state.token ? state : null
  }

  try {
    const state = await invoke<AuthState | null>('restore_auth_account', {
      username: normalizedUsername,
    })
    if (state?.token && state.username) return state
    return null
  } catch (error) {
    appLogger.warn('[认证] 无法恢复所选账号的登录状态', error)
    throw new Error('无法恢复所选账号的登录状态，请稍后重试。')
  } finally {
    clearTauriLegacyStorage()
  }
}

/** Remove a saved session token but retain the account name for re-login. */
export async function clearAuthState(username?: string): Promise<void> {
  const normalizedUsername = username?.trim()
  if (!isTauriRuntime()) {
    const current = loadBrowserAuthState()
    if (!normalizedUsername || current.username === normalizedUsername) {
      clearBrowserAuthState()
    }
    if (normalizedUsername) saveRememberedUsername(normalizedUsername)
    return
  }

  try {
    await invoke('clear_auth_state', normalizedUsername ? { username: normalizedUsername } : {})
  } catch (error) {
    appLogger.error('[认证] 无法清除本机登录状态', error)
    throw new Error('无法清除登录状态，请稍后重试。')
  } finally {
    clearTauriLegacyStorage()
  }
}

/** Leave the active session without deleting its encrypted saved credential. */
export async function deactivateAuthState(): Promise<void> {
  if (!isTauriRuntime()) {
    clearBrowserAuthState()
    return
  }

  try {
    await invoke('deactivate_auth_state')
  } catch (error) {
    appLogger.error('[认证] 无法切换本机账号', error)
    throw new Error('无法切换账号，请稍后重试。')
  } finally {
    clearTauriLegacyStorage()
  }
}

/** Remove an account name and its encrypted saved session entirely. */
export async function removeAuthAccount(username: string): Promise<void> {
  const normalizedUsername = username.trim()
  if (!normalizedUsername) return

  if (!isTauriRuntime()) {
    const current = loadBrowserAuthState()
    if (current.username === normalizedUsername) clearBrowserAuthState()
    if (loadRememberedUsername() === normalizedUsername) clearRememberedUsername()
    return
  }

  try {
    await invoke('remove_auth_account', { username: normalizedUsername })
  } catch (error) {
    appLogger.error('[认证] 无法移除本机记住的账号', error)
    throw new Error('无法移除已记住的账号，请稍后重试。')
  } finally {
    clearTauriLegacyStorage()
  }
}

// Browser development mode keeps its legacy username-only convenience. Tauri
// stores account metadata in the encrypted native auth state instead.
export function loadRememberedUsername(): string {
  if (isTauriRuntime()) return ''
  return localStorage.getItem(REMEMBERED_USERNAME_KEY) || ''
}

export function saveRememberedUsername(username: string) {
  if (isTauriRuntime()) {
    localStorage.removeItem(REMEMBERED_USERNAME_KEY)
    return
  }
  localStorage.setItem(REMEMBERED_USERNAME_KEY, username)
}

export function clearRememberedUsername() {
  localStorage.removeItem(REMEMBERED_USERNAME_KEY)
}
