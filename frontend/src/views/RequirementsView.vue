<template>
  <div class="req-page">
    <!-- Header -->
    <section class="req-topbar">
      <div class="req-heading">
        <span class="req-eyebrow">需求</span>
        <h1>需求池</h1>
        <p>未来计划做的事——先记下来，再立项。需求不进入四象限，不参与统计。</p>
      </div>
      <button class="primary-btn" @click="openCreate">＋ 新建需求</button>
    </section>

    <!-- List -->
    <section v-if="store.loading && !store.requirements.length" class="req-empty">
      <p>加载中…</p>
    </section>
    <section v-else-if="!store.requirements.length" class="req-empty">
      <div class="req-empty-icon">🗂️</div>
      <p>需求池还是空的。把"以后想做"的事先记在这里。</p>
    </section>
    <section v-else class="req-list">
      <article
        v-for="req in store.requirements"
        :key="req.id"
        class="req-card"
        @click="openEdit(req)"
      >
        <div class="req-card-main">
          <div class="req-card-title-row">
            <h3>{{ req.title || '（未命名需求）' }}</h3>
            <span v-if="req.bugCount && req.bugCount > 0" class="bug-badge" title="关联 Bug 数量">
              🐛 {{ req.bugCount }}
            </span>
          </div>
          <p v-if="req.content" class="req-card-excerpt">{{ excerpt(req.content) }}</p>
          <span class="req-card-time">更新于 {{ formatTime(req.updatedAt) }}</span>

          <!-- 关联任务区块（P5-2）-->
          <div class="req-linked" @click.stop>
            <button
              class="req-linked-toggle"
              :class="{ expanded: expandedReqId === req.id }"
              @click="toggleLinked(req.id)"
            >
              <span class="req-linked-caret">{{ expandedReqId === req.id ? '▾' : '▸' }}</span>
              关联任务 ({{ req.linkedTaskCount ?? 0 }})
            </button>
            <div v-if="expandedReqId === req.id" class="req-linked-body">
              <p v-if="linkedLoading" class="req-linked-hint">加载中…</p>
              <p v-else-if="linkedTasks.length === 0" class="req-linked-hint">暂无关联任务</p>
              <ul v-else class="req-linked-list">
                <li v-for="task in linkedTasks" :key="task.clientId">
                  <span class="req-linked-title" :title="task.title">{{ task.title || '未命名任务' }}</span>
                  <span class="req-linked-cat" :style="categoryStyle(task.category)">{{ task.category || '需求' }}</span>
                  <span class="req-linked-status" :style="statusBadgeStyle(task.status)">{{ task.status || '未开始' }}</span>
                  <button class="req-linked-jump" title="在矩阵中查看" @click="jumpToTask(task.clientId)">跳转</button>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div class="req-card-side">
          <span class="req-badge" :style="statusStyle(req.status)">{{ req.status }}</span>
          <span class="req-badge" :style="priorityStyle(req.priority)">{{ req.priority }}</span>
          <button
            type="button"
            class="req-promote"
            :disabled="promoting"
            title="转为四象限任务"
            @click.stop="openPromote(req)"
          >转为任务</button>
          <button type="button" class="req-delete" title="删除需求" :disabled="promoting" @click.stop="confirmDelete(req)">×</button>
        </div>
      </article>
    </section>

    <!-- Create / Edit modal -->
    <n-modal v-model:show="showEditor">
      <n-card style="max-width: 560px; width: 92vw" :title="editingId ? '编辑需求' : '新建需求'" :bordered="false">
        <div class="req-form">
          <label class="req-field">
            <span>标题</span>
            <input v-model="draft.title" class="req-input" placeholder="一句话描述这个需求" />
          </label>
          <div class="req-field-row">
            <label class="req-field">
              <span>状态</span>
              <select v-model="draft.status" class="req-input">
                <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <label class="req-field">
              <span>优先级</span>
              <select v-model="draft.priority" class="req-input">
                <option v-for="p in PRIORITY_OPTIONS" :key="p" :value="p">{{ p }}</option>
              </select>
            </label>
          </div>
          <label class="req-field">
            <span>内容（支持 Markdown）</span>
            <textarea
              v-model="draft.content"
              class="req-input req-textarea"
              rows="8"
              placeholder="背景、目标、验收标准……"
            ></textarea>
          </label>

          <!-- PRD 附件（仅编辑已保存的需求时可用） -->
          <div v-if="editingId" class="req-prd">
            <div class="req-prd-head">
              <span>PRD 附件</span>
              <button class="secondary-btn" :disabled="uploading" @click="prdInputEl?.click()">
                {{ uploading ? '上传中…' : '上传 PRD' }}
              </button>
              <input
                ref="prdInputEl"
                type="file"
                accept=".md,.markdown,.pdf,.doc,.docx,.txt"
                style="display: none"
                @change="uploadPrd"
              />
            </div>
            <p v-if="!attachments.length" class="req-prd-empty">还没有附件。可上传 .md / .pdf / .docx 等 PRD 文件。</p>
            <ul v-else class="req-prd-list">
              <li v-for="att in attachments" :key="att.id">
                <span class="req-prd-name" :title="att.filename">{{ att.filename }}</span>
                <span class="req-prd-size">{{ formatSize(att.size) }}</span>
                <button class="secondary-btn" @click="downloadPrd(att)">下载</button>
                <button class="req-delete" title="删除附件" @click="removePrd(att)">×</button>
              </li>
            </ul>
          </div>
          <p v-else class="req-prd-empty">保存后即可上传 PRD 附件。</p>

          <p v-if="formError" class="req-error">{{ formError }}</p>
        </div>
        <template #footer>
          <div class="req-form-actions">
            <button class="secondary-btn" @click="showEditor = false">取消</button>
            <button class="primary-btn" :disabled="saving" @click="save">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </template>
      </n-card>
    </n-modal>

    <!-- 服务端负责转换事务，客户端只选择目标象限。 -->
    <n-modal
      v-model:show="showPromoteModal"
      :mask-closable="!promoting"
      :close-on-esc="!promoting"
    >
      <n-card style="max-width: 480px; width: 92vw" title="转为四象限任务" :bordered="false">
        <div class="req-promote-dialog">
          <p>将“{{ promoteTarget?.title || '未命名需求' }}”转为任务，并放入所选象限。</p>
          <div class="req-promote-options" role="radiogroup" aria-label="选择任务象限">
            <label v-for="option in PROMOTE_QUADRANTS" :key="option.id" class="req-promote-option">
              <input
                v-model="promoteQuadrant"
                type="radio"
                name="promote-quadrant"
                :value="option.id"
                :disabled="promoting"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>
          <p v-if="promoteError" class="req-error" role="alert">{{ promoteError }}</p>
        </div>
        <template #footer>
          <div class="req-form-actions">
            <button type="button" class="secondary-btn" :disabled="promoting" @click="closePromote">取消</button>
            <button type="button" class="primary-btn req-promote-confirm" :disabled="promoting || !promoteTarget" @click="confirmPromote">
              {{ promoting ? '转换中…' : '确认转换' }}
            </button>
          </div>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NModal, NCard } from 'naive-ui'
