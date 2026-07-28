import type { Task } from '@/stores/taskStore'
import { watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { parseDateTimeLocal } from './dateTime'
import { useSettingsStore } from '@/stores/settingsStore'

const NOTIFICATION_LOG_KEY = 'focus-task-notification-log'
const OVERDUE_GRACE_MS = 60000

type NotificationKind = 'start' | 'due' | 'overdue'

function loadLog(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NOTIFICATION_LOG_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLog(log: Record<string, string>) {
  localStorage.setItem(NOTIFICATION_LOG_KEY, JSON.stringify(log))
}

function logKey(task: Task, kind: NotificationKind) {
  const timeValue = kind === 'start' ? task.startAt : task.due
  return `${task.clientId}:${kind}:${timeValue}`
}

async function ensurePermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (typeof Notification === 'undefined') return true
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return true
  const permission = await Notification.requestPermission()
  return permission === 'granted' || permission === 'denied'
}

async function showNotification(title: string, body: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body })
    return
  }

  await invoke('send_native_notification', {
    payload: { title, body },
  })
}

function dueBody(task: Task, kind: NotificationKind) {
  if (kind === 'start') return `任务“${task.title || '未命名任务'}”已到开始时间。`
  if (kind === 'due') return `任务“${task.title || '未命名任务'}”已到截止时间。`
  return `任务“${task.title || '未命名任务'}”已过期，请尽快处理。`
}

function shouldNotify(task: Task, kind: NotificationKind, now: number, leadMinutes: number) {
  if (task.done || task.deleted) return false
  const targetValue = kind === 'start' ? task.startAt : task.due
  const target = parseDateTimeLocal(targetValue)
  if (!target) return false
  const targetMs = target.getTime()
  const leadMs = leadMinutes * 60000

  if (kind === 'start') return task.notifyOnStart && targetMs - leadMs <= now
  if (kind === 'due') return task.notifyOnDue && targetMs - leadMs <= now
  return task.notifyOnOverdue && targetMs + OVERDUE_GRACE_MS <= now
}

export function startTaskNotifications(getTasks: () => Task[]) {
  let timer: ReturnType<typeof setInterval> | null = null
  const settings = useSettingsStore()

  const schedule = () => {
    if (timer) clearInterval(timer)
    timer = setInterval(tick, settings.state.notificationCheckIntervalSeconds * 1000)
  }

  const tick = async () => {
    const allowed = await ensurePermission()
    if (!allowed) return

    const log = loadLog()
    const now = Date.now()
    const leadMinutes = settings.state.reminderLeadMinutes
    for (const task of getTasks()) {
      ;(['start', 'due', 'overdue'] as NotificationKind[]).forEach(kind => {
        const key = logKey(task, kind)
        if (log[key]) return
        if (!shouldNotify(task, kind, now, leadMinutes)) return
        void showNotification('Focus Task 提醒', dueBody(task, kind))
        log[key] = new Date(now).toISOString()
      })
    }
    saveLog(log)
  }

  tick()
  schedule()
  const stopWatching = watch(
    () => settings.state.notificationCheckIntervalSeconds,
    () => {
      schedule()
    },
  )

  return () => {
    stopWatching()
    if (timer) clearInterval(timer)
  }
}
