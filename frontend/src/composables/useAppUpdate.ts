/**
 * Tauri auto-update wrapper (FT-07).
 *
 * Defers all imports of `@tauri-apps/plugin-updater` to runtime so the same
 * code runs cleanly in browser dev (no-op) and in the Tauri webview.
 *
 * The returned composable is intentionally tiny: callers (SettingsView,
 * AppLayout) only need to know ``checkForUpdate`` (returns truthy when a
 * new version is available) and ``downloadAndInstall`` (does the heavy
 * lifting and relaunches the app on success).
 */
import { ref } from 'vue'
import type { Update } from '@tauri-apps/plugin-updater'
import { isTauriRuntime } from '@/utils/platform'
import { appLogger } from '@/composables/useAppLogger'

export interface UpdateInfo {
  /** e.g. "2.1.0". Empty when the updater has nothing to report. */
  version: string
  /** Release notes from latest.json. */
  body: string
  /** When the release was published (ISO-8601 if available). */
  date?: string
}

export interface CheckForUpdateOptions {
  /** Startup checks may give up quietly so a slow network never stalls the UI. */
  silent?: boolean
}

export const SILENT_UPDATE_CHECK_TIMEOUT_MS = 15_000

class SilentUpdateCheckTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Silent update check timed out after ${timeoutMs}ms`)
    this.name = 'SilentUpdateCheckTimeoutError'
  }
}

type UpdaterCheckResult = Update | null

let inFlightUpdaterCheck: Promise<UpdaterCheckResult> | null = null
let activeCheckConsumers = 0
const checking = ref(false)
const installing = ref(false)
const downloadProgress = ref(0)
const updateInfo = ref<UpdateInfo>({ version: '', body: '' })
const lastChecked = ref<Date | null>(null)

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new SilentUpdateCheckTimeoutError(timeoutMs))
    }, timeoutMs)

    operation.then(
      value => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      error => {
        clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

function getOrStartUpdaterCheck(): Promise<UpdaterCheckResult> {
  if (inFlightUpdaterCheck) {
    return inFlightUpdaterCheck
  }

  const operation = import('@tauri-apps/plugin-updater').then(({ check }) => check())
  inFlightUpdaterCheck = operation

  const clearInFlight = () => {
    if (inFlightUpdaterCheck === operation) {
      inFlightUpdaterCheck = null
    }
  }
  operation.then(clearInFlight, clearInFlight)

  return operation
}

export function formatUpdateError(err: unknown): string {
  const error = err as { message?: unknown; toString?: () => string } | null | undefined
  const message = String(error?.message || error?.toString?.() || '')

  if (/\b(?:network|timeout|timed?\s*out|dns|ECONNREFUSED|ENOTFOUND|connection)\b|failed to fetch|error sending request/i.test(message)) {
    return '检查更新失败：网络无法访问 GitHub（请检查代理或网络）'
  }
  if (/signature|SignatureError|InvalidSignature/i.test(message)) {
    return '检查更新失败：签名校验失败（请反馈日志给开发者）'
  }
  if (/404|ReleaseNotFound|TargetsNotFound/i.test(message)) {
    return '检查更新失败：未找到更新清单（latest.json 可能未上传）'
  }
  return message ? `检查更新失败：${message}` : '检查更新失败（未知错误，请查看日志）'
}

/**
 * Fetch the update manifest and surface available release info.
 *
 * Returns the resolved ``UpdateInfo`` (with a non-empty ``version``) when an
 * update is available, ``null`` when already on the latest version, and
 * rethrows when the manifest fetch fails. Startup callers pass
 * ``{ silent: true }`` to use a bounded 15-second check; a timeout there is
 * intentionally treated as no result without changing the manual-check state.
 */
async function checkForUpdate(options: CheckForUpdateOptions = {}): Promise<UpdateInfo | null> {
  if (!isTauriRuntime()) {
    return null
  }
  activeCheckConsumers += 1
  checking.value = true
  try {
    const update = options.silent
      ? await withTimeout(getOrStartUpdaterCheck(), SILENT_UPDATE_CHECK_TIMEOUT_MS)
      : await getOrStartUpdaterCheck()
    if (!update) {
      updateInfo.value = { version: '', body: '' }
      appLogger.info('[update] check: already on latest version')
      return null
    }
    const info: UpdateInfo = {
      version: update.version ?? '',
      body: update.body ?? '',
      date: update.date ?? undefined,
    }
    updateInfo.value = info
    lastChecked.value = new Date()
    appLogger.info('[update] check: update available', { version: info.version })
    return info.version ? info : null
  } catch (err) {
    if (options.silent && err instanceof SilentUpdateCheckTimeoutError) {
      // Do not advance lastChecked or surface a false "already latest" result.
      // The user can still run an unbounded manual check from Settings.
      updateInfo.value = { version: '', body: '' }
      appLogger.warn('[update] silent check timed out', {
        timeoutMs: SILENT_UPDATE_CHECK_TIMEOUT_MS,
      })
      return null
    }
    // v2.3.1: log the full error so the user can ship frontend.log back.
    // The Tauri updater throws on signature mismatch, network failure, or
    // manifest parse failure - without this log we can't tell which.
    appLogger.error('[update] check failed', err)
    throw err
  } finally {
    activeCheckConsumers -= 1
    checking.value = activeCheckConsumers > 0
  }
}

/**
 * Download and install the available update. On success the app relaunches
 * automatically (via ``@tauri-apps/plugin-process``), so this Promise is
 * expected to never resolve in the happy path.
 */
async function downloadAndInstall(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('自动更新仅在桌面端可用')
  }
  installing.value = true
  downloadProgress.value = 0
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    const update = await getOrStartUpdaterCheck()
    if (!update) {
      throw new Error('当前已是最新版本')
    }
    // The Tauri updater emits progress on the underlying Content-Length
    // stream. We can't observe it directly from the JS side without
    // installing an event listener; mark indeterminate progress so the UI
    // can show a spinner.
    downloadProgress.value = 1
    appLogger.info('[update] downloadAndInstall start', { version: update.version })
    await update.downloadAndInstall((event: any) => {
      // Event payload schema: { event: 'Started' | 'Progress' | 'Finished', ... }
      if (event?.event === 'Progress' && event.data?.contentLength) {
        const ratio = event.data.downloaded / event.data.contentLength
        downloadProgress.value = Math.max(1, Math.min(99, Math.round(ratio * 100)))
      }
    })
    downloadProgress.value = 100
    appLogger.info('[update] downloadAndInstall complete, relaunching')
    // downloadAndInstall triggers relaunch on completion - the call below
    // is a fallback if the platform doesn't auto-relaunch.
    await relaunch()
  } catch (err) {
    appLogger.error('[update] downloadAndInstall failed', err)
    throw err
  } finally {
    installing.value = false
  }
}

export function useAppUpdate() {
  return {
    updateInfo,
    checking,
    installing,
    downloadProgress,
    lastChecked,
    checkForUpdate,
    downloadAndInstall,
  }
}