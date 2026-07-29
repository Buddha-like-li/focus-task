import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '@/api'
import type { Team, TeamMember } from '@/api'
import type { Task } from '@/stores/taskStore'
import { useAuthStore } from '@/stores/authStore'

/**
 * P6 team collaboration store.
 *
 * Holds the single global team (or null when none exists) and its active
 * members. The current user's role is derived from the member list so the
 * UI can render comment badges / gate manager-only actions.
 *
 * Mirrors the requirementStore pattern: a small fetchAll-style action that
 * the app shell (AppLayout) calls on mount, plus granular actions for the
 * SettingsView team card.
 */
export const useTeamStore = defineStore('team', () => {
  const team = ref<Team | null>(null)
  const members = ref<TeamMember[]>([])
  const loading = ref(false)
  let sessionRevision = 0

  const hasTeam = computed(() => !!team.value)
  const isInTeam = computed(() => {
    const auth = useAuthStore()
    return !!team.value && !!members.value.find(m => m.userId === auth.userId)
  })

  /** The current user's active TeamMember row, or null. */
  const currentMember = computed<TeamMember | null>(() => {
    const auth = useAuthStore()
    if (!auth.userId) return null
    return members.value.find(m => m.userId === auth.userId) ?? null
  })

  /** The current user's role ('' when not in a team). */
  const currentRole = computed<string>(() => currentMember.value?.role ?? '')

  const isManager = computed(() => currentRole.value === '管理')

  /** Look up a member's role by user id ('' if not found). */
  function roleOf(userId: number | null | undefined): string {
    if (!userId) return ''
    return members.value.find(m => m.userId === userId)?.role ?? ''
  }

  /** Look up a member's username by user id. */
  function usernameOf(userId: number | null | undefined): string {
    if (!userId) return ''
    return members.value.find(m => m.userId === userId)?.username ?? ''
  }

  /** Fetch the single global team + active members. No-op-safe on 404. */
  async function fetchTeam() {
    const requestRevision = sessionRevision
    loading.value = true
    try {
      const t = await api.getTeam()
      if (requestRevision !== sessionRevision) return
      team.value = t
      members.value = t ? t.members : []
    } catch {
      if (requestRevision !== sessionRevision) return
      team.value = null
      members.value = []
    } finally {
      if (requestRevision === sessionRevision) loading.value = false
    }
  }

  async function createTeam(name: string) {
    const requestRevision = sessionRevision
    const t = await api.createTeam(name)
    if (!isCurrentSession(requestRevision)) return t
    team.value = t
    members.value = t.members
    // Creating a team makes the creator a manager - refresh the auth role.
    const auth = useAuthStore()
    auth.role = '管理'
    return t
  }

  async function updateTeamName(name: string) {
    const requestRevision = sessionRevision
    if (!team.value) return
    const t = await api.updateTeam(name)
    if (!isCurrentSession(requestRevision)) return
    team.value = t
    members.value = t.members
  }

  async function dissolveTeam() {
    const requestRevision = sessionRevision
    await api.dissolveTeam()
    if (!isCurrentSession(requestRevision)) return
    team.value = null
    members.value = []
    const auth = useAuthStore()
    auth.role = ''
  }

  async function inviteMember(username: string, role: string) {
    const requestRevision = sessionRevision
    const m = await api.inviteTeamMember(username, role)
    if (!isCurrentSession(requestRevision)) return m
    members.value = [...members.value, m]
    return m
  }

  async function updateMemberRole(userId: number, role: string) {
    const requestRevision = sessionRevision
    await api.updateTeamMemberRole(userId, role)
    if (!isCurrentSession(requestRevision)) return
    members.value = members.value.map(m =>
      m.userId === userId ? { ...m, role } : m
    )
    const auth = useAuthStore()
    if (userId === auth.userId) auth.role = role
  }

  async function removeMember(userId: number) {
    const requestRevision = sessionRevision
    await api.removeTeamMember(userId)
    if (!isCurrentSession(requestRevision)) return
    members.value = members.value.filter(m => m.userId !== userId)
    const auth = useAuthStore()
    if (userId === auth.userId) auth.role = ''
  }

  /** Remove team data from the prior account before another user signs in. */
  function clearSessionState() {
    sessionRevision += 1
    team.value = null
    members.value = []
    loading.value = false
  }

  function isCurrentSession(requestRevision: number): boolean {
    return requestRevision === sessionRevision
  }

  /** Read-only listing of a teammate's tasks (P6-3 队友任务视图). */
  async function fetchMemberTasks(userId: number, filters: api.MemberTasksFilters = {}): Promise<Task[]> {
    const requestRevision = sessionRevision
    const tasks = await api.listMemberTasks(userId, filters)
    return isCurrentSession(requestRevision) ? tasks : []
  }

  return {
    team,
    members,
    loading,
    hasTeam,
    isInTeam,
    currentMember,
    currentRole,
    isManager,
    roleOf,
    usernameOf,
    fetchTeam,
    createTeam,
    updateTeamName,
    dissolveTeam,
    inviteMember,
    updateMemberRole,
    removeMember,
    clearSessionState,
    fetchMemberTasks,
  }
})
