import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import { useTaskStore } from './stores/taskStore'
import { startTaskNotifications } from './utils/notifications'
import { appLogger } from './composables/useAppLogger'

const app = createApp(App)
const pinia = createPinia()

// v2.3.1: global error + unhandledrejection handlers so crashes that escape
// try/catch (e.g. async callbacks, render errors) still land in frontend.log.
// ``error`` event: uncaught exceptions and resource load failures.
// ``unhandledrejection``: Promises with no .catch().
app.config.errorHandler = (err, _instance, info) => {
  appLogger.error('[vue] errorHandler', { err: err as Error, info })
}
window.addEventListener('error', (event) => {
  // event.error can be null for cross-origin script errors; fall back to message.
  appLogger.error('[window] uncaught error', event.error ?? event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  appLogger.error('[window] unhandled promise rejection', event.reason)
})

appLogger.info('[app] bootstrap start', undefined, { persist: true })

async function bootstrap() {
  app.use(pinia)

  const auth = useAuthStore(pinia)
  await auth.init()
  const settingsStore = useSettingsStore(pinia)
  settingsStore.refreshPermission()
  const taskStore = useTaskStore(pinia)
  startTaskNotifications(() => taskStore.activeTasks)

  app.use(router)
  await router.isReady()
  app.mount('#app')
  appLogger.info('[app] mounted', undefined, { persist: true })
}

bootstrap().catch((err) => {
  appLogger.error('[app] bootstrap failed', err)
})