import { useRequirementStore } from '@/stores/requirementStore'
import { useTaskStore, type Task } from '@/stores/taskStore'
import {
  listRequirementAttachments,
  uploadRequirementAttachment,
  downloadRequirementAttachment,
  deleteRequirementAttachment,
  listRequirementTasks,
  type Requirement,
  type TaskAttachment,
} from '@/api'

const store = useRequirementStore()
const taskStore = useTaskStore()

const STATUS_OPTIONS = ['计划中', '进行中', '已完成', '已搁置']
const PRIORITY_OPTIONS = ['高', '中', '低']
const PROMOTE_QUADRANTS = [
  { id: 1, label: '第一象限：重要且紧急' },
  { id: 2, label: '第二象限：重要不紧急' },
  { id: 3, label: '第三象限：紧急不重要' },
  { id: 4, label: '第四象限：不重要不紧急' },
]

// ─── Editor state ───
const showEditor = ref(false)
const editingId = ref<number | null>(null)
const draft = ref({ title: '', content: '', status: '计划中', priority: '中' })
const saving = ref(false)
const formError = ref('')

// ─── PRD attachments ───
const attachments = ref<TaskAttachment[]>([])
const uploading = ref(false)
const prdInputEl = ref<HTMLInputElement | null>(null)

function openCreate() {
  editingId.value = null
  draft.value = { title: '', content: '', status: '计划中', priority: '中' }
  attachments.value = []
  formError.value = ''
  showEditor.value = true
}

