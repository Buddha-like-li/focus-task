import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia, type Pinia } from 'pinia'

vi.mock('@/api', () => ({
  listTasks: vi.fn(),
  listRequirements: vi.fn().mockResolvedValue([]),
  onAuthExpired: vi.fn(),
}))

vi.mock('@/composables/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateInfo: {},
    downloadProgress: 0,
    installing: false,
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
vi.mock('@/components/QuadrantCard.vue', () => ({ default: { template: '<section />' } }))
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
})
