<template>
  <div class="settings-page">
    <section class="settings-topbar">
      <div class="settings-heading">
        <span class="settings-eyebrow">设置</span>
        <h1>提醒与时间偏好</h1>
        <p>统一控制提醒节奏、轮询频率和新任务默认时间。</p>
      </div>
    </section>

    <section class="settings-grid">
      <article class="settings-card">
        <div class="card-head">
          <div>
            <span class="card-kicker">提醒策略</span>
            <h2>默认提醒时间</h2>
          </div>
        </div>

        <div class="field-block">
          <label>开始/截止提醒</label>
          <div class="segment-control">
            <button
              v-for="option in leadOptions"
              :key="option.value"
              class="segment-btn"
              :class="{ active: settings.state.reminderLeadMinutes === option.value }"
              @click="settings.update({ reminderLeadMinutes: option.value })"
            >
              {{ option.label }}
            </button>
          </div>
          <p class="field-note">当前：{{ settings.reminderLeadLabel }}</p>
        </div>

        <div class="field-block">
          <label>检查频率</label>
          <div class="segment-control narrow">
            <button
              v-for="option in intervalOptions"
              :key="option.value"
              class="segment-btn"
              :class="{ active: settings.state.notificationCheckIntervalSeconds === option.value }"
              @click="settings.update({ notificationCheckIntervalSeconds: option.value })"
            >
              {{ option.label }}
            </button>
          </div>
          <p class="field-note">应用运行期间按这个频率检查提醒。</p>
        </div>
      </article>

      <article class="settings-card">
        <div class="card-head">
          <div>
            <span class="card-kicker">默认值</span>
            <h2>新任务时间</h2>
          </div>
        </div>

        <div class="time-grid">
          <div class="field-block">
            <label>默认开始时间</label>
            <input
              type="time"
              :value="settings.state.defaultStartTime"
              @change="settings.update({ defaultStartTime: ($event.target as HTMLInputElement).value || '09:00' })"
            />
          </div>

          <div class="field-block">
            <label>默认截止时间</label>
            <input
              type="time"
              :value="settings.state.defaultDueTime"
              @change="settings.update({ defaultDueTime: ($event.target as HTMLInputElement).value || '18:00' })"
            />
          </div>
        </div>

        <p class="field-note">旧任务不会被强制改写，新的日期输入会优先用这里的默认时间。</p>
      </article>

      <article class="settings-card">
        <div class="card-head">
          <div>
            <span class="card-kicker">系统权限</span>
            <h2>通知权限</h2>
          </div>
          <span class="permission-badge" :class="settings.notificationPermission">
            {{ permissionLabel }}
          </span>
        </div>

          <div class="permission-panel">
          <p>{{ permissionHint }}</p>
          <div class="permission-actions">
            <button class="primary-btn" @click="handleNotificationAction">
              {{ settings.notificationActionLabel }}
            </button>
            <button class="secondary-btn" @click="sendTestNotification">发送测试通知</button>
            <button class="secondary-btn" @click="settings.refreshPermission()">刷新状态</button>
          </div>
        </div>
      </article>

      <article class="settings-card team-card">
        <div class="card-head">
          <div>
            <span class="card-kicker">协作</span>
            <h2>团队<span v-if="teamStore.hasTeam" class="team-name-inline">· {{ teamStore.team?.name }}</span></h2>
          </div>
          <button
            v-if="teamStore.hasTeam && teamStore.isManager && !editingName"
            class="secondary-btn"
            @click="startEditName"
          >修改</button>
          <div v-else-if="editingName" class="name-edit-row">
            <input
              v-model="editNameValue"
              type="text"
              class="name-edit-input"
              placeholder="团队名"
              @keyup.enter="saveEditName"
              @keyup.esc="cancelEditName"
            />
            <button class="primary-btn" @click="saveEditName">保存</button>
            <button class="secondary-btn" @click="cancelEditName">取消</button>
          </div>
        </div>

        <!-- 无团队：创建表单 -->
        <div v-if="!teamStore.hasTeam" class="field-block">
          <p class="field-note">还没有团队，创建一个开始协作。</p>
          <div class="invite-form">
            <input
              v-model="newTeamName"
              type="text"
              class="text-input"
              placeholder="团队名"
              @keyup.enter="handleCreateTeam"
            />
            <button class="primary-btn" :disabled="!newTeamName.trim()" @click="handleCreateTeam">创建团队</button>
          </div>
        </div>

        <!-- 有团队：成员列表 + 邀请 + 解散 -->
        <div v-else class="team-body">
          <div class="member-list">
            <div
              v-for="m in teamStore.members"
              :key="m.userId"
              class="member-row"
            >
              <span class="member-username">{{ m.username }}<span v-if="m.userId === auth.userId" class="member-self">（你）</span></span>
              <span class="role-badge" :class="roleClass(m.role)">{{ m.role }}</span>
              <span class="member-joined">{{ formatDate(m.joinedAt) }}</span>
              <div class="member-actions">
                <select
                  v-if="teamStore.isManager || m.userId === auth.userId"
                  class="role-select"
                  :value="m.role"
                  @change="onMemberRoleChange(m, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="开发">开发</option>
                  <option value="管理">管理</option>
                  <option value="测试">测试</option>
                </select>
                <button
                  v-if="teamStore.isManager && m.userId !== auth.userId"
                  class="danger-btn"
                  @click="handleRemoveMember(m)"
                >移除</button>
                <button
                  v-if="m.userId === auth.userId"
                  class="danger-btn"
                  @click="handleLeaveTeam"
                >退出团队</button>
              </div>
            </div>
          </div>

          <!-- 邀请成员 -->
          <div class="invite-form">
            <input
              v-model="inviteUsername"
              type="text"
              class="text-input"
              placeholder="输入登录用户名"
            />
            <select v-model="inviteRole" class="role-select">
              <option value="开发">开发</option>
              <option value="管理">管理</option>
              <option value="测试">测试</option>
            </select>
            <button class="primary-btn" :disabled="!inviteUsername.trim()" @click="handleInvite">邀请</button>
          </div>
          <p v-if="inviteError" class="field-note" style="color: oklch(58% 0.18 25)">{{ inviteError }}</p>

          <!-- 解散团队 -->
          <div v-if="teamStore.isManager" class="dissolve-row">
            <button class="danger-btn" @click="handleDissolve">解散团队</button>
          </div>
        </div>
      </article>

      <article class="settings-card account-card">
        <div class="card-head">
          <div>
            <span class="card-kicker">账号</span>
            <h2>当前登录</h2>
          </div>
        </div>
        <div class="account-body">
          <p class="account-username">{{ auth.username }}</p>
          <p class="field-note">退出后可使用其他账号登录，本地任务数据不会被删除。</p>
          <div class="permission-actions">
            <button class="danger-btn account-logout-btn" :disabled="loggingOut" @click="handleLogout">
              {{ loggingOut ? '正在退出…' : '退出登录' }}
            </button>
          </div>
          <p v-if="logoutError" class="field-note account-error" role="alert">{{ logoutError }}</p>
        </div>
      </article>

      <article class="settings-card">
        <div class="card-head">
          <div>
            <span class="card-kicker">关于</span>
            <h2>Focus Task</h2>
          </div>
          <span class="permission-badge default">v{{ appVersion }}</span>
        </div>
        <div class="field-block">
          <p class="field-note">当前桌面端版本。点击检查更新按钮可手动查询 GitHub Release。</p>
          <div class="permission-actions">
            <button class="primary-btn" :disabled="checkingUpdate || installingUpdate" @click="handleCheckUpdate">
              {{ checkingUpdate ? '检查中…' : '检查更新' }}
            </button>
            <button v-if="updateInfo.version" class="secondary-btn" @click="showUpdateModal = true">
              查看新版本 {{ updateInfo.version }}
            </button>
          </div>
          <p v-if="updateError" class="field-note" style="color: oklch(58% 0.18 25); margin-top: 8px">
            {{ updateError }}
          </p>
          <p v-else-if="lastChecked && !updateInfo.version" class="field-note" style="margin-top: 8px">
            已是最新版本（检查于 {{ lastChecked.toLocaleTimeString() }}）
          </p>
        </div>
      </article>
    </section>

    <!-- Update modal (FT-07) -->
    <n-modal
      v-model:show="showUpdateModal"
      :mask-closable="!installingUpdate"
      :close-on-esc="!installingUpdate"
    >
      <n-card style="max-width: 460px" :title="`新版本 ${updateInfo.version || ''}`" :bordered="false">
        <p class="update-body">{{ updateInfo.body || '点击「立即更新」将下载并自动安装。' }}</p>
        <p v-if="installingUpdate && installStatus" class="update-status" role="status" aria-live="polite">
          {{ installStatus }}
        </p>
        <n-progress v-if="installingUpdate && downloadProgress > 0 && downloadProgress < 100" type="line" :percentage="downloadProgress" />
        <p v-if="installError || updateError" class="update-error" role="alert">{{ installError || updateError }}</p>
        <template #footer>
          <div class="permission-actions">
            <button class="secondary-btn" :disabled="installingUpdate" @click="showUpdateModal = false">稍后</button>
            <button class="primary-btn" :disabled="installingUpdate" :aria-busy="installingUpdate" @click="installUpdate">
              {{ installingUpdate ? installStatus || '正在更新…' : '立即更新' }}
            </button>
          </div>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NModal, NCard, NProgress } from 'naive-ui'
