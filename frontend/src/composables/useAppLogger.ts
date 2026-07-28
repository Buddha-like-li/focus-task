/**
 * v2.3.1: Frontend logger that mirrors records to ``frontend.log`` in the
 * desktop app log dir.
 *
 * Why: before v2.3.1 the frontend only used ``console.*`` - once the webview
 * closed, the records were gone, so the user couldn't ship a log file back
 * for offline diagnosis. The Tauri shell now exposes an ``append_log``
 * command that appends a line to ``%LOCALAPPDATA%\\com.focustask.desktop\\
 * logs\\frontend.log`` (Windows).
 *
 * Design:
 *  - Singleton (not a ``useXxx`` composable) - there's exactly one log stream
 *    per app, so importers do ``import { appLogger } from '@/composables/useAppLogger'``.
 *  - Sync in-memory ring buffer (200 entries) + async fire-and-forget persist.
 *    Logging must never block the UI or throw, so ``persist`` swallows errors
 *    and the buffer is always available for a crash report / devtools dump.
 *  - Non-Tauri (web dev / browser) only writes to ``console`` - no file.
 *  - ``extra`` is JSON-stringified; ``Error`` objects are stringified with
 *    their stack so the log file actually helps debugging.
 *
 * Levels: debug / info / warn / error. Persist only warn/error to the file by
 * default (debug/info stay in-memory + console) to keep the log file small.
 * Callers that need an info record persisted (e.g. app mount) can pass
 * ``{ persist: true }`` as the third arg.
 */
import { isTauriRuntime } from '@/utils/platform'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogOptions {
  /** Force persist this record to frontend.log even at debug/info level. */
  persist?: boolean
}

const MAX_IN_MEMORY = 200
const inMemoryBuffer: string[] = []

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    const stack = value.stack ? `\n${value.stack}` : ''
    return `${value.name}: ${value.message}${stack}`
  }
  if (typeof value === 'string') return value
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function format(level: LogLevel, message: string, extra?: unknown): string {
  const ts = new Date().toISOString()
  const extraStr = extra !== undefined ? ` ${safeStringify(extra)}` : ''
  return `[${ts}] [${level}] ${message}${extraStr}`
}

async function persist(level: LogLevel, line: string): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('append_log', { level, message: line })
  } catch {
    // Tauri invoke can fail in dev (command not registered yet) or if the
    // log dir is unwritable. Swallow - logging must never throw.
  }
}

function log(level: LogLevel, message: string, extra?: unknown, opts?: LogOptions): void {
  const line = format(level, message, extra)
  inMemoryBuffer.push(line)
  if (inMemoryBuffer.length > MAX_IN_MEMORY) inMemoryBuffer.shift()

  // Mirror to console so devtools still shows records during development.
  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'debug'
          ? console.debug
          : console.log
  fn(line)

  // Persist by default only for warn/error; info/debug stay in-memory unless
  // explicitly requested. This keeps frontend.log focused on failures.
  const shouldPersist = opts?.persist ?? (level === 'warn' || level === 'error')
  if (shouldPersist) {
    void persist(level, line)
  }
}

export const appLogger = {
  debug: (msg: string, extra?: unknown, opts?: LogOptions) => log('debug', msg, extra, opts),
  info: (msg: string, extra?: unknown, opts?: LogOptions) => log('info', msg, extra, opts),
  warn: (msg: string, extra?: unknown, opts?: LogOptions) => log('warn', msg, extra, opts),
  error: (msg: string, extra?: unknown, opts?: LogOptions) => log('error', msg, extra, opts),
  /** Returns a snapshot of the in-memory ring buffer (for crash reports). */
  buffer: (): string[] => inMemoryBuffer.slice(),
}
