import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'

const mocks = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(),
  check: vi.fn(),
  relaunch: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    buffer: vi.fn(),
  },
}))

vi.mock('@/utils/platform', () => ({
  isTauriRuntime: mocks.isTauriRuntime,
}))

vi.mock('@/composables/useAppLogger', () => ({
  appLogger: mocks.logger,
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mocks.check,
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: mocks.relaunch,
}))

type UpdaterModule = typeof import('./useAppUpdate')

let updater: UpdaterModule

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

function updateResource(overrides: Partial<Update> = {}): Update {
  return {
    version: '2.3.5',
    body: 'Release notes',
    date: '2026-07-29T00:00:00.000Z',
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Update
}

describe('useAppUpdate', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.isTauriRuntime.mockReturnValue(true)
    updater = await import('./useAppUpdate')
  })

  it('does not let a pending silent check occupy the manual checking state', async () => {
    const pending = deferred<Update | null>()
    mocks.check.mockReturnValueOnce(pending.promise)
    const { checkForUpdate, checking, lastChecked } = updater.useAppUpdate()

    const result = checkForUpdate({ silent: true })
    await vi.waitFor(() => {
      expect(mocks.check).toHaveBeenCalledWith({ timeout: updater.UPDATE_CHECK_TIMEOUT_MS })
    })

    expect(checking.value).toBe(false)
    expect(lastChecked.value).toBeNull()

    pending.resolve(null)
    await expect(result).resolves.toBeNull()
    expect(checking.value).toBe(false)
  })

  it('starts a fresh manual native check after a silent check times out', async () => {
    const manualPending = deferred<Update | null>()
    mocks.check
      .mockRejectedValueOnce(new Error('request timed out'))
      .mockReturnValueOnce(manualPending.promise)
    const { checkForUpdate, checking, lastChecked } = updater.useAppUpdate()

    await expect(checkForUpdate({ silent: true })).resolves.toBeNull()
    expect(checking.value).toBe(false)
    expect(lastChecked.value).toBeNull()
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[update] silent check timed out',
      { timeoutMs: updater.SILENT_UPDATE_CHECK_TIMEOUT_MS },
      { persist: true },
    )

    const manualResult = checkForUpdate()
    await vi.waitFor(() => {
      expect(mocks.check).toHaveBeenCalledTimes(2)
    })
    expect(mocks.check).toHaveBeenLastCalledWith({ timeout: updater.UPDATE_CHECK_TIMEOUT_MS })
    expect(checking.value).toBe(true)
    manualPending.resolve(null)
    await expect(manualResult).resolves.toBeNull()
    expect(checking.value).toBe(false)
  })

  it('reuses the Update resource from a successful check instead of checking again', async () => {
    const update = updateResource()
    mocks.check.mockResolvedValueOnce(update)
    const { checkForUpdate, downloadAndInstall } = updater.useAppUpdate()

    await expect(checkForUpdate()).resolves.toEqual({
      version: '2.3.5',
      body: 'Release notes',
      date: '2026-07-29T00:00:00.000Z',
    })
    await downloadAndInstall()

    expect(mocks.check).toHaveBeenCalledTimes(1)
    expect(update.downloadAndInstall).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: updater.UPDATE_DOWNLOAD_TIMEOUT_MS },
    )
    expect(mocks.relaunch).toHaveBeenCalledTimes(1)
    expect(update.close).toHaveBeenCalledTimes(1)
    expect(mocks.logger.info).toHaveBeenCalledWith(
      '[update] install start',
      { version: '2.3.5' },
      { persist: true },
    )
  })

  it('accumulates updater chunk lengths against Started.contentLength', async () => {
    const completion = deferred<void>()
    let onEvent: ((event: DownloadEvent) => void) | undefined
    const update = updateResource({
      downloadAndInstall: vi.fn((callback: (event: DownloadEvent) => void) => {
        onEvent = callback
        return completion.promise
      }),
    })
    mocks.check.mockResolvedValueOnce(update)
    const { checkForUpdate, downloadAndInstall, downloadProgress, installPhase } = updater.useAppUpdate()

    await checkForUpdate()
    const installation = downloadAndInstall()
    const duplicateInstallation = downloadAndInstall()
    expect(duplicateInstallation).toBe(installation)
    await vi.waitFor(() => {
      expect(onEvent).toBeTypeOf('function')
    })

    onEvent?.({ event: 'Started', data: { contentLength: 1_000 } })
    onEvent?.({ event: 'Progress', data: { chunkLength: 100 } })
    onEvent?.({ event: 'Progress', data: { chunkLength: 250 } })
    expect(downloadProgress.value).toBe(35)
    expect(installPhase.value).toBe('downloading')

    onEvent?.({ event: 'Finished' })
    expect(installPhase.value).toBe('installing')
    completion.resolve()
    await installation
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1)
    expect(downloadProgress.value).toBe(100)
    expect(installPhase.value).toBe('relaunching')
  })

  it('surfaces and persists an install failure with its phase', async () => {
    const failure = new Error('connection refused')
    const update = updateResource({
      downloadAndInstall: vi.fn().mockRejectedValue(failure),
    })
    mocks.check.mockResolvedValueOnce(update)
    const { checkForUpdate, downloadAndInstall, installing, installPhase, installError } = updater.useAppUpdate()

    await checkForUpdate()
    await expect(downloadAndInstall()).rejects.toBe(failure)

    expect(installing.value).toBe(false)
    expect(installPhase.value).toBe('failed')
    expect(installError.value).toContain('GitHub')
    expect(mocks.logger.error).toHaveBeenCalledWith(
      '[update] install failed during downloading',
      failure,
      { persist: true },
    )
  })

  it.each([
    'request timed out',
    'Failed to fetch',
    'error sending request for url',
    'connection refused',
  ])('formats common network error as an actionable message: %s', message => {
    expect(updater.formatUpdateError(new Error(message))).toContain('GitHub')
  })
})
