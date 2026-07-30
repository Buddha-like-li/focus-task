import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, type App } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  auth: {
    restoreError: '',
    sessionWarning: '',
    loginUsernameHint: '',
    rememberedAccounts: [] as Array<{ username: string; hasSession: boolean; isActive: boolean }>,
    refreshRememberedAccounts: vi.fn(),
    clearRestoreError: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    restoreAccount: vi.fn(),
  },
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => mocks.auth,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ startDragging: vi.fn() }),
}))

import LoginView from './LoginView.vue'

describe('登录页已记住账号选择', () => {
  let app: App<Element> | null = null
  let mountPoint: HTMLDivElement | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.restoreError = ''
    mocks.auth.sessionWarning = ''
    mocks.auth.loginUsernameHint = ''
    mocks.auth.rememberedAccounts = [
      { username: 'alice', hasSession: true, isActive: false },
      { username: 'bob', hasSession: false, isActive: false },
    ]
    mocks.auth.refreshRememberedAccounts.mockResolvedValue(mocks.auth.rememberedAccounts)
    mocks.auth.restoreAccount.mockResolvedValue(true)
    mocks.auth.login.mockResolvedValue(true)
    mocks.auth.register.mockResolvedValue(true)
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    app = null
    mountPoint = null
  })

  async function mountLogin() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<main>工作台</main>' } },
        { path: '/login', component: LoginView },
      ],
    })
    await router.push('/login')
    await router.isReady()

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(LoginView)
    app.use(router)
    app.mount(mountPoint)
    await vi.waitFor(() => expect(mocks.auth.refreshRememberedAccounts).toHaveBeenCalledTimes(1))
    return router
  }

  it('用户名输入框获得焦点时展示已记住账号，并选择有会话账号后自动恢复', async () => {
    const router = await mountLogin()
    const usernameInput = mountPoint?.querySelector<HTMLInputElement>('#login-username')
    usernameInput?.focus()

    await vi.waitFor(() => {
      expect(mountPoint?.textContent).toContain('已记住的账号')
      expect(mountPoint?.textContent).toContain('alice')
      expect(mountPoint?.textContent).toContain('可直接登录')
    })

    const aliceOption = [...(mountPoint?.querySelectorAll<HTMLButtonElement>('button') || [])]
      .find(button => button.textContent?.includes('alice'))
    aliceOption?.click()

    await vi.waitFor(() => {
      expect(mocks.auth.restoreAccount).toHaveBeenCalledWith('alice')
      expect(router.currentRoute.value.path).toBe('/')
    })
  })

  it('选择没有会话的账号时保留用户名并要求输入密码', async () => {
    await mountLogin()
    const usernameInput = mountPoint?.querySelector<HTMLInputElement>('#login-username')
    usernameInput?.focus()
    const bobOption = [...(mountPoint?.querySelectorAll<HTMLButtonElement>('button') || [])]
      .find(button => button.textContent?.includes('bob'))
    bobOption?.click()

    await vi.waitFor(() => {
      expect(mocks.auth.restoreAccount).not.toHaveBeenCalled()
      expect(usernameInput?.value).toBe('bob')
      expect(mountPoint?.textContent).toContain('此账号需要重新输入密码。')
    })
    expect(document.activeElement).toBe(mountPoint?.querySelector('#login-password'))
  })

  it('已保存会话失效时保留所选用户名并把焦点放到密码框', async () => {
    mocks.auth.loginUsernameHint = 'alice'
    mocks.auth.restoreAccount.mockResolvedValue(false)

    await mountLogin()
    const usernameInput = mountPoint?.querySelector<HTMLInputElement>('#login-username')
    usernameInput?.focus()
    const aliceOption = [...(mountPoint?.querySelectorAll<HTMLButtonElement>('button') || [])]
      .find(button => button.textContent?.includes('alice'))
    aliceOption?.click()

    await vi.waitFor(() => {
      expect(mocks.auth.restoreAccount).toHaveBeenCalledWith('alice')
      expect(usernameInput?.value).toBe('alice')
      expect(mountPoint?.textContent).toContain('登录状态已失效，请输入密码重新登录。')
    })
    expect(document.activeElement).toBe(mountPoint?.querySelector('#login-password'))
  })

  it('显示本次可继续使用但未能记住的非致命提示', async () => {
    mocks.auth.sessionWarning = '本次登录未能在本机记住，关闭应用后需要重新登录。'

    await mountLogin()

    expect(mountPoint?.querySelector('.session-warning')?.textContent)
      .toContain('本次登录未能在本机记住，关闭应用后需要重新登录。')
  })
})