import { useSettingsStore, type ReminderLeadMinutes } from '@/stores/settingsStore'
import { formatInstallPhase, formatUpdateError, useAppUpdate } from '@/composables/useAppUpdate'
import { useTeamStore } from '@/stores/teamStore'
import { useAuthStore } from '@/stores/authStore'
import { isTauriRuntime } from '@/utils/platform'
import { appLogger } from '@/composables/useAppLogger'

const settings = useSettingsStore()
const teamStore = useTeamStore()
const auth = useAuthStore()
const router = useRouter()
const {
  updateInfo,
  downloadProgress,
  checking: checkingUpdate,
  installing: installingUpdate,
  lastChecked,
  installPhase,
  installError,
  checkForUpdate,
  downloadAndInstall,
} = useAppUpdate()

const appVersion = ref('0.1.0')

// FT-07 update modal state
const showUpdateModal = ref(false)
const updateError = ref('')
const installStatus = computed(() => formatInstallPhase(installPhase.value))
const loggingOut = ref(false)
const logoutError = ref('')

// P6 team card state
const newTeamName = ref('')
const editingName = ref(false)
const editNameValue = ref('')
const inviteUsername = ref('')
const inviteRole = ref('开发')
const inviteError = ref('')

const ROLE_CLASS: Record<string, string> = {
  '开发': 'role-dev',
  '管理': 'role-mgmt',
  '测试': 'role-qa',
}
function roleClass(role: string): string {
  return ROLE_CLASS[role] || 'role-dev'
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return iso
  }
}

