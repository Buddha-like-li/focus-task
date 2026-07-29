import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '@/api'
import { clearAuthState, loadAuthState, saveAuthState } from '@/utils/secureStorage'

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
  // Credential Manager failures are not ordinary signed-out states. Keep a
  // safe actionable message for LoginView without exposing native details.
  const restoreError = ref('')

  async function init() {
    ready.value = false
    restoreError.value = ''
    let state
    try {
      state = await loadAuthState()
    } catch {
      resetSession()
      restoreError.value = '无法读取已保存的登录状态，请检查 Windows 凭据管理器后重试。'
      ready.value = true
      return
    }
    token.value = state.token
    username.value = state.username
    isLoggedIn.value = !!state.token
    // Sync the in-memory token so the API layer uses it for immediate requests.
    api.setAuthToken(state.token || null)
    // Validate a stored session before route guards open the app. A token from
    // the retired embedded service is invalid for the local service and must
    // lead to LoginView rather than an authenticated-but-empty shell.
    if (state.token) {
      await refreshIdentity()
    }
    ready.value = true
  }

  /** Pull the current user's id and team role after session validation. */
  async function refreshIdentity(): Promise<boolean> {
    try {
      const me = await api.getMe()
      userId.value = me.id
      username.value = me.username
    } catch (error) {
      userId.value = null
      if (api.isAuthenticationFailure(error)) {
        await clearSession()
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
      role.value = teamStore.currentRole
    } catch {
      role.value = ''
    }
    return true
  }

  async function register(user: string, password: string) {
    const res = await api.register(user, password)
    await login(user, password)
    return res
  }

  async function login(user: string, password: string) {
    restoreError.value = ''
    const res = await api.login(user, password)
    // Tauri persistence is intentionally keyring-only. Do not make the
    // authenticated in-memory state visible until the token is stored safely.
    await saveAuthState({ token: res.accessToken, username: user })
    token.value = res.accessToken
    username.value = user
    isLoggedIn.value = true
    // Set the in-memory token BEFORE saving to storage, so the very next
    // request (fetchTasks on AppLayout mount) uses the fresh token.
    api.setAuthToken(res.accessToken)
    // P6: populate userId + role right after login so the UI can gate on them.
    if (!await refreshIdentity()) {
      throw new Error('登录状态验证失败，请重新登录。')
    }
  }

  async function logout() {
    // A user-initiated logout must clear the persisted token first. If
    // Credential Manager rejects the deletion, leave the active session in
    // place and show the actionable error instead of making account switching
    // appear successful only until the next launch.
    await clearAuthState()
    resetSession()
    restoreError.value = ''
    await clearAccountScopedState()
  }

  /**
   * End an unusable session after the local service rejects its token.
   * Unlike a user-requested logout, a keyring cleanup failure must not leave
   * the application on an authenticated screen with an expired token.
   */
  async function invalidateSession() {
    await clearSession()
  }

  function clearRestoreError() {
    restoreError.value = ''
  }

  function resetSession() {
    token.value = ''
    username.value = ''
    userId.value = null
    role.value = ''
    isLoggedIn.value = false
    api.setAuthToken(null)
  }

  async function clearSession() {
    resetSession()
    restoreError.value = ''
    await clearAccountScopedState()
    try {
      await clearAuthState()
    } catch {
      // An expired or invalid token must not keep the UI authenticated. The
      // secure-storage layer has already recorded the native failure; retry
      // cleanup on the next app start if Windows Credential Manager recovers.
    }
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
    restoreError,
    init,
    register,
    login,
    logout,
    invalidateSession,
    clearRestoreError,
    refreshIdentity,
  }
})
