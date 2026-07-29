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
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'
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

/** A manifest request should not leave either startup or a manual retry stuck. */
export const UPDATE_CHECK_TIMEOUT_MS = 15_000
export const SILENT_UPDATE_CHECK_TIMEOUT_MS = UPDATE_CHECK_TIMEOUT_MS
/** Installer downloads can be much larger than a manifest, but remain bounded. */
export const UPDATE_DOWNLOAD_TIMEOUT_MS = 5 * 60_000

export type InstallPhase = 'idle' | 'connecting' | 'downloading' | 'installing' | 'relaunching' | 'failed'

type UpdaterCheckResult = Update | null

interface InFlightUpdaterCheck {
  operation: Promise<UpdaterCheckResult>
}

let inFlightUpdaterCheck: InFlightUpdaterCheck | null = null
let inFlightInstall: Promise<void> | null = null
let cachedUpdate: Update | null = null
let installingUpdateResource: Update | null = null
let activeManualCheckConsumers = 0
const checking = ref(false)
const installing = ref(false)
const downloadProgress = ref(0)
const updateInfo = ref<UpdateInfo>({ version: '', body: '' })
const lastChecked = ref<Date | null>(null)
const installPhase = ref<InstallPhase>('idle')
const installError = ref('')

function releaseUpdate(update: Update | null): void {
  if (!update) return
  // Update is a native Resource. Releasing a superseded or consumed resource
  // must never alter the visible result of a check or install attempt.
  void update.close().catch(() => {})
}

function replaceCachedUpdate(next: Update | null): void {
  const previous = cachedUpdate
  cachedUpdate = next
  // A background check can complete while an earlier Update is downloading.
  // Its resource remains valid until the active install has settled.
  if (previous && previous !== next && previous !== installingUpdateResource) {
    releaseUpdate(previous)
  }
}

function getOrStartUpdaterCheck(): InFlightUpdaterCheck {
  if (inFlightUpdaterCheck) {
    return inFlightUpdaterCheck
  }

  const operation = import('@tauri-apps/plugin-updater').then(({ check }) => check({
    timeout: UPDATE_CHECK_TIMEOUT_MS,
  }))
  const request = { operation }
  inFlightUpdaterCheck = request

  const clearInFlight = () => {
    if (inFlightUpdaterCheck === request) {
      inFlightUpdaterCheck = null
    }
  }
  operation.then(clearInFlight, clearInFlight)

  return request
}

function isTimeoutError(err: unknown): boolean {
  const error = err as { message?: unknown; toString?: () => string } | null | undefined
  const message = String(error?.message || error?.toString?.() || '')
  return /\btimeout\b|timed?\s*out/i.test(message)
}

export function formatUpdateError(err: unknown, action = '检查更新'): string {
  const error = err as { message?: unknown; toString?: () => string } | null | undefined
  const message = String(error?.message || error?.toString?.() || '')

  if (/\b(?:network|timeout|timed?\s*out|dns|ECONNREFUSED|ENOTFOUND|connection)\b|failed to fetch|error sending request/i.test(message)) {
    return `${action}失败：网络无法访问 GitHub（请检查代理或网络）`
  }
  if (/signature|SignatureError|InvalidSignature/i.test(message)) {
    return `${action}失败：签名校验失败（请反馈日志给开发者）`
  }
  if (/404|ReleaseNotFound|TargetsNotFound/i.test(message)) {
    return `${action}失败：未找到更新清单（latest.json 可能未上传）`
  }
  return message ? `${action}失败：${message}` : `${action}失败（未知错误，请查看日志）`
}

export function formatInstallPhase(phase: InstallPhase): string {
  switch (phase) {
    case 'connecting':
      return '正在连接更新服务…'
    case 'downloading':
      return '正在下载更新…'
    case 'installing':
      return '正在安装更新…'
    case 'relaunching':
      return '安装完成，正在重新启动…'
    case 'failed':
      return '更新失败'
    default:
      return ''
  }
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
  const isManualCheck = !options.silent
  if (isManualCheck) {
    activeManualCheckConsumers += 1
    checking.value = true
  }
  const request = getOrStartUpdaterCheck()
  try {
    // Tauri owns this request and its timeout. Racing it from JavaScript can
    // detach a still-running native operation and make the next click reuse a
    // stale request instead of issuing a clean retry.
    const update = await request.operation
    lastChecked.value = new Date()
    if (!update) {
      replaceCachedUpdate(null)
      updateInfo.value = { version: '', body: '' }
      appLogger.info('[update] check: already on latest version')
      return null
    }
    const info: UpdateInfo = {
      version: update.version ?? '',
      body: update.body ?? '',
      date: update.date ?? undefined,
    }
    replaceCachedUpdate(update)
    updateInfo.value = info
    installError.value = ''
    if (installPhase.value === 'failed') installPhase.value = 'idle'
    appLogger.info('[update] check: update available', { version: info.version })
    return info.version ? info : null
  } catch (err) {
    if (options.silent && isTimeoutError(err)) {
      // Do not advance lastChecked or surface a false "already latest" result.
      // The native request has rejected and getOrStartUpdaterCheck() clears it,
      // so a later manual retry starts a fresh bounded request.
      appLogger.warn('[update] silent check timed out', {
        timeoutMs: SILENT_UPDATE_CHECK_TIMEOUT_MS,
      }, { persist: true })
      return null
    }
    // The updater throws on signature mismatch, network failure, or manifest
    // parse failure. Persist the full error for offline diagnosis.
    appLogger.error('[update] check failed', err, { persist: true })
    throw err
  } finally {
    if (isManualCheck) {
      activeManualCheckConsumers -= 1
      checking.value = activeManualCheckConsumers > 0
    }
  }
}