async function openEdit(req: Requirement) {
  editingId.value = req.id
  draft.value = { title: req.title, content: req.content, status: req.status, priority: req.priority }
  formError.value = ''
  showEditor.value = true
  try {
    attachments.value = await listRequirementAttachments(req.id)
  } catch {
    attachments.value = []
  }
}

async function save() {
  if (!draft.value.title.trim()) {
    formError.value = '标题不能为空'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await store.update(editingId.value, draft.value)
    } else {
      const created = await store.add(draft.value)
      // 新建后直接进入编辑态，立即可上传 PRD
      editingId.value = created.id
      attachments.value = []
      return
    }
    showEditor.value = false
  } catch (err: any) {
    formError.value = err?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function confirmDelete(req: Requirement) {
  if (promoting.value) return
  if (!window.confirm(`删除需求「${req.title}」？此操作不可恢复。`)) return
  try {
    await store.remove(req.id)
  } catch (err: any) {
    window.alert(err?.message || '删除失败')
  }
}

// ─── 转为四象限任务 ───
const showPromoteModal = ref(false)
const promoteTarget = ref<Requirement | null>(null)
const promoteQuadrant = ref(1)
const promoting = ref(false)
const promoteError = ref('')

function openPromote(req: Requirement) {
  if (promoting.value) return
  promoteTarget.value = req
  promoteQuadrant.value = 1
  promoteError.value = ''
  showPromoteModal.value = true
}

function closePromote() {
  if (promoting.value) return
  showPromoteModal.value = false
  promoteTarget.value = null
  promoteError.value = ''
}

async function confirmPromote() {
  const requirement = promoteTarget.value
  if (!requirement || promoting.value) return

  promoting.value = true
  promoteError.value = ''
  let converted = false
  try {
    const promotedTask = await store.promoteToTask(requirement.id, promoteQuadrant.value)
    taskStore.upsertServerTask(promotedTask)
    taskStore.filterQuadrant = null
    taskStore.setView('matrix')
    taskStore.selectTask(promotedTask.clientId)
    converted = true
  } catch {
    // 不展示服务内部信息；需求仅在 API 成功后才会从本地列表移除。
    promoteError.value = '转换失败，需求仍保留在需求池。请确认本地服务正常后重试。'
  } finally {
    promoting.value = false
    if (converted) closePromote()
  }
}

// ─── PRD handlers ───
async function uploadPrd(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !editingId.value) return
  uploading.value = true
  formError.value = ''
  try {
    await uploadRequirementAttachment(editingId.value, file)
    attachments.value = await listRequirementAttachments(editingId.value)
  } catch (err: any) {
    formError.value = err?.message || '上传失败'
  } finally {
    uploading.value = false
  }
}

async function downloadPrd(att: TaskAttachment) {
  if (!editingId.value) return
  const blob = await downloadRequirementAttachment(editingId.value, att.id)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = att.filename
  a.click()
  URL.revokeObjectURL(url)
}

async function removePrd(att: TaskAttachment) {
  if (!editingId.value) return
  await deleteRequirementAttachment(editingId.value, att.id)
  attachments.value = attachments.value.filter(item => item.id !== att.id)
}

// ─── 关联任务（P5-2）───
// 展开后调 api.listRequirementTasks(req.id) 拉取挂在当前需求下的任务（一般是
// bug）。只缓存当前展开的需求；切换到另一个需求时重新拉取。
const expandedReqId = ref<number | null>(null)
const linkedTasks = ref<Task[]>([])
const linkedLoading = ref(false)

