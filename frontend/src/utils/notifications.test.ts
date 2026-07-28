import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSettingsStore } from '@/stores/settingsStore'
import { startTaskNotifications } from '@/utils/notifications'
import * as core from '@tauri-apps/api/core'

const notifications: Array<{ title: string; body: string }> = []

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (_cmd: string, args: any) => {
    if (args?.payload) {
      notifications.push(args.payload)
    }
    return null
  }),
}))

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    clientId: 'task-1',
    quadrant: 1,
    title: '提醒测试',
    notes: '',
    done: false,
    startAt: '',
    due: '2026-06-12T10:08',
    tag: '',
    repeat: 'none',
    notifyOnStart: false,
    notifyOnDue: true,
    notifyOnOverdue: false,
    showInFocus: false,
    sortOrder: 0,
    doneAt: '',
    deleted: false,
    ...overrides,
  }
}

describe('task notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T10:00:00'))
    setActivePinia(createPinia())
    localStorage.clear()
    notifications.length = 0
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires due reminders inside the configured lead window', async () => {
    const settings = useSettingsStore()
    settings.update({ reminderLeadMinutes: 10 })

    const stop = startTaskNotifications(() => [makeTask()])
    await vi.runAllTicks()
    await Promise.resolve()

    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Focus Task 提醒')
    expect(notifications[0].body).toContain('已到截止时间')
    expect(vi.mocked(core.invoke)).toHaveBeenCalledWith('send_native_notification', expect.anything())

    stop()
  })

  it('restarts polling when the interval setting changes', async () => {
    const settings = useSettingsStore()
    settings.update({ notificationCheckIntervalSeconds: 60 })
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const stop = startTaskNotifications(() => [])
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000)

    settings.update({ notificationCheckIntervalSeconds: 30 })
    await nextTick()

    expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 30000)

    stop()
  })
})
