import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia } from 'pinia'

vi.mock('@/api', () => ({
  getReportMarkdownFiles: vi.fn(),
  exportReport: vi.fn(),
  downloadTaskAttachment: vi.fn(),
}))

vi.mock('@/utils/reportFileActions', () => ({
  reportDocumentFilename: vi.fn(() => 'task-42-2026-07-21.md'),
  reportExportFilename: vi.fn(() => 'monthly-2026-07-月报.md'),
  saveReportMarkdownFile: vi.fn(),
}))

import * as api from '@/api'
import { reportExportFilename, saveReportMarkdownFile } from '@/utils/reportFileActions'
import ReportsView from './ReportsView.vue'

const markdownFile = {
  taskId: 42,
  title: '报告文档',
  status: '进行中',
  owner: '测试用户',
  snapshotReason: 'content',
  snapshotAt: '2026-07-21T17:56:00Z',
  markdown: '# 文档正文',
  exportPath: 'C:\\container-only\\exports\\42',
}

function reportsResponse() {
  return {
    period: 'monthly',
    anchor: '2026-07',
    label: '2026 年 7 月',
    start: '2026-07-01T00:00:00Z',
    end: '2026-07-31T23:59:59Z',
    files: [markdownFile],
  }
}

describe('ReportsView file actions', () => {
  let app: ReturnType<typeof createApp> | null = null
  let mountPoint: HTMLDivElement | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getReportMarkdownFiles).mockResolvedValue(reportsResponse())
    vi.mocked(api.exportReport).mockResolvedValue({
      period: 'monthly',
      anchor: '2026-07',
      label: '2026 年 7 月',
      reportFilename: '月报.md',
      generatedAt: '2026-07-21T17:56:00Z',
      taskCount: 1,
      reportText: '# 月报',
      regenerated: false,
    })
    vi.mocked(saveReportMarkdownFile).mockResolvedValue('desktop')

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(ReportsView)
    app.use(createPinia())
    app.mount(mountPoint)
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    document.querySelector('.md-preview-overlay')?.remove()
    app = null
    mountPoint = null
  })

  it('saves and reveals the current task document without forwarding the service export path', async () => {
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>('button[aria-label="下载到本机"]')).not.toBeNull()
    })

    document.querySelector<HTMLButtonElement>('button[aria-label="下载到本机"]')!.click()
    await vi.waitFor(() => {
      expect(saveReportMarkdownFile).toHaveBeenCalledWith(
        'task-42-2026-07-21.md',
        '# 文档正文',
      )
    })
    const revealButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="保存并打开任务文档所在文件夹"]',
    )!
    await vi.waitFor(() => {
      expect(revealButton.disabled).toBe(false)
    })
    revealButton.click()
    await vi.waitFor(() => {
      expect(saveReportMarkdownFile).toHaveBeenLastCalledWith(
        'task-42-2026-07-21.md',
        '# 文档正文',
        { reveal: true },
      )
    })
    expect(JSON.stringify(vi.mocked(saveReportMarkdownFile).mock.calls)).not.toContain(markdownFile.exportPath)
  })

  it('saves and reveals an exported report through the local file action', async () => {
    document.querySelector<HTMLButtonElement>('.docs-btn')!.click()
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>('.docs-btn-ghost')).not.toBeNull()
    })

    document.querySelector<HTMLButtonElement>('.docs-btn-ghost')!.click()
    await vi.waitFor(() => {
      expect(reportExportFilename).toHaveBeenCalledWith('monthly', '2026-07', '月报.md')
      expect(saveReportMarkdownFile).toHaveBeenCalledWith(
        'monthly-2026-07-月报.md',
        '# 月报',
        { reveal: true },
      )
    })
  })

  it('prevents duplicate report downloads while a save is pending', async () => {
    document.querySelector<HTMLButtonElement>('.docs-btn')!.click()
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>('.docs-btn-ghost')).not.toBeNull()
    })

    let releaseSave!: (destination: 'desktop') => void
    vi.mocked(saveReportMarkdownFile).mockImplementationOnce(
      () => new Promise<'desktop'>(resolve => { releaseSave = resolve }),
    )

    const downloadButton = document.querySelector<HTMLButtonElement>('.docs-btn-ghost')!
    downloadButton.click()
    downloadButton.click()

    await vi.waitFor(() => {
      expect(saveReportMarkdownFile).toHaveBeenCalledTimes(1)
      expect(downloadButton.disabled).toBe(true)
    })

    releaseSave('desktop')
    await vi.waitFor(() => {
      expect(downloadButton.disabled).toBe(false)
    })
  })

  it('prevents duplicate save-and-reveal clicks while the first save is pending', async () => {
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLButtonElement>(
          'button[aria-label="保存并打开任务文档所在文件夹"]',
        ),
      ).not.toBeNull()
    })

    let releaseSave!: (destination: 'desktop') => void
    vi.mocked(saveReportMarkdownFile).mockImplementationOnce(
      () => new Promise<'desktop'>(resolve => { releaseSave = resolve }),
    )

    const revealButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="保存并打开任务文档所在文件夹"]',
    )!
    revealButton.click()
    revealButton.click()

    await vi.waitFor(() => {
      expect(saveReportMarkdownFile).toHaveBeenCalledTimes(1)
      expect(revealButton.disabled).toBe(true)
    })

    releaseSave('desktop')
    await vi.waitFor(() => {
      expect(revealButton.disabled).toBe(false)
    })
  })
})
