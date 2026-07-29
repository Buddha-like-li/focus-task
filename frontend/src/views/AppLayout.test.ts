import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, inject } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia, type Pinia } from 'pinia'

vi.mock('@/api', () => ({
  listTasks: vi.fn(),
  listRequirements: vi.fn().mockResolvedValue([]),
  onAuthExpired: vi.fn(),
}))

vi.mock('@/composables/useAppUpdate', () => ({
  formatInstallPhase: vi.fn(() => ''),
  useAppUpdate: () => ({
    updateInfo: {},
    downloadProgress: 0,
    installing: false,
    installPhase: { value: 'idle' },
    installError: '',
    checkForUpdate: vi.fn(),
    downloadAndInstall: vi.fn(),
  }),
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

vi.mock('@/utils/platform', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('@/components/Sidebar.vue', () => ({ default: { template: '<aside />' } }))
vi.mock('@/components/QuadrantCard.vue', () => ({
  default: {
    setup() {
      const showContextMenu = inject<(event: MouseEvent, clientId: string) => void>('showContextMenu', () => {})
      return { showContextMenu }
    },
    template: '<button class="context-trigger" @contextmenu="showContextMenu($event, \'menu-task\')">菜单</button>',
  },
}))
vi.mock('@/components/DetailPanel.vue', () => ({ default: { template: '<section />' } }))
vi.mock('@/views/ReportsView.vue', () => ({ default: { template: '<section />' } }))
vi.mock('@/views/SummaryView.vue', () => ({ default: { template: '<section />' } }))
vi.mock('@/views/RequirementsView.vue', () => ({ default: { template: '<section />' } }))
vi.mock('@/views/TeammatesView.vue', () => ({ default: { template: '<section />' } }))
vi.mock('@/views/SettingsView.vue', () => ({ default: { template: '<section />' } }))

import * as api from '@/api'
import AppLayout from './AppLayout.vue'

const LOCAL_SERVICE_ERROR = '无法连接 Focus Task 本地服务（http://127.0.0.1:18765）。请确认 Focus Task 服务容器正在运行后重试。'

describe('AppLayout local service status', () => {
  let app: ReturnType<typeof createApp> | null = null
  let mountPoint: HTMLDivElement | null = null
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    vi.mocked(api.listTasks).mockRejectedValue(new Error(LOCAL_SERVICE_ERROR))
    vi.mocked(api.listRequirements).mockResolvedValue([])
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    app = null
    mountPoint = null
  })

  it('shows a retryable status when the local service cannot be reached', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<main />' } }],
    })
    await router.push('/')
    await router.isReady()

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(AppLayout)
    app.use(pinia)
    app.use(router)
    app.mount(mountPoint)

    await vi.waitFor(() => {
      expect(api.listTasks).toHaveBeenCalledTimes(1)
      expect(mountPoint?.querySelector('.service-status')?.textContent).toContain(LOCAL_SERVICE_ERROR)
    })

    const retry = mountPoint.querySelector<HTMLButtonElement>('.service-status-retry')
    expect(retry?.textContent).toContain('重新连接')
    retry?.click()

    await vi.waitFor(() => {
      expect(api.listTasks).toHaveBeenCalledTimes(2)
      expect(mountPoint?.querySelector('.service-status')?.textContent).toContain(LOCAL_SERVICE_ERROR)
    })
  })

  it('keeps a context menu inside the viewport using its rendered size', async () => {
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('context-menu')) {
          return {
            x: 0, y: 0, top: 0, left: 0, right: 217, bottom: 193,
            width: 217, height: 193, toJSON: () => ({}),
          } as DOMRect
        }
        return {
          x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0,
          width: 0, height: 0, toJSON: () => ({}),
        } as DOMRect
      })

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    try {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/:pathMatch(.*)*', component: { template: '<main />' } }],
      })
      await router.push('/')
      await router.isReady()

      mountPoint = document.createElement('div')
      document.body.appendChild(mountPoint)
      app = createApp(AppLayout)
      app.use(pinia)
      app.use(router)
      app.mount(mountPoint)

      mountPoint.querySelector('.context-trigger')?.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 990,
        clientY: 790,
      }))

      await vi.waitFor(() => {
        const menu = mountPoint?.querySelector<HTMLElement>('.context-menu')
        expect(menu).not.toBeNull()
        expect(menu?.style.left).toBe('775px')
        expect(menu?.style.top).toBe('599px')
      })
    } finally {
      getBoundingClientRect.mockRestore()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight })
    }
  })
})
