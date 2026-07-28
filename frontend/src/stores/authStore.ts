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

  async function init() {
    ready.value = false
    const state = await loadAuthState()
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
    await refreshIdentity()
  }

  async function logout() {
    await clearSession()
  }

  async function clearSession() {
    token.value = ''
    username.value = ''
    userId.value = null
    role.value = ''
    isLoggedIn.value = false
    api.setAuthToken(null)
    await clearAuthState()
  }

  return { token, username, userId, role, isLoggedIn, ready, init, register, login, logout, refreshIdentity }
})