function trackDownloadProgress(event: DownloadEvent, state: { contentLength?: number; downloadedBytes: number }): void {
  if (event.event === 'Started') {
    state.contentLength = event.data.contentLength
    state.downloadedBytes = 0
    installPhase.value = 'downloading'
    downloadProgress.value = state.contentLength ? 1 : 0
    return
  }

  if (event.event === 'Progress') {
    // updater 2.x emits the bytes for this chunk, not a cumulative downloaded
    // count. Accumulate it against Started.contentLength for accurate progress.
    state.downloadedBytes += event.data.chunkLength
    if (state.contentLength && state.contentLength > 0) {
      const percent = Math.round((state.downloadedBytes / state.contentLength) * 100)
      downloadProgress.value = Math.max(1, Math.min(99, percent))
    }
    return
  }

  installPhase.value = 'installing'
  if (downloadProgress.value > 0) downloadProgress.value = 99
}

/**
 * Download and install the available update. On success the app relaunches
 * automatically (via ``@tauri-apps/plugin-process``), so this Promise is
 * expected to never resolve in the happy path.
 */
function downloadAndInstall(): Promise<void> {
  if (inFlightInstall) return inFlightInstall
  if (!isTauriRuntime()) {
    return Promise.reject(new Error('自动更新仅在桌面端可用'))
  }

  const operation = performDownloadAndInstall()
  inFlightInstall = operation
  const clearInFlight = () => {
    if (inFlightInstall === operation) inFlightInstall = null
  }
  operation.then(clearInFlight, clearInFlight)
  return operation
}

async function performDownloadAndInstall(): Promise<void> {
  installing.value = true
  downloadProgress.value = 0
  installPhase.value = 'connecting'
  installError.value = ''
  let update: Update | null = null
  let releasedConsumedUpdate = false
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    // Preserve the native Update resource returned by the successful check.
    // Re-checking here used to make a click on "立即更新" look unresponsive
    // whenever the second manifest request hung.
    update = cachedUpdate ?? await (async () => {
      await checkForUpdate()
      return cachedUpdate
    })()
    if (!update) {
      throw new Error('当前已是最新版本')
    }
    installPhase.value = 'downloading'
    installingUpdateResource = update
    const progressState: { contentLength?: number; downloadedBytes: number } = { downloadedBytes: 0 }
    appLogger.info('[update] install start', { version: update.version }, { persist: true })
    // Keep timeout ownership with the native updater. A JavaScript timeout
    // would only reject the UI promise while native download/install could
    // continue and later launch an installer unexpectedly.
    await update.downloadAndInstall(event => trackDownloadProgress(event, progressState), {
      timeout: UPDATE_DOWNLOAD_TIMEOUT_MS,
    })
    downloadProgress.value = 100
    installPhase.value = 'relaunching'
    if (cachedUpdate === update) cachedUpdate = null
    releaseUpdate(update)
    releasedConsumedUpdate = true
    appLogger.info('[update] install complete, relaunching', undefined, { persist: true })
    // downloadAndInstall triggers relaunch on completion - the call below
    // is a fallback if the platform doesn't auto-relaunch.
    await relaunch()
  } catch (err) {
    const failedPhase = installPhase.value
    installPhase.value = 'failed'
    installError.value = formatUpdateError(err, '更新')
    appLogger.error(`[update] install failed during ${failedPhase}`, err, { persist: true })
    throw err
  } finally {
    if (installingUpdateResource === update) {
      installingUpdateResource = null
    }
    if (update && !releasedConsumedUpdate && cachedUpdate !== update) {
      releaseUpdate(update)
    }
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
    installPhase,
    installError,
    checkForUpdate,
    downloadAndInstall,
  }
}
