import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, reactive } from 'vue'

vi.mock('@/api', () => ({
  downloadTaskAttachment: vi.fn(),
  uploadTaskAttachment: vi.fn(),
}))

import ContentModal from './ContentModal.vue'

describe('ContentModal save failures', () => {
  let app: ReturnType<typeof createApp> | null = null
  let mountPoint: HTMLDivElement | null = null

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    document.querySelector('.content-modal-overlay')?.remove()
    app = null
    mountPoint = null
  })

  it('keeps the edited Markdown draft and shows a recoverable error when saving fails', async () => {
    const saveContent = vi.fn().mockRejectedValue(new Error('本地服务暂时不可用'))
    const props = reactive({
      open: false,
      initialContent: '原始内容',
      saveContent,
    })

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    const Root = defineComponent({
      setup: () => () => h(ContentModal, props),
    })
    app = createApp(Root)
    app.mount(mountPoint)
    props.open = true

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLTextAreaElement>('.md-editor')?.value).toBe('原始内容')
    })

    const editor = document.querySelector<HTMLTextAreaElement>('.md-editor')!
    editor.value = '保留这段草稿'
    editor.dispatchEvent(new Event('input', { bubbles: true }))

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>('.content-modal .primary')?.disabled).toBe(false)
    })
    document.querySelector<HTMLButtonElement>('.content-modal .primary')?.click()

    await vi.waitFor(() => {
      expect(saveContent).toHaveBeenCalledWith('保留这段草稿')
      expect(document.querySelector('.save-error')?.textContent).toContain('本地服务暂时不可用')
    })
    expect(editor.value).toBe('保留这段草稿')
  })

  it('keeps the draft when the parent returns a recoverable save error', async () => {
    const saveContent = vi.fn().mockResolvedValue('服务拒绝写入，请重试。')
    const props = reactive({
      open: false,
      initialContent: '原始内容',
      saveContent,
    })
    const Root = defineComponent({
      setup: () => () => h(ContentModal, props),
    })

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(Root)
    app.mount(mountPoint)
    props.open = true

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLTextAreaElement>('.md-editor')?.value).toBe('原始内容')
    })

    const editor = document.querySelector<HTMLTextAreaElement>('.md-editor')!
    editor.value = '需要保留的导入内容'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>('.content-modal .primary')?.disabled).toBe(false)
    })
    document.querySelector<HTMLButtonElement>('.content-modal .primary')?.click()

    await vi.waitFor(() => {
      expect(saveContent).toHaveBeenCalledWith('需要保留的导入内容')
      expect(document.querySelector('.save-error')?.textContent).toContain('服务拒绝写入')
    })
    expect(editor.value).toBe('需要保留的导入内容')
  })
})
