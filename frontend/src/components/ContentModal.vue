<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="content-modal-overlay" @click.self="onOverlayClick">
        <div class="content-modal">
          <header class="modal-header">
            <div class="modal-title-row">
              <span class="modal-title">具体内容</span>
              <span class="modal-subtitle">{{ taskTitle || '未命名任务' }}</span>
            </div>
            <div class="modal-toolbar">
              <button type="button" @click="chooseImageFile" title="插入图片">插入图片</button>
              <button type="button" @click="chooseMarkdownFile" title="导入 Markdown 文件">导入 MD</button>
              <div class="view-toggle">
                <button type="button" :class="{ active: mode === 'split' }" @click="mode = 'split'" title="分栏">分栏</button>
                <button type="button" :class="{ active: mode === 'edit' }" @click="mode = 'edit'" title="仅编辑">编辑</button>
                <button type="button" :class="{ active: mode === 'preview' }" @click="mode = 'preview'" title="仅预览">预览</button>
              </div>
              <button type="button" class="primary" :disabled="!dirty || saving" @click="save">
                {{ saving ? '保存中...' : (dirty ? '保存' : '已保存') }}
              </button>
              <button type="button" class="close-btn" @click="close" title="关闭">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
                  <path d="M4 4L12 12M12 4L4 12"/>
                </svg>
              </button>
            </div>
          </header>
          <div class="modal-body" :class="mode">
            <textarea
              v-show="mode !== 'preview'"
              ref="editorEl"
              v-model="draft"
              class="md-editor"
              placeholder="使用 Markdown 编写具体内容…&#10;支持直接粘贴图片（Ctrl+V）"
              @input="onInput"
              @paste="onPaste"
            ></textarea>
            <div v-show="mode !== 'edit'" class="md-preview" v-html="rendered"></div>
          </div>
          <footer class="modal-footer">
            <span class="footer-hint">{{ footerHint }}</span>
            <span v-if="saveError" class="save-error" role="alert">{{ saveError }}</span>
            <span class="footer-stats">{{ stats }}</span>
          </footer>
          <input ref="mdFileInput" class="hidden-input" type="file" accept=".md,.markdown,text/markdown,text/plain" @change="importMarkdown" />
          <input ref="imgFileInput" class="hidden-input" type="file" accept="image/*" @change="insertImageFile" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { marked } from 'marked'
import * as api from '@/api'

export interface TaskMeta {
  createdAt: string
  updatedAt: string
  title: string
  status: string
  owner: string
}

const props = defineProps<{
  open: boolean
  initialContent: string
  taskId?: number
  taskTitle?: string
  taskMeta?: TaskMeta | null
  initiallySaved?: boolean
  saveContent?: (content: string) => Promise<string | null>
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const draft = ref('')
const savedContent = ref('')
const mode = ref<'split' | 'edit' | 'preview'>('split')
const editorEl = ref<HTMLTextAreaElement | null>(null)
const mdFileInput = ref<HTMLInputElement | null>(null)
const imgFileInput = ref<HTMLInputElement | null>(null)
const uploadingImage = ref(false)
const imageError = ref('')
const saving = ref(false)
const saveError = ref('')

// Cache of attachment-id -> blob URL, so pasted images render in the preview.
const attachmentUrls = ref<Record<string, string>>({})

const dirty = computed(() => draft.value !== savedContent.value)

const footerHint = computed(() => {
  if (saveError.value) return '内容尚未保存'
  if (imageError.value) return imageError.value
  if (uploadingImage.value) return '正在上传图片…'
  return dirty.value ? '有未保存的修改' : '内容已是最新'
})

const documentHeader = computed(() => {
  const m = props.taskMeta
  if (!m) return ''
  // Meta info as a code-block "header comment" at the top of the document,
  // mirroring the style of 参考0.md: fenced block + horizontal rule + body.
  const lines: string[] = ['```']
  lines.push(`创建时间：${formatMeta(m.createdAt)}`)
  lines.push(`最近变更时间：${formatMeta(m.updatedAt)}`)
  lines.push(`状态：${m.status}`)
  if (m.owner) lines.push(`负责人：${m.owner}`)
  lines.push('```')
  lines.push('')
  lines.push('***')
  lines.push('')
  return lines.join('\n')
})

// The full document = meta header + user content, with attachment refs resolved.
const fullDocument = computed(() => {
  const header = documentHeader.value
  const body = draft.value || ''
  return header + body
})

const rendered = computed(() => {
  let source = fullDocument.value
  if (!draft.value && !documentHeader.value) {
    return '<p class="md-empty">暂无具体内容，点击编辑区开始书写。</p>'
  }
  // Resolve ![alt](attachment:ID) into blob URLs for inline image rendering.
  source = source.replace(/!\[([^\]]*)\]\(attachment:([0-9a-f]+__[^\)]+)\)/g, (match, alt, id) => {
    const url = attachmentUrls.value[id]
    return url ? `![${alt}](${url})` : match
  })
  return marked.parse(source, { async: false }) as string
})

