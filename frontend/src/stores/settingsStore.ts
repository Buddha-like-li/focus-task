import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'

export type ReminderLeadMinutes = 0 | 5 | 10 | 30

interface SettingsState {
  reminderLeadMinutes: ReminderLeadMinutes
  notificationCheckIntervalSeconds: 30 | 60
  defaultStartTime: string
  defaultDueTime: string
}

const SETTINGS_KEY = 'focus-task-settings'

const DEFAULT_SETTINGS: SettingsState = {
  reminderLeadMinutes: 10,
  notificationCheckIntervalSeconds: 30,
  defaultStartTime: '09:00',
  defaultDueTime: '18:00',
}

function readBrowserNotificationPermission(): 'default' | 'granted' | 'denied' {
  if (typeof Notification === 'undefined') return 'default'
  return Notification.permission
}

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      reminderLeadMinutes: parsed.reminderLeadMinutes ?? DEFAULT_SETTINGS.reminderLeadMinutes,
      notificationCheckIntervalSeconds: parsed.notificationCheckIntervalSeconds ?? DEFAULT_SETTINGS.notificationCheckIntervalSeconds,
      defaultStartTime: parsed.defaultStartTime ?? DEFAULT_SETTINGS.defaultStartTime,
      defaultDueTime: parsed.defaultDueTime ?? DEFAULT_SETTINGS.defaultDueTime,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const state = ref<SettingsState>(loadSettings())
  const notificationPermission = ref<'default' | 'granted' | 'denied'>(readBrowserNotificationPermission())

  function save() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.value))
  }

  function update(partial: Partial<SettingsState>) {
    state.value = { ...state.value, ...partial }
    save()
  }

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return 'denied'
    if (Notification.permission === 'denied') {
      notificationPermission.value = 'denied'
      return 'denied'
    }
    const permission = await Notification.requestPermission()
    notificationPermission.value = permission
    return permission
  }

  async function openNotificationSettings() {
    try {
      await invoke('open_notification_settings')
      return true
    } catch {
      return false
    }
  }

  function refreshPermission() {
    notificationPermission.value = readBrowserNotificationPermission()
  }

  async function sendTestNotification() {
    try {
      if (typeof Notification !== 'undefined') {
        const permission = Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission
        notificationPermission.value = permission
        if (permission === 'granted') {
          new Notification('Focus Task 提醒测试', {
            body: '这是一条桌面通知。只要你能看到它，后续任务提醒也会按设置发送。',
          })
          return true
        }
      }

      await invoke('send_native_notification', {
        payload: {
          title: 'Focus Task 提醒测试',
          body: '这是一条桌面通知。只要你能看到它，后续任务提醒也会按设置发送。',
        },
      })
      notificationPermission.value = 'granted'
      return true
    } catch {
      return false
    }
  }

  const reminderLeadLabel = computed(() => {
    const minutes = state.value.reminderLeadMinutes
    return minutes === 0 ? '准点提醒' : `提前 ${minutes} 分钟`
  })

  const notificationActionLabel = computed(() => {
    if (notificationPermission.value === 'granted') return '已允许通知'
    if (notificationPermission.value === 'denied') return '打开系统通知设置'
    return '请求通知权限'
  })

  return {
    state,
    notificationPermission,
    reminderLeadLabel,
    notificationActionLabel,
    update,
    requestNotificationPermission,
    refreshPermission,
    openNotificationSettings,
    sendTestNotification,
  }
})
