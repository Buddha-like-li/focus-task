import { isTauriRuntime } from './platform'

export interface ReportFileSaveOptions {
  reveal?: boolean
}

export type ReportFileSaveDestination = 'desktop' | 'browser'

/**
 * Builds a deterministic filename without relying on a task title supplied by
 * the service. The native command performs the final filename validation.
 */
export function reportDocumentFilename(taskId: number, snapshotAt: string): string {
  const id = Number.isSafeInteger(taskId) && taskId > 0 ? String(taskId) : 'unknown'
  const timestamp = snapshotAt
    .trim()
    .replace(/[^0-9A-Za-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return `task-${id}-${timestamp || 'snapshot'}.md`
}

export function reportExportFilename(period: string, anchor: string, reportFilename: string): string {
  const safePeriod = period || 'report'
  const safeAnchor = anchor || 'current'
  const safeName = reportFilename || 'report.md'
  return `${safePeriod}-${safeAnchor}-${safeName}`
}

function downloadMarkdownInBrowser(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Saves Markdown through the desktop shell so it has a known Windows path.
 * Browser development has no native folder access, so it keeps the normal
 * browser download behavior instead.
 */
export async function saveReportMarkdownFile(
  filename: string,
  markdown: string,
  options: ReportFileSaveOptions = {},
): Promise<ReportFileSaveDestination> {
  if (!isTauriRuntime()) {
    downloadMarkdownInBrowser(filename, markdown)
    return 'browser'
  }

  const { invoke } = await import('@tauri-apps/api/core')
  await invoke(
    options.reveal ? 'save_and_reveal_report_markdown' : 'save_report_markdown',
    { filename, markdown },
  )
  return 'desktop'
}

/**
 * Locates a previously saved report file. The desktop command accepts only a
 * filename and resolves it below Documents\\Focus Task\\Reports itself.
 */
export async function revealReportMarkdownFile(
  filename: string,
  browserFallbackMarkdown: string,
): Promise<ReportFileSaveDestination> {
  if (!isTauriRuntime()) {
    downloadMarkdownInBrowser(filename, browserFallbackMarkdown)
    return 'browser'
  }

  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('reveal_report_markdown', { filename })
  return 'desktop'
}