const stats = computed(() => {
  const text = draft.value
  const chars = text.length
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const lines = text ? text.split('\n').length : 0
  return `${chars} 字符 · ${words} 词 · ${lines} 行`
})

function formatMeta(iso: string): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return iso
  }
}

watch(
  () => props.open,
  isOpen => {
    if (isOpen) {
      draft.value = props.initialContent || ''
      savedContent.value = props.initiallySaved === false ? '' : (props.initialContent || '')
      imageError.value = ''
      saveError.value = ''
      loadEmbeddedAttachments()
      nextTick(() => editorEl.value?.focus())
    } else {
      // Revoke blob URLs when closing to free memory.
      Object.values(attachmentUrls.value).forEach(url => URL.revokeObjectURL(url))
      attachmentUrls.value = {}
    }
  },
)

watch(
  () => props.initialContent,
  content => {
    if (!dirty.value) {
      draft.value = content || ''
      savedContent.value = props.initiallySaved === false ? '' : (content || '')
      loadEmbeddedAttachments()
    }
  },
)

// Scan the document for attachment:ID references and load their blob URLs.
async function loadEmbeddedAttachments() {
  if (!props.taskId) return
  const ids = new Set<string>()
  const re = /!\[[^\]]*\]\(attachment:([0-9a-f]+__[^\)]+)\)/g
  let match: RegExpExecArray | null
  const source = draft.value
  while ((match = re.exec(source)) !== null) {
    ids.add(match[1])
  }
  for (const id of ids) {
    if (!attachmentUrls.value[id]) {
      await loadAttachmentUrl(id)
    }
  }
}

async function loadAttachmentUrl(id: string) {
  if (!props.taskId) return
  try {
    const blob = await api.downloadTaskAttachment(props.taskId, id)
    attachmentUrls.value = { ...attachmentUrls.value, [id]: URL.createObjectURL(blob) }
  } catch {
    // Attachment may have been deleted; leave the ref unresolved.
  }
}

function onInput() {
  // Draft is bound via v-model. An earlier failed save no longer describes
  // the changed draft, so let the next explicit save determine its status.
  saveError.value = ''
}

async function save() {
  if (!dirty.value || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const error = props.saveContent
      ? await props.saveContent(draft.value)
      : '无法保存内容：缺少服务保存处理。'
    if (error) {
      saveError.value = error
      return
    }
    savedContent.value = draft.value
  } catch (error) {
    saveError.value = error instanceof Error
      ? error.message
      : '无法保存内容，请确认本地服务正在运行后重试。'
  } finally {
    saving.value = false
  }
}

function close() {
  if (dirty.value && !window.confirm('有未保存的修改，确定关闭吗？')) return
  emit('close')
}

function onOverlayClick() {
  close()
}

function chooseMarkdownFile() {
  mdFileInput.value?.click()
}

function chooseImageFile() {
  imgFileInput.value?.click()
}

async function importMarkdown(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  draft.value = await file.text()
  await loadEmbeddedAttachments()
  if (mdFileInput.value) mdFileInput.value.value = ''
}

async function insertImageFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await uploadAndInsertImage(file)
  if (imgFileInput.value) imgFileInput.value.value = ''
}

// Paste handler: detect images in the clipboard and upload them.
async function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        event.preventDefault()
        await uploadAndInsertImage(file)
        return
      }
    }
  }
}

// Upload an image as a task attachment, then insert a Markdown image ref at
// the cursor position. The ref uses attachment:ID so it survives reloads and
// renders via a blob URL loaded from the backend.
async function uploadAndInsertImage(file: File) {
  imageError.value = ''
  if (!props.taskId) {
    // The modal should only open once the task is persisted; if we get here
    // the parent could not save it. Tell the user exactly what to do next.
    imageError.value = '任务尚未保存到后端，无法插入图片。请关闭此窗口、确认后端服务已启动后再次打开。'
    return
  }
  uploadingImage.value = true
  try {
    const attachment = await api.uploadTaskAttachment(props.taskId, file)
    const id = attachment.id
    const blob = await api.downloadTaskAttachment(props.taskId, id)
    attachmentUrls.value = { ...attachmentUrls.value, [id]: URL.createObjectURL(blob) }
    const alt = file.name.replace(/\.[^.]+$/, '') || '图片'
    insertAtCursor(`![${alt}](attachment:${id})\n`)
  } catch (error) {
    imageError.value = error instanceof Error ? error.message : '图片上传失败'
  } finally {
    uploadingImage.value = false
  }
}

