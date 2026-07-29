import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./platform', () => ({
  isTauriRuntime: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './platform'
import {
  reportDocumentFilename,
  reportExportFilename,
  revealReportMarkdownFile,
  saveReportMarkdownFile,
} from './reportFileActions'

describe('report file actions', () => {
  const createObjectUrl = vi.fn(() => 'blob:focus-task-report')
  const revokeObjectUrl = vi.fn()
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    })
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('uses task id and snapshot time for a stable per-document filename', () => {
    expect(reportDocumentFilename(42, '2026-07-21T17:56:12.000Z'))
      .toBe('task-42-2026-07-21T17-56-12-000Z.md')
    expect(reportDocumentFilename(0, '')).toBe('task-unknown-snapshot.md')
  })

  it('keeps report exports distinct by their period and anchor', () => {
    expect(reportExportFilename('monthly', '2026-07', '月报.md'))
      .toBe('monthly-2026-07-月报.md')
  })

  it('saves through the native command without revealing for a download action', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)

    await expect(saveReportMarkdownFile('task-42.md', '# body')).resolves.toBe('desktop')

    expect(invoke).toHaveBeenCalledWith('save_report_markdown', {
      filename: 'task-42.md',
      markdown: '# body',
    })
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('asks the native command to reveal a file after saving it', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)

    await saveReportMarkdownFile('task-42.md', '# body', { reveal: true })

    expect(invoke).toHaveBeenCalledWith('save_and_reveal_report_markdown', {
      filename: 'task-42.md',
      markdown: '# body',
    })
  })

  it('reveals an existing desktop file without sending Markdown back to native code', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)

    await expect(revealReportMarkdownFile('task-42.md', '# ignored')).resolves.toBe('desktop')

    expect(invoke).toHaveBeenCalledWith('reveal_report_markdown', {
      filename: 'task-42.md',
    })
  })

  it('falls back to a browser download when no Tauri shell is available', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false)

    await expect(saveReportMarkdownFile('task-42.md', '# body', { reveal: true }))
      .resolves.toBe('browser')

    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:focus-task-report')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('uses a browser download instead of claiming folder access outside Tauri', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false)

    await expect(revealReportMarkdownFile('task-42.md', '# body')).resolves.toBe('browser')

    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(invoke).not.toHaveBeenCalled()
  })
})