async function toggleLinked(reqId: number) {
  if (expandedReqId.value === reqId) {
    expandedReqId.value = null
    linkedTasks.value = []
    return
  }
  expandedReqId.value = reqId
  linkedTasks.value = []
  linkedLoading.value = true
  try {
    linkedTasks.value = await listRequirementTasks(reqId)
  } catch {
    linkedTasks.value = []
  } finally {
    linkedLoading.value = false
  }
}

function jumpToTask(clientId: string) {
  // RequirementsView 是全屏视图，DetailPanel 仅在非全屏视图下显示。先切回
  // matrix 视图让面板挂上，再选中任务，详情面板即可正确渲染。
  taskStore.setView('matrix')
  taskStore.selectTask(clientId)
}

// ─── Display helpers ───
function excerpt(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim()
  return text.length > 80 ? text.slice(0, 80) + '…' : text
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function statusStyle(status: string) {
  const map: Record<string, string> = {
    计划中: 'background: oklch(94% 0.03 240); color: oklch(40% 0.1 240)',
    进行中: 'background: oklch(93% 0.05 145); color: oklch(38% 0.11 145)',
    已完成: 'background: oklch(93% 0.04 150); color: oklch(35% 0.01 240)',
    已搁置: 'background: oklch(94% 0.01 240); color: oklch(55% 0.01 240)',
  }
  return map[status] || map['计划中']
}

function priorityStyle(priority: string) {
  const map: Record<string, string> = {
    高: 'background: oklch(94% 0.04 25); color: oklch(48% 0.15 25)',
    中: 'background: oklch(95% 0.04 85); color: oklch(45% 0.1 85)',
    低: 'background: oklch(94% 0.01 240); color: oklch(55% 0.01 240)',
  }
  return map[priority] || map['中']
}

// 关联任务列表里：类别徽章（需求/bug/研究 用不同颜色）。
function categoryStyle(category?: string) {
  const map: Record<string, string> = {
    需求: 'background: oklch(94% 0.04 240); color: oklch(45% 0.12 240)',
    bug: 'background: oklch(94% 0.05 25); color: oklch(48% 0.16 25)',
    研究: 'background: oklch(95% 0.04 300); color: oklch(45% 0.13 300)',
  }
  return map[category || '需求'] || map['需求']
}

// 关联任务列表里：状态徽章。复用 statusStyle 的语义但用更紧凑的样式。
function statusBadgeStyle(status?: string) {
  const map: Record<string, string> = {
    未开始: 'background: oklch(94% 0.01 240); color: oklch(55% 0.01 240)',
    进行中: 'background: oklch(93% 0.05 145); color: oklch(38% 0.11 145)',
    已完成: 'background: oklch(93% 0.04 150); color: oklch(35% 0.01 240)',
    开发阶段: 'background: oklch(93% 0.05 240); color: oklch(40% 0.12 240)',
    PR阶段: 'background: oklch(93% 0.05 250); color: oklch(40% 0.12 250)',
    测试阶段: 'background: oklch(93% 0.05 70); color: oklch(42% 0.12 70)',
    验证中: 'background: oklch(93% 0.05 70); color: oklch(42% 0.12 70)',
    挂起: 'background: oklch(94% 0.01 240); color: oklch(55% 0.01 240)',
  }
  return map[status || '未开始'] || map['未开始']
}
</script>

<style scoped>
.req-page {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.req-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.req-eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-transform: uppercase;
}
.req-heading h1 { font-size: 24px; font-weight: 650; margin: 4px 0; color: var(--text-primary); }
.req-heading p { font-size: 13px; color: var(--text-muted); margin: 0; }

.req-empty {
  padding: 64px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.req-empty-icon { font-size: 36px; margin-bottom: 12px; }

.req-list { display: flex; flex-direction: column; gap: 10px; }
.req-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.req-card:hover { border-color: oklch(70% 0.08 240); box-shadow: 0 2px 8px oklch(0% 0 0 / 0.04); }
.req-card-main { flex: 1; min-width: 0; }
.req-card-main h3 { font-size: 15px; font-weight: 600; margin: 0 0 4px; color: var(--text-primary); }
.req-card-excerpt {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.req-card-time { font-size: 12px; color: var(--text-muted); }
.req-card-side { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.req-badge {
  font-size: 12px;
  font-weight: 500;
  border-radius: 20px;
  padding: 2px 10px;
  white-space: nowrap;
}
.req-delete {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  padding: 0 6px;
  line-height: 1.4;
}
.req-delete:hover { background: oklch(94% 0.03 25); color: oklch(48% 0.15 25); }
.req-delete:disabled { cursor: default; opacity: 0.55; }
.req-promote {
  border: 1px solid oklch(72% 0.08 240);
  background: oklch(97% 0.018 240);
  color: oklch(42% 0.12 240);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.req-promote:hover { border-color: oklch(55% 0.12 240); background: oklch(94% 0.03 240); }
.req-promote:disabled { cursor: default; opacity: 0.55; }

/* ─── 关联任务（P5-2）─── */
.req-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.req-card-title-row h3 { margin: 0; }
.bug-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  padding: 1px 8px;
  background: oklch(56% 0.18 25);
  color: white;
  line-height: 1.5;
}

.req-linked {
  margin-top: 8px;
  border-top: 1px dashed var(--border-subtle);
  padding-top: 6px;
}
.req-linked-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 0;
  border-radius: var(--radius-sm);
}
.req-linked-toggle:hover { color: var(--text-primary); }
.req-linked-caret {
  display: inline-block;
  width: 10px;
  font-size: 10px;
  color: var(--text-muted);
}
.req-linked-body { margin-top: 4px; }
.req-linked-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
  padding: 4px 2px;
  font-style: italic;
}
.req-linked-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.req-linked-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  background: var(--surface-mid);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
}
.req-linked-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}
.req-linked-cat,
.req-linked-status {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  border-radius: 999px;
  padding: 1px 7px;
  white-space: nowrap;
}
.req-linked-jump {
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 1px 8px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.req-linked-jump:hover {
  color: var(--text-primary);
  border-color: oklch(60% 0.12 240);
}

.req-form { display: flex; flex-direction: column; gap: 14px; }
.req-field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.req-field > span { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.req-field-row { display: flex; gap: 12px; }
.req-input {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 14px;
  background: var(--surface);
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
}
.req-input:focus { border-color: oklch(62% 0.1 240); }
.req-textarea { resize: vertical; line-height: 1.6; }

.req-prd { border-top: 1px solid var(--border-subtle); padding-top: 12px; }
.req-prd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.req-prd-empty { font-size: 12px; color: var(--text-muted); margin: 0; }
.req-prd-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.req-prd-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  background: var(--surface-mid);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
}
.req-prd-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.req-prd-size { color: var(--text-muted); font-size: 12px; flex-shrink: 0; }

.req-error { color: oklch(58% 0.18 25); font-size: 13px; margin: 0; }
.req-form-actions { display: flex; justify-content: flex-end; gap: 10px; }
.req-promote-dialog { display: flex; flex-direction: column; gap: 14px; }
.req-promote-dialog > p:first-child { margin: 0; color: var(--text-secondary); font-size: 14px; line-height: 1.6; }
.req-promote-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.req-promote-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-mid);
  padding: 9px 10px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}
.req-promote-option:has(input:checked) { border-color: oklch(55% 0.12 240); background: oklch(96% 0.022 240); }
.req-promote-option:has(input:disabled) { cursor: default; opacity: 0.65; }
.req-promote-option input { margin: 0; accent-color: oklch(55% 0.12 240); }

.primary-btn {
  background: oklch(55% 0.12 240);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.primary-btn:disabled { opacity: 0.6; cursor: default; }
.secondary-btn {
  background: var(--surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.secondary-btn:disabled { opacity: 0.6; cursor: default; }
</style>