async function handleCreateTeam() {
  const name = newTeamName.value.trim()
  if (!name) return
  try {
    await teamStore.createTeam(name)
    newTeamName.value = ''
  } catch (err: any) {
    inviteError.value = err?.message || '创建团队失败'
  }
}

function startEditName() {
  if (!teamStore.team) return
  editNameValue.value = teamStore.team.name
  editingName.value = true
}

function cancelEditName() {
  editingName.value = false
  editNameValue.value = ''
}

async function saveEditName() {
  const name = editNameValue.value.trim()
  if (!name || !teamStore.team) return
  try {
    await teamStore.updateTeamName(name)
    editingName.value = false
    editNameValue.value = ''
  } catch (err: any) {
    inviteError.value = err?.message || '更新团队名失败'
  }
}

async function onMemberRoleChange(m: { userId: number; role: string }, role: string) {
  if (!role || role === m.role) return
  try {
    await teamStore.updateMemberRole(m.userId, role)
  } catch (err: any) {
    inviteError.value = err?.message || '更新角色失败'
  }
}

async function handleInvite() {
  const username = inviteUsername.value.trim()
  if (!username) return
  inviteError.value = ''
  try {
    await teamStore.inviteMember(username, inviteRole.value)
    inviteUsername.value = ''
  } catch (err: any) {
    inviteError.value = err?.message || err?.response?.data?.detail || '邀请失败'
  }
}

