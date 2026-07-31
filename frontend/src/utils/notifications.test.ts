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

    const stop = startTaskNotifications(() => [makeTask({ previousOwnerId: 2 })])
    await vi.runAllTicks()
    await Promise.resolve()

    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Focus Task 提醒')
    expect(notifications[0].body).toContain('已到截止时间')
    expect(vi.mocked(core.invoke)).toHaveBeenCalledWith('send_native_notification', expect.anything())

    stop()
  })

  it('does not send start or due reminders for tasks created by the current user', async () => {
    const settings = useSettingsStore()
    settings.update({ reminderLeadMinutes: 0 })

    const stop = startTaskNotifications(() => [
      makeTask({
        startAt: '2026-06-12T09:59',
        due: '2026-06-12T09:59',
        notifyOnStart: true,
        notifyOnDue: true,
        notifyOnOverdue: true,
        previousOwnerId: null,
      }),
    ])
    await vi.runAllTicks()
    await Promise.resolve()

    expect(notifications).toHaveLength(0)

    stop()
  })

  it('keeps start and due reminders for transferred tasks', async () => {
    const settings = useSettingsStore()
    settings.update({ reminderLeadMinutes: 0 })

    const stop = startTaskNotifications(() => [
      makeTask({
        startAt: '2026-06-12T09:59',
        due: '2026-06-12T09:59',
        notifyOnStart: true,
        notifyOnDue: true,
        notifyOnOverdue: false,
        previousOwnerId: 2,
      }),
    ])
    await vi.runAllTicks()
    await Promise.resolve()

    expect(notifications).toHaveLength(2)
    expect(notifications.map(item => item.body)).toEqual([
      expect.stringContaining('已到开始时间'),
      expect.stringContaining('已到截止时间'),
    ])

    stop()
  })

  it('does not send overdue reminders until the day after the due date', async () => {
    const settings = useSettingsStore()
    settings.update({ reminderLeadMinutes: 0 })

    const sameDayStop = startTaskNotifications(() => [
      makeTask({
        due: '2026-06-12T09:00',
        notifyOnDue: false,
        notifyOnOverdue: true,
      }),
    ])
    await vi.runAllTicks()
    await Promise.resolve()

    expect(notifications).toHaveLength(0)
    sameDayStop()

    vi.setSystemTime(new Date('2026-06-13T00:00:00'))
    const nextDayStop = startTaskNotifications(() => [
      makeTask({
        due: '2026-06-12T18:00',
        notifyOnDue: false,
        notifyOnOverdue: true,
      }),
    ])
    await vi.runAllTicks()
    await Promise.resolve()

    expect(notifications).toHaveLength(1)
    expect(notifications[0].body).toContain('已过期')

    nextDayStop()
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
