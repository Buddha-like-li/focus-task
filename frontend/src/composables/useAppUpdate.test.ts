import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/platform', () => ({
  isTauriRuntime: vi.fn(),
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

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

import { isTauriRuntime } from '@/utils/platform'
import { appLogger } from '@/composables/useAppLogger'
import { check } from '@tauri-apps/plugin-updater'
import {
  formatUpdateError,
  SILENT_UPDATE_CHECK_TIMEOUT_MS,
  useAppUpdate,
} from './useAppUpdate'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(innerResolve => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

describe('useAppUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(isTauriRuntime).mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('quietly ends a silent check after 15 seconds without marking it current', async () => {
    const pending = deferred<null>()
    vi.mocked(check).mockReturnValue(pending.promise)
    const { checkForUpdate, checking, lastChecked, updateInfo } = useAppUpdate()

    const result = checkForUpdate({ silent: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(SILENT_UPDATE_CHECK_TIMEOUT_MS)

    await expect(result).resolves.toBeNull()
    expect(checking.value).toBe(false)
    expect(lastChecked.value).toBeNull()
    expect(updateInfo.value).toEqual({ version: '', body: '' })
    expect(appLogger.warn).toHaveBeenCalledWith('[update] silent check timed out', {
      timeoutMs: SILENT_UPDATE_CHECK_TIMEOUT_MS,
    })

    pending.resolve(null)
    await pending.promise
    await Promise.resolve()
  })

  it('does not apply the silent timeout to a manual check', async () => {
    const pending = deferred<null>()
    vi.mocked(check).mockReturnValue(pending.promise)
    const { checkForUpdate, checking } = useAppUpdate()

    const result = checkForUpdate()
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(SILENT_UPDATE_CHECK_TIMEOUT_MS)

    expect(checking.value).toBe(true)
    expect(appLogger.warn).not.toHaveBeenCalled()

    pending.resolve(null)
    await expect(result).resolves.toBeNull()
    await pending.promise
    await Promise.resolve()
  })

  it('reuses the pending updater check when a manual check follows a silent timeout', async () => {
    const pending = deferred<null>()
    vi.mocked(check).mockReturnValue(pending.promise)
    const { checkForUpdate, checking } = useAppUpdate()

    const silentResult = checkForUpdate({ silent: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(SILENT_UPDATE_CHECK_TIMEOUT_MS)
    await expect(silentResult).resolves.toBeNull()
    expect(checking.value).toBe(false)

    const manualResult = checkForUpdate()
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
    expect(checking.value).toBe(true)

    pending.resolve(null)
    await expect(manualResult).resolves.toBeNull()
    expect(checking.value).toBe(false)
    await pending.promise
    await Promise.resolve()
  })

  it.each([
    'request timed out',
    'Failed to fetch',
    'error sending request for url',
    'connection refused',
  ])('formats common network error as an actionable Chinese message: %s', message => {
    expect(formatUpdateError(new Error(message))).toBe(
      '检查更新失败：网络无法访问 GitHub（请检查代理或网络）',
    )
  })
})