async function handleRemoveMember(m: { userId: number; username: string }) {
  if (!window.confirm(`确定将「${m.username}」移出团队？`)) return
  try {
    await teamStore.removeMember(m.userId)
  } catch (err: any) {
    inviteError.value = err?.message || '移除成员失败'
  }
}

async function handleLeaveTeam() {
  if (!auth.userId) return
  if (!window.confirm('确定退出团队？退出后将无法查看队友任务。')) return
  try {
    await teamStore.removeMember(auth.userId)
  } catch (err: any) {
    inviteError.value = err?.message || '退出团队失败'
  }
}

async function handleDissolve() {
  if (!window.confirm('确定解散团队？此操作不可恢复，所有成员将被移出。')) return
  try {
    await teamStore.dissolveTeam()
  } catch (err: any) {
    inviteError.value = err?.message || '解散团队失败'
  }
}

async function handleLogout() {
  if (loggingOut.value) return

  loggingOut.value = true
  logoutError.value = ''
  try {
    await auth.logout()
    await router.replace('/login')
  } catch (error) {
    logoutError.value = error instanceof Error ? error.message : '退出登录失败，请稍后重试。'
    appLogger.error('[认证] 退出登录失败', error)
  } finally {
    loggingOut.value = false
  }
}

const leadOptions: { label: string; value: ReminderLeadMinutes }[] = [
  { label: '准点', value: 0 },
  { label: '提前 5 分', value: 5 },
  { label: '提前 10 分', value: 10 },
  { label: '提前 30 分', value: 30 },
]

const intervalOptions = [
  { label: '30 秒', value: 30 as const },
  { label: '60 秒', value: 60 as const },
]

const permissionLabel = computed(() => {
  if (settings.notificationPermission === 'granted') return '已允许'
  if (settings.notificationPermission === 'denied') return '已拒绝'
  return '未决定'
})

const permissionHint = computed(() => {
  if (settings.notificationPermission === 'granted') {
    return '系统通知已开启。应用运行时会按你设置的策略检查任务并发送提醒。'
  }
  if (settings.notificationPermission === 'denied') {
    return '通知权限已被系统拒绝。请在 Windows 设置中重新允许 Focus Task 发送通知。'
  }
  return '当前版本优先使用系统通知权限，必要时会回退到桌面原生通知。应用运行时会按你设置的策略检查任务。'
})

async function handleNotificationAction() {
  if (settings.notificationPermission === 'denied') {
    await settings.openNotificationSettings()
    return
  }
  await settings.requestNotificationPermission()
}

async function sendTestNotification() {
  await settings.sendTestNotification()
}

async function handleCheckUpdate() {
  updateError.value = ''
  appLogger.info('[update] handleCheckUpdate start')
  try {
    const info = await checkForUpdate()
    if (info) {
      showUpdateModal.value = true
    } else {
      updateError.value = '已是最新版本'
    }
  } catch (err: any) {
    // BUG-2 surface: the user-visible "检查更新失败" comes from here.
    // appLogger already recorded the full error in checkForUpdate(); this
    // log adds the resolved message so the log file shows what the user saw.
    appLogger.error('[update] handleCheckUpdate surfaced to user', {
      message: err?.message || '检查更新失败',
    })
    updateError.value = formatUpdateError(err)
  }
}

async function installUpdate() {
  // A retry must not leave the prior failure visible while a new native
  // download is already in progress.
  updateError.value = ''
  try {
    await downloadAndInstall()
  } catch (err: any) {
    appLogger.error('[update] installUpdate surfaced to user', {
      message: err?.message || '更新失败',
    })
    updateError.value = installError.value || formatUpdateError(err, '更新')
  }
}

