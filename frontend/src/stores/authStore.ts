import { defineStore } from 'pinia'
import { readonly, ref } from 'vue'
import * as api from '@/api'
import {
  type AuthAccount,
  clearAuthState,
  deactivateAuthState,
  listAuthAccounts,
  loadAuthState,
  removeAuthAccount,
  restoreAuthAccount,
  saveAuthState,
} from '@/utils/secureStorage'

const SESSION_SAVE_WARNING = '本次登录未能在本机记住，关闭应用后需要重新登录。'

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const username = ref('')
  // P6: the numeric user id (from getMe) and the team role (from teamStore).
  // userId is needed everywhere the frontend decides "is this task mine" or
  // "can I transfer it". role drives the comment badge colour.
  const userId = ref<number | null>(null)
  const role = ref<string>('')
  const isLoggedIn = ref(!!token.value)
  const ready = ref(false)
  const sessionRevision = ref(0)
  const restoreError = ref('')
  const sessionWarning = ref('')
  const rememberedAccounts = ref<AuthAccount[]>([])
  // Keep a username after an expired session is deleted, so LoginView can
  // prefill it and ask only for a new password.
  const loginUsernameHint = ref('')

  let accountOperationRevision = 0
  let accountListRequestRevision = 0
  let nativeAuthOperation: Promise<void> = Promise.resolve()

  function beginAccountOperation(): number {
    accountOperationRevision += 1
    return accountOperationRevision
  }

  function isCurrentAccountOperation(operation: number): boolean {
    return operation === accountOperationRevision
  }

  function queueNativeAuthOperation<T>(operation: () => Promise<T>): Promise<T> {
    const next = nativeAuthOperation.then(operation, operation)
    nativeAuthOperation = next.then(() => undefined, () => undefined)
    return next
  }

  async function init() {
    const operation = beginAccountOperation()
    ready.value = false
    restoreError.value = ''
    sessionWarning.value = ''
    let state: { token: string; username: string }
    try {
      state = await loadAuthState()
    } catch {
      if (!isCurrentAccountOperation(operation)) return
      resetSession()
      restoreError.value = '无法读取已保存的登录状态，请稍后重试。'
      ready.value = true
      void refreshRememberedAccounts().catch(() => undefined)
      return
    }

    if (!isCurrentAccountOperation(operation)) return
    activateSession(state)
    if (state.username) loginUsernameHint.value = state.username

    if (state.token) {
      await refreshIdentity(currentSessionContext())
    }
    // A 401 during refreshIdentity intentionally starts a new operation while
    // it clears the expired account. Bootstrap still has to finish so the
    // router can take the user to LoginView.
    if (!isCurrentAccountOperation(operation)) {
      ready.value = true
      return
    }

    await refreshRememberedAccounts().catch(() => undefined)
    ready.value = true
  }

  /** Pull the current user's id and team role after session validation. */
  async function refreshIdentity(context: api.AuthRequestContext = currentSessionContext()): Promise<boolean> {
    try {
      const me = await api.getMe()
      if (!isCurrentSession(context)) return false
      userId.value = me.id
      username.value = me.username
      loginUsernameHint.value = me.username
    } catch (error) {
      if (!isCurrentSession(context)) return false
      userId.value = null
      if (api.isAuthenticationFailure(error)) {
        await invalidateSessionIfCurrent(context)
        return false
      }

      // Preserve a valid saved session while the local service is temporarily
      // unavailable. AppLayout will display the connectivity error after load.
      return true
    }

    // Fetch the team to populate role. Import lazily to avoid a circular
    // import (teamStore imports authStore for the current user id).
    try {
      const { useTeamStore } = await import('@/stores/teamStore')
      const teamStore = useTeamStore()
      await teamStore.fetchTeam()
      if (!isCurrentSession(context)) return false
      role.value = teamStore.currentRole
    } catch {
      if (!isCurrentSession(context)) return false
      role.value = ''
    }
    return true
  }

  async function register(user: string, password: string) {
    const res = await api.register(user, password)
    await login(user, password)
    return res
  }

  /**
   * Establish the in-memory session before attempting native persistence.
   * A local DPAPI/keyring failure must not turn a verified service login into
   * a false failure for the current running application.
   */
  async function login(user: string, password: string): Promise<boolean> {
    const normalizedUsername = user.trim()
    const operation = beginAccountOperation()
    restoreError.value = ''
    sessionWarning.value = ''

    const res = await api.login(normalizedUsername, password)
    if (!isCurrentAccountOperation(operation)) {
      throw new Error('登录操作已被新的账号操作取消，请重试。')
    }

    activateSession({ token: res.accessToken, username: normalizedUsername })
    loginUsernameHint.value = normalizedUsername
    const context = currentSessionContext()

    if (!await refreshIdentity(context)) {
      throw new Error('登录状态验证失败，请重新登录。')
    }
    if (!isCurrentAccountOperation(operation) || !isCurrentSession(context)) {
      throw new Error('登录操作已被新的账号操作取消，请重试。')
    }

    try {
      await queueNativeAuthOperation(() => saveAuthState({
        token: res.accessToken,
        username: normalizedUsername,
      }))
    } catch {
      if (isCurrentAccountOperation(operation) && isCurrentSession(context)) {
        sessionWarning.value = SESSION_SAVE_WARNING
      }
      // The verified in-memory session remains usable until this app closes.
      return true
    }

    if (isCurrentAccountOperation(operation) && isCurrentSession(context)) {
      await refreshRememberedAccounts().catch(() => undefined)
    }
    return true
  }

  /** Restore a saved account selected from LoginView without needing a password. */
  async function restoreAccount(usernameToRestore: string): Promise<boolean> {
    const normalizedUsername = usernameToRestore.trim()
    if (!normalizedUsername) return false

    const operation = beginAccountOperation()
    const startingSessionRevision = sessionRevision.value
    restoreError.value = ''
    sessionWarning.value = ''
    loginUsernameHint.value = normalizedUsername

    const state = await queueNativeAuthOperation(() => restoreAuthAccount(normalizedUsername))
    if (!isCurrentAccountOperation(operation) || sessionRevision.value !== startingSessionRevision) {
      return false
    }

    if (!state?.token) {
      await refreshRememberedAccounts().catch(() => undefined)
      return false
    }

    activateSession({ token: state.token, username: state.username || normalizedUsername })
    const context = currentSessionContext()
    const restored = await refreshIdentity(context)
    if (!restored || !isCurrentAccountOperation(operation) || !isCurrentSession(context)) {
      loginUsernameHint.value = normalizedUsername
      await refreshRememberedAccounts().catch(() => undefined)
      return false
    }

    await refreshRememberedAccounts().catch(() => undefined)
    return true
  }

  /** Leave the current account for LoginView while retaining its saved session. */
  async function switchAccount(): Promise<boolean> {
    const context = currentSessionContext()
    const activeUsername = username.value
    if (!context.token || !activeUsername) return false

    const operation = beginAccountOperation()
    await queueNativeAuthOperation(() => deactivateAuthState())
    if (!isCurrentAccountOperation(operation) || !isCurrentSession(context)) return false

    resetSession()
    loginUsernameHint.value = activeUsername
    restoreError.value = ''
    sessionWarning.value = ''
    await clearAccountScopedState()
    await refreshRememberedAccounts().catch(() => undefined)
    return true
  }

  /** Clear the current account's saved token but preserve its username. */
  async function logout(): Promise<boolean> {
    const context = currentSessionContext()
    const activeUsername = username.value
    if (!activeUsername) return false

    const operation = beginAccountOperation()
    await queueNativeAuthOperation(() => clearAuthState(activeUsername))
    if (!isCurrentAccountOperation(operation) || !isCurrentSession(context)) return false

    resetSession()
    loginUsernameHint.value = activeUsername
    restoreError.value = ''
    sessionWarning.value = ''
    await clearAccountScopedState()
    await refreshRememberedAccounts().catch(() => undefined)
    return true
  }

  /** Remove the current account name and its saved session from this device. */
  async function removeCurrentAccount(): Promise<boolean> {
    const context = currentSessionContext()
    const activeUsername = username.value
    if (!activeUsername) return false

    const operation = beginAccountOperation()
    await queueNativeAuthOperation(() => removeAuthAccount(activeUsername))
    if (!isCurrentAccountOperation(operation) || !isCurrentSession(context)) return false

    resetSession()
    loginUsernameHint.value = ''
    restoreError.value = ''
    sessionWarning.value = ''
    await clearAccountScopedState()
    await refreshRememberedAccounts().catch(() => undefined)
    return true
  }

  /** Remove an inactive remembered account from the login chooser. */
  async function removeRememberedAccount(usernameToRemove: string): Promise<boolean> {
    const normalizedUsername = usernameToRemove.trim()
    if (!normalizedUsername) return false
    if (normalizedUsername === username.value && isLoggedIn.value) {
      return removeCurrentAccount()
    }

    const operation = beginAccountOperation()
    await queueNativeAuthOperation(() => removeAuthAccount(normalizedUsername))
    if (!isCurrentAccountOperation(operation)) return false

    if (loginUsernameHint.value === normalizedUsername) loginUsernameHint.value = ''
    await refreshRememberedAccounts().catch(() => undefined)
    return true
  }

  /**
   * End an unusable session after the local service rejects its token. A 401
   * clears only that account's token and leaves its username ready for login.
   */
  async function invalidateSession() {
    const context = currentSessionContext()
    if (!context.token) return
    await invalidateSessionIfCurrent(context)
  }

  /** Ignore a delayed 401 belonging to an account that has already changed. */
  async function invalidateSessionIfCurrent(context: api.AuthRequestContext): Promise<boolean> {
    if (!isCurrentSession(context)) return false
    beginAccountOperation()
    await clearSession(username.value)
    return true
  }

  async function refreshRememberedAccounts(): Promise<AuthAccount[]> {
    const request = ++accountListRequestRevision
    const accounts = await listAuthAccounts()
    if (request === accountListRequestRevision) {
      rememberedAccounts.value = accounts
    }
    return accounts
  }

  function clearRestoreError() {
    restoreError.value = ''
  }

  function resetSession() {
    sessionRevision.value += 1
    token.value = ''
    username.value = ''
    userId.value = null
    role.value = ''
    isLoggedIn.value = false
    api.setAuthToken(null, sessionRevision.value)
  }

  function activateSession(state: { token: string; username: string }) {
    sessionRevision.value += 1
    token.value = state.token
    username.value = state.username
    isLoggedIn.value = !!state.token
    // Bind every API request to this exact session before any protected call.
    api.setAuthToken(state.token || null, sessionRevision.value)
  }

  function currentSessionContext(): api.AuthRequestContext {
    return { token: token.value, sessionRevision: sessionRevision.value }
  }

  function isCurrentSession(context: api.AuthRequestContext): boolean {
    return !!context.token
      && context.sessionRevision === sessionRevision.value
      && context.token === token.value
  }

  async function clearSession(usernameToPreserve: string) {
    const preservedUsername = usernameToPreserve.trim()
    resetSession()
    loginUsernameHint.value = preservedUsername
    restoreError.value = ''
    sessionWarning.value = ''
    await clearAccountScopedState()
    try {
      await queueNativeAuthOperation(() => clearAuthState(preservedUsername || undefined))
    } catch {
      // An expired token must not keep the UI authenticated. The storage layer
      // has already recorded the native failure; a later app start can retry.
    }
    await refreshRememberedAccounts().catch(() => undefined)
  }

  async function clearAccountScopedState() {
    // Keep these imports lazy: teamStore depends on authStore to derive the
    // active member role, so importing it at module evaluation time creates a
    // circular dependency. All stores share the active Pinia instance.
    const [{ useTaskStore }, { useRequirementStore }, { useTeamStore }] = await Promise.all([
      import('@/stores/taskStore'),
      import('@/stores/requirementStore'),
      import('@/stores/teamStore'),
    ])
    useTaskStore().clearSessionState()
    useRequirementStore().clearSessionState()
    useTeamStore().clearSessionState()
  }

  return {
    token,
    username,
    userId,
    role,
    isLoggedIn,
    ready,
    sessionRevision: readonly(sessionRevision),
    restoreError,
    sessionWarning,
    rememberedAccounts,
    loginUsernameHint,
    init,
    register,
    login,
    restoreAccount,
    switchAccount,
    logout,
    removeCurrentAccount,
    removeRememberedAccount,
    invalidateSession,
    invalidateSessionIfCurrent,
    refreshRememberedAccounts,
    clearRestoreError,
    refreshIdentity,
  }
})