function insertAtCursor(text: string) {
  const el = editorEl.value
  if (!el) {
    draft.value += text
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  draft.value = draft.value.slice(0, start) + text + draft.value.slice(end)
  nextTick(() => {
    const pos = start + text.length
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) close()
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && props.open) {
    e.preventDefault()
    save()
  }
}

watch(
  () => props.open,
  isOpen => {
    if (isOpen) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

onBeforeUnmount(() => {
  Object.values(attachmentUrls.value).forEach(url => URL.revokeObjectURL(url))
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.content-modal-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 0.35);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 2000;
  padding: 32px;
}
.content-modal {
  width: 100%;
  max-width: 1100px;
  height: 100%;
  max-height: 760px;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: 0 32px 80px oklch(0% 0 0 / 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
  gap: 12px;
  flex-shrink: 0;
}
.modal-title-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.modal-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.modal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.modal-toolbar > button {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition);
}
.modal-toolbar > button:hover { color: var(--text-primary); border-color: oklch(60% 0.12 240); }
.modal-toolbar > button.primary {
  background: oklch(47% 0.12 240);
  color: white;
  border-color: transparent;
  font-weight: 600;
}
.modal-toolbar > button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-toolbar .close-btn {
  width: 30px; height: 30px; padding: 0;
  display: grid; place-items: center;
  border: none; background: transparent;
}
.modal-toolbar .close-btn:hover { background: var(--surface-mid); }

.view-toggle {
  display: flex;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.view-toggle button {
  border: none;
  border-radius: 0;
  background: var(--surface);
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}
.view-toggle button.active {
  background: oklch(95% 0.015 240);
  color: oklch(35% 0.1 240);
  font-weight: 600;
}

.modal-body {
  flex: 1;
  display: grid;
  min-height: 0;
  overflow: hidden;
}
.modal-body.split {
  grid-template-columns: 1fr 1fr;
}
.modal-body.edit {
  grid-template-columns: 1fr;
}
.modal-body.preview {
  grid-template-columns: 1fr;
}
.md-editor {
  width: 100%;
  height: 100%;
  border: none;
  border-right: 1px solid var(--border-subtle);
  background: var(--surface-mid);
  padding: 18px 20px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  resize: none;
  outline: none;
  overflow-y: auto;
}
.modal-body.edit .md-editor { border-right: none; }
.md-preview {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 18px 24px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.modal-body.preview .md-preview { padding: 32px 48px; }
.md-preview :deep(h1), .md-preview :deep(h2), .md-preview :deep(h3) {
  margin: 0.8em 0 0.4em;
  font-weight: 650;
  line-height: 1.3;
}
.md-preview :deep(h1) { font-size: 1.6em; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.3em; }
.md-preview :deep(h2) { font-size: 1.35em; }
.md-preview :deep(h3) { font-size: 1.15em; }
.md-preview :deep(p) { margin: 0 0 0.7em; }
.md-preview :deep(ul), .md-preview :deep(ol) { margin: 0 0 0.7em; padding-left: 1.6em; }
.md-preview :deep(li) { margin: 0.2em 0; }
.md-preview :deep(code) {
  background: var(--surface-mid);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}
.md-preview :deep(pre) {
  background: var(--surface-mid);
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: 0 0 0.7em;
}
.md-preview :deep(pre code) { background: none; padding: 0; }
.md-preview :deep(blockquote) {
  border-left: 3px solid oklch(60% 0.12 240);
  margin: 0 0 0.7em;
  padding: 0.2em 0 1em;
  padding-left: 1em;
  color: var(--text-secondary);
}
.md-preview :deep(table) { border-collapse: collapse; margin: 0 0 0.7em; font-size: 13px; }
.md-preview :deep(th), .md-preview :deep(td) { border: 1px solid var(--border-subtle); padding: 6px 12px; }
.md-preview :deep(th) { background: var(--surface-mid); font-weight: 600; }
.md-preview :deep(img) { max-width: 100%; border-radius: var(--radius-sm); margin: 0.4em 0; }
.md-preview :deep(a) { color: oklch(45% 0.13 240); }
.md-preview :deep(hr) { border: none; border-top: 1px solid var(--border-subtle); margin: 1em 0; }
.md-preview :deep(.md-empty) { color: var(--text-muted); font-style: italic; }

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 18px;
  border-top: 1px solid var(--border-subtle);
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.save-error { color: oklch(48% 0.18 25); font-size: 12px; }
/* 错误提示可能很长：截断兜底，避免把右侧统计信息顶出。 */
.footer-hint {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.footer-stats { font-family: ui-monospace, monospace; flex-shrink: 0; }

.hidden-input { display: none; }

.modal-enter-active, .modal-leave-active { transition: opacity 200ms ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .content-modal, .modal-leave-active .content-modal { transition: transform 200ms cubic-bezier(0.2, 0, 0, 1); }
.modal-enter-from .content-modal, .modal-leave-to .content-modal { transform: scale(0.97); }
</style>