onMounted(async () => {
  // P6: ensure team state is available even if AppLayout hasn't fetched it yet.
  teamStore.fetchTeam()
  // Best-effort version fetch — Tauri exposes getVersion() from the app API.
  if (isTauriRuntime()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      appVersion.value = await getVersion()
    } catch {
      // Fall back to the placeholder version baked into the build.
    }
  }
})
</script>

<style scoped>
.settings-page {
  height: 100%;
  overflow-y: auto;
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: linear-gradient(180deg, oklch(98.8% 0.003 240), oklch(97.8% 0.004 240));
}

.settings-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.settings-heading {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.settings-eyebrow,
.card-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.settings-heading h1 {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 650;
  color: var(--text-primary);
}

.settings-heading p {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.settings-card {
  background: oklch(99.5% 0.002 240 / 0.96);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  box-shadow: 0 12px 28px oklch(0% 0 0 / 0.03);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-head h2 {
  margin-top: 3px;
  font-size: 18px;
  font-weight: 650;
  color: var(--text-primary);
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-block label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.segment-control {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface);
}

.segment-control.narrow {
  width: fit-content;
}

.segment-btn {
  min-width: 68px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.segment-btn.active {
  background: oklch(95% 0.015 240);
  color: oklch(35% 0.1 240);
  font-weight: 600;
}

.field-note {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.time-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.time-grid input {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-mid);
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.time-grid input:focus {
  border-color: oklch(58% 0.11 240);
  box-shadow: 0 0 0 3px oklch(58% 0.11 240 / 0.12);
}

.permission-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.permission-panel p {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.permission-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.primary-btn,
.secondary-btn {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.primary-btn {
  border: none;
  background: oklch(58% 0.11 240);
  color: white;
}

.secondary-btn {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-primary);
}

.permission-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.permission-badge.granted {
  background: oklch(96% 0.018 145);
  color: oklch(45% 0.1 145);
}

.permission-badge.denied {
  background: oklch(96% 0.03 25);
  color: oklch(52% 0.16 25);
}

.permission-badge.default {
  background: var(--surface-mid);
  color: var(--text-secondary);
}

@media (max-width: 1180px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .time-grid {
    grid-template-columns: 1fr;
  }
}

/* ─── Update modal body (FT-07) ─── */
.update-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  margin: 0 0 14px;
}

/* ─── Team card (P6) ─── */
.team-card {
  /* uses shared .settings-card layout */
}

.team-name-inline {
  margin-left: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.name-edit-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.name-edit-input,
.text-input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-mid);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  outline: none;
  min-width: 0;
}

.name-edit-input {
  flex: 1 1 120px;
}

.name-edit-input:focus,
.text-input:focus {
  border-color: oklch(58% 0.11 240);
  box-shadow: 0 0 0 3px oklch(58% 0.11 240 / 0.12);
}

.team-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.member-list {
  display: flex;
  flex-direction: column;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
}

.member-row:last-child {
  border-bottom: none;
}

.member-username {
  font-weight: 550;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-self {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
}

.member-joined {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.member-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
}

.role-dev {
  background: oklch(60% 0.12 250);
  color: white;
}

.role-mgmt {
  background: oklch(55% 0.18 300);
  color: white;
}

.role-qa {
  background: oklch(65% 0.15 60);
  color: white;
}

.role-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.danger-btn {
  height: 30px;
  padding: 0 10px;
  border: 1px solid oklch(80% 0.1 25);
  border-radius: 8px;
  background: oklch(96% 0.03 25);
  color: oklch(52% 0.16 25);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background var(--transition, 0.15s);
}

.danger-btn:hover {
  background: oklch(92% 0.05 25);
}

.invite-form {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  flex-wrap: wrap;
  align-items: center;
}

.invite-form .text-input {
  flex: 1;
  min-width: 140px;
}

.dissolve-row {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: flex-end;
}

.dissolve-row .danger-btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
}

/* ─── Account session ─── */
.account-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-username {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.account-logout-btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
}

.account-logout-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.account-error {
  color: oklch(52% 0.16 25);
}

</style>
