import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, type App } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  auth: {
    username: 'alice',
    userId: 1,
    sessionWarning: '',
    logout: vi.fn(),
    switchAccount: vi.fn(),
    removeCurrentAccount: vi.fn(),
  },
  isTauri: true,
  team: {
    hasTeam: false,
    isManager: false,
    team: null,
    members: [],
    fetchTeam: vi.fn(),
    createTeam: vi.fn(),
    updateTeamName: vi.fn(),
    updateMemberRole: vi.fn(),
    inviteMember: vi.fn(),
    removeMember: vi.fn(),
    dissolveTeam: vi.fn(),
  },
  settings: {
    state: {
      reminderLeadMinutes: 10,
      notificationCheckIntervalSeconds: 30,
      defaultStartTime: '09:00',
      defaultDueTime: '18:00',
    },
    reminderLeadLabel: '提前 10 分钟',
    notificationPermission: 'default',
    notificationActionLabel: '请求通知权限',
    update: vi.fn(),
    requestNotificationPermission: vi.fn(),
    refreshPermission: vi.fn(),
    openNotificationSettings: vi.fn(),
    sendTestNotification: vi.fn(),
  },
}))

vi.mock('naive-ui', () => ({
  NModal: { template: '<div><slot /></div>' },
  NCard: { template: '<div><slot /><slot name="footer" /></div>' },
  NProgress: { template: '<div />' },
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('2.3.7'),
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => mocks.settings,
}))

vi.mock('@/stores/teamStore', () => ({
  useTeamStore: () => mocks.team,
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => mocks.auth,
}))

vi.mock('@/composables/useAppUpdate', () => ({
  formatInstallPhase: vi.fn(() => ''),
  formatUpdateError: vi.fn(() => '检查更新失败'),
  useAppUpdate: () => ({
    updateInfo: {},
    downloadProgress: 0,
    checking: false,
    installing: false,
    lastChecked: null,
    installPhase: { value: 'idle' },
    installError: { value: '' },
    checkForUpdate: vi.fn(),
    downloadAndInstall: vi.fn(),
  }),
}))

vi.mock('@/utils/platform', () => ({
  isTauriRuntime: () => mocks.isTauri,
}))

vi.mock('@/composables/useAppLogger', () => ({
  appLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    buffer: vi.fn(),
  },
}))

import SettingsView from './SettingsView.vue'

describe('设置页账号操作', () => {
  let app: App<Element> | null = null
  let mountPoint: HTMLDivElement | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.username = 'alice'
    mocks.auth.sessionWarning = ''
    mocks.auth.logout.mockResolvedValue(true)
    mocks.auth.switchAccount.mockResolvedValue(true)
    mocks.auth.removeCurrentAccount.mockResolvedValue(true)
    mocks.isTauri = true
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    app = null
    mountPoint = null
    vi.restoreAllMocks()
  })

  it('展示当前账号，并在退出并清除状态后回到登录页', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settings', component: SettingsView },
        { path: '/login', component: { template: '<main>登录页</main>' } },
      ],
    })
    await router.push('/settings')
    await router.isReady()

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(SettingsView)
    app.use(router)
    app.mount(mountPoint)

    expect(mountPoint.textContent).toContain('alice')
    expect(mountPoint.textContent).not.toContain('远程服务器地址')
    expect(mountPoint.textContent).not.toContain('连接远程服务器')
    expect(mountPoint.textContent).not.toContain('同步队列')
    expect(mountPoint.querySelector('input[placeholder="http://101.43.17.8:8080"]')).toBeNull()
    expect(mountPoint.querySelector('input[placeholder="远端用户名"]')).toBeNull()
    const logoutButton = [...mountPoint.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.includes('退出登录'))
    expect(logoutButton).toBeDefined()

    logoutButton?.click()

    await vi.waitFor(() => {
      expect(mocks.auth.logout).toHaveBeenCalledTimes(1)
      expect(router.currentRoute.value.path).toBe('/login')
    })
  })

  it('切换账号时保留本机会话并回到登录页选择账号', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settings', component: SettingsView },
        { path: '/login', component: { template: '<main>登录页</main>' } },
      ],
    })
    await router.push('/settings')
    await router.isReady()

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(SettingsView)
    app.use(router)
    app.mount(mountPoint)

    const switchButton = [...mountPoint.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.includes('切换账号'))
    expect(switchButton).toBeDefined()

    switchButton?.click()

    await vi.waitFor(() => {
      expect(mocks.auth.switchAccount).toHaveBeenCalledTimes(1)
      expect(mocks.auth.logout).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/login')
    })
  })

  it('移除账号前明确说明不会影响服务端数据', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settings', component: SettingsView },
        { path: '/login', component: { template: '<main>登录页</main>' } },
      ],
    })
    await router.push('/settings')
    await router.isReady()

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(SettingsView)
    app.use(router)
    app.mount(mountPoint)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const removeButton = [...mountPoint.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.includes('移除此账号'))

    removeButton?.click()

    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalledWith('确定从本机移除此账号吗？这不会影响服务端数据和任务。')
      expect(mocks.auth.removeCurrentAccount).toHaveBeenCalledTimes(1)
      expect(router.currentRoute.value.path).toBe('/login')
    })
  })
})
