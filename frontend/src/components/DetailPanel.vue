<template>
  <div class="detail-panel">
    <div class="detail-header">
      <div class="detail-heading">
        <div class="detail-title-row">
          <span class="detail-title">任务详情</span>
          <span v-if="task && readonly" class="readonly-badge">只读</span>
        </div>
        <div v-if="task" class="detail-status-row">
          <span class="detail-chip">{{ task.status }}</span>
        </div>
      </div>
      <div class="detail-header-actions">
        <button
          v-if="task && canTransfer"
          type="button"
          class="transfer-btn"
          title="转发任务给队友"
          @click="openTransferModal"
        >转发</button>
        <button class="close-btn" @click="store.selectTask(null)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
            <path d="M4 4L12 12M12 4L4 12"/>
          </svg>
        </button>
      </div>
    </div>
    <div v-if="task" class="detail-body">
      <div v-if="task.previousOwnerId" class="transfer-banner">
        <span class="transfer-icon">➤</span>
        <span class="transfer-text">由 {{ teamStore.usernameOf(task.previousOwnerId) || '队友' }} 转交</span>
        <span v-if="task.transferNote" class="transfer-note">说明：{{ task.transferNote }}</span>
      </div>
      <div class="detail-meta-card">
        <div class="detail-meta-item">
          <span class="detail-meta-label">创建于</span>
          <span class="detail-meta-value">{{ formatCreatedAt }}</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">最近变更</span>
          <span class="detail-meta-value">{{ formatUpdatedAt }}</span>
        </div>
      </div>
      <p v-if="detailError" class="attachment-error" role="alert">{{ detailError }}</p>
      <div class="detail-field">
        <label>任务名称</label>
        <input type="text" :value="task.title" :disabled="readonly" @change="updateField('title', ($event.target as HTMLInputElement).value)" placeholder="任务名称" />
      </div>
      <div class="detail-field-grid">
        <div class="detail-field">
          <label for="task-belonging-input">任务归属</label>
          <input
            id="task-belonging-input"
            data-testid="task-belonging-input"
            type="text"
            list="task-belonging-options"
            :value="normalizeTaskBelonging(task.taskBelonging)"
            :disabled="readonly || taskBelongingSaving"
            :aria-busy="taskBelongingSaving"
            maxlength="100"
            placeholder="输入或选择任务归属"
            @change="saveTaskBelonging"
          />
          <datalist id="task-belonging-options">
            <option v-for="option in taskBelongingSuggestions" :key="option" :value="option" />
          </datalist>
        </div>
        <div class="detail-field">
          <label>类别</label>
          <select :value="task.category" :disabled="readonly" @change="updateField('category', ($event.target as HTMLSelectElement).value)">
            <option v-for="option in categoryOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>
        <div v-if="task.category === 'bug'" class="detail-field">
          <label>挂靠需求</label>
          <select
            :value="task.requirementId ?? null"
            :disabled="readonly"
            @change="updateField('requirementId', ($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value))"
          >
            <option :value="null">未挂靠</option>
            <option
              v-for="requirement in requirementStore.requirements"
              :key="requirement.id"
              :value="requirement.id"
            >{{ requirement.title }}</option>
          </select>
        </div>
        <div class="detail-field">
          <label>负责人</label>
          <select :value="task.owner" :disabled="readonly" @change="updateField('owner', ($event.target as HTMLSelectElement).value)">
            <option v-for="option in ownerOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>
        <div class="detail-field">
          <label>任务来源</label>
          <select :value="task.source" :disabled="readonly" @change="updateField('source', ($event.target as HTMLSelectElement).value)">
            <option v-for="option in sourceOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>
        <div class="detail-field">
          <label>状态</label>
          <select :value="task.status" :disabled="readonly" @change="updateField('status', ($event.target as HTMLSelectElement).value)">
            <option v-for="option in statusOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>
        <div class="detail-field">
          <label>优先级</label>
          <select :value="task.priority" :disabled="readonly" @change="updateField('priority', ($event.target as HTMLSelectElement).value)">
            <option v-for="option in priorityOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>
      </div>
      <div class="detail-field-grid">
        <div class="detail-field">
          <label>任务开始时间</label>
          <input type="datetime-local" :value="task.startAt" :disabled="readonly" @change="updateField('startAt', ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="detail-field">
          <label>任务截止时间</label>
          <input type="datetime-local" :value="task.due" :disabled="readonly" @change="updateField('due', ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="detail-field">
          <label>父任务</label>
          <select :value="task.parentTaskId || ''" :disabled="readonly" @change="updateField('parentTaskId', ($event.target as HTMLSelectElement).value)">
            <option value="">无父任务</option>
            <option
              v-for="parent in parentTaskOptions"
              :key="parent.clientId"
              :value="parent.clientId"
            >{{ parent.title || '未命名任务' }}</option>
          </select>
        </div>
        <div class="detail-field">
          <label>共计花费</label>
          <input type="number" min="0" step="0.01" :value="task.totalCost ?? ''" :disabled="readonly" @change="updateField('totalCost', numberOrNull($event))" placeholder="可留空" />
        </div>
        <div class="detail-field">
          <label>人/天</label>
          <input type="number" min="0" step="0.01" :value="task.personDays ?? ''" :disabled="readonly" @change="updateField('personDays', numberOrNull($event))" placeholder="可留空" />
        </div>
      </div>
      <div class="detail-field content-field">
        <div class="attachment-label-row">
          <label>具体内容</label>
          <div v-if="!readonly" class="content-actions">
            <button type="button" :disabled="persistingContent" @click="openContentModal">{{ persistingContent ? '保存中…' : (task.notes ? '展开编辑' : '添加内容') }}</button>
          </div>
        </div>
        <p v-if="contentError" class="attachment-error">{{ contentError }}</p>
        <div class="content-summary" :class="{ 'content-summary-readonly': readonly }" @click="readonly ? undefined : openContentModal">
          <div v-if="task.notes" class="content-summary-text" v-html="contentSummary"></div>
          <p v-else class="content-summary-empty">{{ readonly ? '暂无内容' : '点击添加 Markdown 具体内容…' }}</p>
        </div>
        <input v-if="!readonly" ref="markdownFileInput" class="attachment-input" type="file" accept=".md,.markdown,text/markdown,text/plain" @change="importMarkdown" />
      </div>
      <div class="detail-field attachment-field prd-attachment-field">
        <div class="attachment-label-row">
          <label>PRD 文档</label>
          <button
            v-if="task.id && !readonly"
            type="button"
            class="attachment-upload"
            :disabled="prdUploading"
            @click="choosePrdFiles"
          >{{ prdUploading ? '上传中' : '上传 PRD' }}</button>
        </div>
        <input
          v-if="task.id && !readonly"
          ref="prdFileInput"
          class="attachment-input"
          type="file"
          accept=".md,.markdown,.pdf,.doc,.docx,.txt"
          @change="uploadPrdFiles"
        />
        <p v-if="prdError" class="attachment-error">{{ prdError }}</p>
        <p v-if="!task.id" class="prd-attachment-hint">保存后即可上传 PRD 文档</p>
        <div v-if="prdAttachments.length" class="attachment-list prd-attachment-list">
          <div v-for="attachment in prdAttachments" :key="attachment.id" class="attachment-item prd-attachment-item">
            <div class="attachment-type">{{ attachment.filename.split('.').pop()?.slice(0, 4) || '文件' }}</div>
            <div class="attachment-copy">
              <span :title="attachment.filename">{{ attachment.filename }}</span>
              <small>{{ formatAttachmentSize(attachment.size) }}</small>
            </div>
            <div class="attachment-actions">
              <button type="button" @click="downloadPrdAttachment(attachment.id, attachment.filename)">下载</button>
              <button v-if="!readonly" type="button" class="danger" @click="removePrdAttachment(attachment.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
      <div class="detail-field attachment-field">
        <div class="attachment-label-row">
          <label>资料附件</label>
          <button v-if="!readonly" type="button" class="attachment-upload" :disabled="uploading" @click="chooseFiles">
            {{ uploading ? '上传中' : '上传图片或文档' }}
          </button>
        </div>
        <input v-if="!readonly" ref="fileInput" class="attachment-input" type="file" multiple @change="uploadFiles" />
        <p v-if="attachmentError" class="attachment-error">{{ attachmentError }}</p>
        <div v-if="attachments.length" class="attachment-list">
          <div v-for="attachment in attachments" :key="attachment.id" class="attachment-item">
            <img
              v-if="attachment.isImage && attachmentPreviews[attachment.id]"
              class="attachment-preview"
              :src="attachmentPreviews[attachment.id]"
              :alt="attachment.filename"
            />
            <div v-else class="attachment-type">{{ attachment.filename.split('.').pop()?.slice(0, 4) || '文件' }}</div>
            <div class="attachment-copy">
              <span :title="attachment.filename">{{ attachment.filename }}</span>
              <small>{{ formatAttachmentSize(attachment.size) }}</small>
            </div>
            <div class="attachment-actions">
              <button type="button" @click="downloadAttachment(attachment.id, attachment.filename)">下载</button>
              <button v-if="!readonly" type="button" class="danger" @click="removeAttachment(attachment.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
      <!-- 子任务（P5-1）：仅已保存的任务显示 -->
      <div v-if="task.id" class="detail-field subtask-field">
        <div class="attachment-label-row">
          <label>子任务</label>
          <button v-if="!readonly" type="button" class="attachment-upload" @click="addSubtask">+ 拆分</button>
        </div>
        <div v-if="task.subtasks && task.subtasks.length" class="subtask-list">
          <div v-for="child in task.subtasks" :key="child.clientId" class="subtask-item">
            <span class="subtask-status-dot" :data-status="child.status || '未开始'"></span>
            <span class="subtask-title" :title="child.title">{{ child.title || '未命名任务' }}</span>
            <span class="subtask-status-text">{{ child.status || '未开始' }}</span>
            <button type="button" @click="store.selectTask(child.clientId)">跳转</button>
          </div>
        </div>
        <p v-else-if="!readonly" class="subtask-empty">还没有子任务，点击"拆分"创建。</p>
        <p v-else class="subtask-empty">暂无子任务。</p>
      </div>
      <!-- 留言（P2-5）：远程任务或团队成员可见 -- 团队场景下本地任务也能留言 -->
      <div v-if="task.id" class="detail-field comment-field">
        <div class="attachment-label-row">
          <label>留言</label>
          <span class="comment-count">{{ comments.length || '' }}</span>
        </div>
        <p v-if="commentError" class="attachment-error">{{ commentError }}</p>
        <div v-if="comments.length" class="comment-list">
          <div v-for="comment in comments" :key="comment.id" class="comment-item">
            <div class="comment-meta">
              <span v-if="comment.role" class="role-badge" :class="roleClass(comment.role)">{{ comment.role }}</span>
              <strong>{{ comment.author }}</strong>
              <span>{{ formatCommentTime(comment.createdAt) }}</span>
              <button
                v-if="comment.author === auth.username"
                type="button"
                class="danger"
                @click="removeComment(comment.id)"
              >删除</button>
            </div>
            <p class="comment-content">{{ comment.content }}</p>
          </div>
        </div>
        <p v-else class="comment-empty">还没有留言。在这里和协作伙伴沟通。</p>
        <div class="comment-compose">
          <textarea
            v-model="commentDraft"
            rows="2"
            placeholder="写下留言，Enter 发送（Shift+Enter 换行）"
            @keydown.enter.exact.prevent="sendComment"
          ></textarea>
          <button type="button" :disabled="commentSending || !commentDraft.trim()" @click="sendComment">
            {{ commentSending ? '发送中' : '发送' }}
          </button>
        </div>
      </div>
    </div>
    <div v-else class="detail-body">
      <p class="detail-empty">从象限中选一个任务，这里会展开它的内容、状态和节奏。</p>
    </div>
    <ContentModal
      :open="contentModalOpen"
      :initial-content="contentModalInitialContent"
      :initially-saved="contentModalInitiallySaved"
      :save-content="saveContentFromModal"
      :task-id="task?.id"
      :task-title="task?.title"
      :task-meta="taskMeta"
      @close="closeContentModal"
    />
    <!-- P6-3 任务转发 modal -->
    <div v-if="showTransferModal" class="transfer-modal-mask" @click.self="closeTransferModal">
      <div class="transfer-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title">
        <div class="transfer-modal-header">
          <strong id="transfer-modal-title">转发任务给队友</strong>
          <button type="button" class="transfer-modal-close" :disabled="transferring" @click="closeTransferModal">×</button>
        </div>
        <div class="transfer-modal-body">
          <div class="detail-field">
            <label>选择队友</label>
            <select v-model="selectedTransferTarget" :disabled="transferring">
              <option v-for="m in transferTargets" :key="m.userId" :value="m.userId">{{ m.username }}</option>
            </select>
            <p v-if="!transferTargets.length" class="transfer-modal-hint">团队中暂无其他成员，无法转发。</p>
          </div>
          <div class="detail-field">
            <label>转交说明（可选）</label>
            <textarea
              v-model="transferNote"
              rows="3"
              maxlength="500"
              placeholder="给队友留个话…"
              :disabled="transferring"
            ></textarea>
          </div>
          <p v-if="transferError" class="attachment-error">{{ transferError }}</p>
        </div>
        <div class="transfer-modal-footer">
          <button type="button" :disabled="transferring" @click="closeTransferModal">取消</button>
          <button
            type="button"
            class="primary"
            :disabled="transferring || !selectedTransferTarget"
            @click="confirmTransfer"
          >{{ transferring ? '转发中…' : '确认转发' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { marked } from 'marked'
import * as api from '@/api'
import type { TaskAttachment, TaskComment } from '@/api'
import { useTaskStore } from '@/stores/taskStore'
import { useAuthStore } from '@/stores/authStore'
import { useTeamStore } from '@/stores/teamStore'
import { useRequirementStore } from '@/stores/requirementStore'
import { formatDateTimeLocal } from '@/utils/dateTime'
import ContentModal from './ContentModal.vue'

const store = useTaskStore()
const taskStore = useTaskStore()
const auth = useAuthStore()
const teamStore = useTeamStore()
const requirementStore = useRequirementStore()
const task = computed(() => store.selectedTask)
const fileInput = ref<HTMLInputElement | null>(null)
const markdownFileInput = ref<HTMLInputElement | null>(null)
const attachments = ref<TaskAttachment[]>([])
// P5-4: PRD 文档附件（与"资料附件"分离）
const prdAttachments = ref<TaskAttachment[]>([])
const prdUploading = ref(false)
const prdError = ref('')
const prdFileInput = ref<HTMLInputElement | null>(null)
// 留言（P2-5）
const comments = ref<TaskComment[]>([])
const commentDraft = ref('')
const commentSending = ref(false)
const commentError = ref('')
const attachmentPreviews = ref<Record<string, string>>({})
const uploading = ref(false)
const attachmentError = ref('')
const contentModalOpen = ref(false)
const defaultTaskBelonging = '项目管理'
const taskBelongingOptions = ['数据预处理', 'AI网格员-Fastgpt工作流版本', 'AI网格员-Fastgpt智能体版本', 'AI网格员-中移版本', '城运中心', '三流一体化', defaultTaskBelonging, '公文', '数据预处理平台', 'AI网格员-连小警版本', '桌面RPA']
const taskBelongingSaving = ref(false)
const taskBelongingSavingClientId = ref<string | null>(null)
const pendingTaskBelonging = ref<string | null>(null)

function normalizeTaskBelonging(value: string | undefined): string {
  return value?.trim() || defaultTaskBelonging
}

// 归属既可以从常用建议中选择，也允许录入服务端支持的自定义文本。保留任务
// 列表中已有的自定义值，避免用户下次编辑时找不到此前使用过的归属。
const taskBelongingSuggestions = computed(() => {
  const suggestions = new Set(taskBelongingOptions)
  const addSuggestion = (value: string | undefined) => {
    const suggestion = value?.trim()
    if (suggestion) suggestions.add(suggestion)
  }

  store.activeTasks.forEach(item => addSuggestion(item.taskBelonging))
  addSuggestion(task.value?.taskBelonging)
  return [...suggestions]
})
const categoryOptions = ['需求', 'bug', '研究']
// P6-1: when the user is in a team, drive the owner dropdown from team
// members; otherwise fall back to the legacy hardcoded list (desktop
// single-user mode stays usable without a team).
const ownerOptions = computed<string[]>(() => {
  if (teamStore.hasTeam && teamStore.members.length) {
    return teamStore.members.map(m => m.username)
  }
  return ['唐星', '龙建', '王志翔', '罗印', '刘梨', '罗桑']
})
const sourceOptions = ['测试提出', '开发自测', '用户需求']
const statusOptions = ['未开始', 'PR阶段', '开发阶段', '验证中', '测试阶段', '已完成', '挂起']
const priorityOptions = ['高', '中', '低']

const formatCreatedAt = computed(() => {
  if (!task.value?.createdAt) return '—'
  return formatDateTimeLocal(task.value.createdAt)
})

const formatUpdatedAt = computed(() => {
  if (!task.value?.updatedAt) return '—'
  return formatDateTimeLocal(task.value.updatedAt)
})

const contentSummary = computed(() => {
  const source = task.value?.notes || ''
  if (!source) return ''
  // Render markdown, then strip tags for a compact one-line preview in the side panel.
  const html = marked.parse(source, { async: false }) as string
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 140 ? text.slice(0, 140) + '…' : text
})

const persistingContent = ref(false)
const contentError = ref('')
const detailError = ref('')
const importedContent = ref<string | null>(null)
const contentModalInitialContent = computed(() => importedContent.value ?? task.value?.notes ?? '')
const contentModalInitiallySaved = computed(() => importedContent.value === null)

const taskMeta = computed(() => {
  if (!task.value) return null
  const t = task.value
  return {
    createdAt: t.createdAt || '',
    updatedAt: t.updatedAt || '',
    title: t.title || '未命名任务',
    status: t.status || '未开始',
    owner: t.owner || '',
  }
})

async function updateField(field: string, value: any, clientId = task.value?.clientId): Promise<boolean> {
  if (!clientId) return false
  const saved = await store.updateTask(clientId, { [field]: value })
  if (!saved) {
    if (task.value?.clientId === clientId) {
      detailError.value = store.serviceError || '无法保存任务修改，请确认本地服务正在运行后重试。'
    }
    return false
  }
  if (task.value?.clientId === clientId) detailError.value = ''
  return true
}

async function saveTaskBelonging(event: Event) {
  const input = event.target as HTMLInputElement
  const clientId = task.value?.clientId
  if (!clientId) return
  const taskBelonging = normalizeTaskBelonging(input.value)

  // 同一字段只允许一个在途请求。正常交互时输入框已禁用；这里仍保留最近
  // 一次变更，确保极短时间内的连续事件不会并发触发乐观更新和乱序回滚。
  if (taskBelongingSaving.value) {
    if (taskBelongingSavingClientId.value === clientId) {
      pendingTaskBelonging.value = taskBelonging
      input.value = taskBelonging
    }
    return
  }

  taskBelongingSaving.value = true
  taskBelongingSavingClientId.value = clientId
  let currentValue = taskBelonging
  try {
    while (true) {
      const saved = await updateField('taskBelonging', currentValue, clientId)
      const nextValue = pendingTaskBelonging.value
      pendingTaskBelonging.value = null

      if (nextValue !== null && nextValue !== currentValue) {
        currentValue = nextValue
        continue
      }

      // updateTask 在失败时会回滚任务对象；显式恢复输入框，避免未保存的文字
      // 继续显示为已保存状态。成功时也回显归一化后的值。
      input.value = saved
        ? currentValue
        : normalizeTaskBelonging(store.tasks.find(item => item.clientId === clientId)?.taskBelonging)
      return
    }
  } finally {
    taskBelongingSaving.value = false
    taskBelongingSavingClientId.value = null
    pendingTaskBelonging.value = null
  }
}

function numberOrNull(event: Event): number | null {
  const value = (event.target as HTMLInputElement).value
  return value === '' ? null : Number(value)
}

async function saveContentFromModal(content: string): Promise<string | null> {
  if (!task.value) return '任务已不存在，无法保存内容。'
  const saved = await store.updateTask(task.value.clientId, { notes: content })
  if (!saved) {
    const error = store.serviceError || '无法保存内容，请确认本地服务正在运行后重试。'
    contentError.value = error
    return error
  }
  contentError.value = ''
  importedContent.value = null
  return null
}

async function openContentModal() {
  if (!task.value || persistingContent.value) return
  contentError.value = ''
  // Image attachments require a persisted service task id. Keep the editor
  // available for text while surfacing a failed persistence attempt.
  if (!task.value.id) {
    persistingContent.value = true
    try {
      await store.ensurePersisted(task.value.clientId)
    } catch (error) {
      contentError.value = error instanceof Error
        ? `图片插入将不可用：${error.message}`
        : '图片插入将不可用：无法保存任务到后端。'
    } finally {
      persistingContent.value = false
    }
  }
  contentModalOpen.value = true
}

function chooseMarkdownFile() {
  markdownFileInput.value?.click()
}

async function importMarkdown(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const text = await file.text()
  importedContent.value = text
  contentError.value = ''
  contentModalOpen.value = true
  if (markdownFileInput.value) markdownFileInput.value.value = ''
}

function closeContentModal() {
  contentModalOpen.value = false
  importedContent.value = null
}

function clearPreviews() {
  Object.values(attachmentPreviews.value).forEach(url => URL.revokeObjectURL(url))
  attachmentPreviews.value = {}
}

async function loadPreview(taskId: number, attachment: TaskAttachment) {
  if (!attachment.isImage) return
  const blob = await api.downloadTaskAttachment(taskId, attachment.id)
  attachmentPreviews.value = { ...attachmentPreviews.value, [attachment.id]: URL.createObjectURL(blob) }
}

async function loadAttachments(taskId: number) {
  attachmentError.value = ''
  clearPreviews()
  try {
    const result = await api.listTaskAttachments(taskId)
    if (task.value?.id !== taskId) return
    attachments.value = result
    await Promise.all(result.map(attachment => loadPreview(taskId, attachment)))
  } catch (error) {
    attachments.value = []
    attachmentError.value = error instanceof Error ? error.message : '无法加载附件'
  }
}

watch(
  () => task.value?.id,
  taskId => {
    attachments.value = []
    attachmentError.value = ''
    clearPreviews()
    if (taskId) void loadAttachments(taskId)
  },
  { immediate: true },
)

// ─── 留言（P2-5）───
watch(
  () => task.value?.id,
  taskId => {
    comments.value = []
    commentError.value = ''
    if (taskId) void loadComments(taskId)
  },
  { immediate: true },
)

async function loadComments(taskId: number) {
  try {
    comments.value = await api.listTaskComments(taskId)
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : '无法加载留言'
  }
}

async function sendComment() {
  const content = commentDraft.value.trim()
  if (!content || commentSending.value) return
  // Safety guard for an incomplete service response.
  let taskId: number | undefined = task.value?.id
  if (!taskId && task.value) {
    try {
      taskId = (await store.ensurePersisted(task.value.clientId))?.id
    } catch (error) {
      commentError.value = error instanceof Error ? error.message : '保存任务失败，请稍后重试。'
      return
    }
  }
  if (!taskId) {
    commentError.value = '任务尚未保存，请稍后重试。'
    return
  }
  commentSending.value = true
  commentError.value = ''
  try {
    await api.createTaskComment(taskId, content)
    commentDraft.value = ''
    await loadComments(taskId)
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : '发送失败'
  } finally {
    commentSending.value = false
  }
}

async function removeComment(commentId: number) {
  const taskId = task.value?.id
  if (!taskId) return
  try {
    await api.deleteTaskComment(taskId, commentId)
    comments.value = comments.value.filter(item => item.id !== commentId)
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : '删除失败'
  }
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

watch(
  () => task.value?.clientId,
  () => {
    contentModalOpen.value = false
    contentError.value = ''
  },
)

function chooseFiles() {
  if (!task.value || uploading.value) return
  fileInput.value?.click()
}

async function uploadFiles(event: Event) {
  if (!task.value || uploading.value) return
  const files = Array.from((event.target as HTMLInputElement).files || [])
  if (files.length === 0) {
    if (fileInput.value) fileInput.value.value = ''
    return
  }
  // Safety guard for an incomplete service response before upload.
  let taskId: number | undefined
  if (task.value.id) {
    taskId = task.value.id
  } else {
    try {
      taskId = (await store.ensurePersisted(task.value.clientId))?.id
    } catch (error) {
      attachmentError.value = error instanceof Error ? error.message : '保存任务失败，请确认后端服务已启动后重试。'
      if (fileInput.value) fileInput.value.value = ''
      return
    }
  }
  if (!taskId) {
    attachmentError.value = '任务尚未保存，请稍后重试。'
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  uploading.value = true
  attachmentError.value = ''
  try {
    for (const file of files) {
      await api.uploadTaskAttachment(taskId, file)
    }
    await loadAttachments(taskId)
  } catch (error) {
    attachmentError.value = error instanceof Error ? error.message : '上传失败'
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function downloadAttachment(attachmentId: string, filename: string) {
  const taskId = task.value?.id
  if (!taskId) return
  try {
    const blob = await api.downloadTaskAttachment(taskId, attachmentId)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    attachmentError.value = error instanceof Error ? error.message : '下载失败'
  }
}

async function removeAttachment(attachmentId: string) {
  const taskId = task.value?.id
  if (!taskId || !window.confirm('删除该附件？')) return
  try {
    await api.deleteTaskAttachment(taskId, attachmentId)
    await loadAttachments(taskId)
  } catch (error) {
    attachmentError.value = error instanceof Error ? error.message : '删除失败'
  }
}

function formatAttachmentSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
}

// ─── 父任务选择器（P5-1）───
// 列出当前任务的其它顶层任务作为父任务候选（排除自身，避免自环）。
const parentTaskOptions = computed(() =>
  task.value
    ? store.activeTasks.filter(t => !t.parentTaskId && t.clientId !== task.value!.clientId)
    : [],
)

// ─── P6-1 / P6-3：只读模式 + 任务转发 ───
// 只读判定：当前打开的任务不在 store.tasks（当前用户拥有的任务）里，
// 说明它是队友的任务（从 TeammatesView 跳转过来），不可编辑但可查看/留言。
const readonly = computed<boolean>(() => {
  if (!task.value || !auth.userId) return false
  return !taskStore.tasks.find(t => t.clientId === task.value!.clientId)
})

// 转发按钮可见条件：任务已保存、用户在团队中、有 userId、且是自己的任务。
const canTransfer = computed<boolean>(() => {
  if (!task.value?.id || !auth.userId) return false
  if (!teamStore.isInTeam) return false
  // 只读模式下（即队友的任务）不允许转发。
  return !readonly.value
})

// 评论角色徽章 CSS class 映射。
function roleClass(role: string | undefined): string {
  switch (role) {
    case '开发': return 'role-dev'
    case '管理': return 'role-mgmt'
    case '测试': return 'role-qa'
    default: return ''
  }
}

// 转发 modal 状态。
const showTransferModal = ref(false)
const selectedTransferTarget = ref<number | null>(null)
const transferNote = ref('')
const transferring = ref(false)
const transferError = ref('')

// 转发 modal 的候选队友：当前团队成员里除自己以外的人。
const transferTargets = computed(() =>
  teamStore.members.filter(m => m.userId !== auth.userId)
)

function openTransferModal() {
  if (!canTransfer.value) return
  transferError.value = ''
  transferNote.value = ''
  selectedTransferTarget.value = transferTargets.value[0]?.userId ?? null
  showTransferModal.value = true
}

function closeTransferModal() {
  if (transferring.value) return
  showTransferModal.value = false
}

async function confirmTransfer() {
  if (!task.value?.id || !selectedTransferTarget.value) return
  transferring.value = true
  transferError.value = ''
  try {
    await api.transferTask(task.value.id, selectedTransferTarget.value, transferNote.value.trim())
    // 后端 transfer 把 task.user_id 改成对方，重新拉取后该任务自然从当前
    // 用户的列表里消失（list_tasks 只返回 user_id==当前用户的）。
    await taskStore.fetchTasks()
    // 关闭详情面板。
    taskStore.selectedTaskId = null
    showTransferModal.value = false
  } catch (error) {
    transferError.value = error instanceof Error ? error.message : '转发失败，请稍后重试。'
  } finally {
    transferring.value = false
  }
}

// ─── PRD 文档附件（P5-4）───
async function loadPrdAttachments(taskId: number) {
  prdError.value = ''
  try {
    const result = await api.listTaskPrdAttachments(taskId)
    if (task.value?.id !== taskId) return
    prdAttachments.value = result
  } catch (error) {
    prdAttachments.value = []
    prdError.value = error instanceof Error ? error.message : '无法加载 PRD 文档'
  }
}

watch(
  () => task.value?.id,
  taskId => {
    prdAttachments.value = []
    prdError.value = ''
    if (taskId) void loadPrdAttachments(taskId)
  },
  { immediate: true },
)

function choosePrdFiles() {
  if (!task.value || prdUploading.value) return
  prdFileInput.value?.click()
}

async function uploadPrdFiles(event: Event) {
  if (!task.value || prdUploading.value) return
  const files = Array.from((event.target as HTMLInputElement).files || [])
  if (files.length === 0) {
    if (prdFileInput.value) prdFileInput.value.value = ''
    return
  }
  // 复用 ensurePersisted 机制：新任务先保存拿到 id 再上传 PRD。
  let taskId: number | undefined
  if (task.value.id) {
    taskId = task.value.id
  } else {
    try {
      taskId = (await store.ensurePersisted(task.value.clientId))?.id
    } catch (error) {
      prdError.value = error instanceof Error ? error.message : '保存任务失败，请确认后端服务已启动后重试。'
      if (prdFileInput.value) prdFileInput.value.value = ''
      return
    }
  }
  if (!taskId) {
    prdError.value = '任务尚未保存，请稍后重试。'
    if (prdFileInput.value) prdFileInput.value.value = ''
    return
  }

  prdUploading.value = true
  prdError.value = ''
  try {
    for (const file of files) {
      await api.uploadTaskPrdAttachment(taskId, file)
    }
    await loadPrdAttachments(taskId)
  } catch (error) {
    prdError.value = error instanceof Error ? error.message : '上传失败'
  } finally {
    prdUploading.value = false
    if (prdFileInput.value) prdFileInput.value.value = ''
  }
}

async function downloadPrdAttachment(attachmentId: string, filename: string) {
  const taskId = task.value?.id
  if (!taskId) return
  try {
    const blob = await api.downloadTaskPrdAttachment(taskId, attachmentId)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    prdError.value = error instanceof Error ? error.message : '下载失败'
  }
}

async function removePrdAttachment(attachmentId: string) {
  const taskId = task.value?.id
  if (!taskId || !window.confirm('删除该 PRD 文档？')) return
  try {
    await api.deleteTaskPrdAttachment(taskId, attachmentId)
    await loadPrdAttachments(taskId)
  } catch (error) {
    prdError.value = error instanceof Error ? error.message : '删除失败'
  }
}

// ─── 子任务拆分（P5-1）───
// store.addTask 不接受 parentTaskId 参数（另一 agent 的范围），所以先创建再
// PATCH parentTaskId，并继承父任务的归属/负责人/类别/来源等属性。
async function addSubtask() {
  if (!task.value) return
  try {
    const parent = task.value
    const newTask = await store.addTask(parent.quadrant, '新子任务')
    const saved = await store.updateTask(newTask.clientId, {
      parentTaskId: parent.clientId,
      taskBelonging: parent.taskBelonging,
      owner: parent.owner,
      category: parent.category,
      source: parent.source,
    })
    if (!saved) {
      detailError.value = store.serviceError || '无法设置子任务关系，请恢复服务后重试。'
      return
    }
    detailError.value = ''
    store.selectTask(newTask.clientId)
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : '创建子任务失败'
  }
}

// P5-2: bug 挂靠需求下拉依赖 requirementStore。AppLayout 已在 onMounted 里
// fetchAll，但为保险这里也兜底一次（store 内部已避免重复请求错误传播）。
if (!requirementStore.requirements.length) {
  requirementStore.fetchAll().catch(() => {})
}

onBeforeUnmount(clearPreviews)
</script>

<style scoped>
.detail-panel {
  width: 260px;
  min-width: 0;
  background: var(--surface);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity 180ms cubic-bezier(0.2, 0, 0, 1);
}
.detail-header {
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.detail-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.detail-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.detail-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.detail-chip {
  border-radius: 999px;
  padding: 2px 7px;
  background: var(--surface-mid);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-secondary);
}
.close-btn {
  width: 28px; height: 28px; border-radius: var(--radius-sm);
  border: none; background: transparent; cursor: pointer;
  display: grid; place-items: center; color: var(--text-secondary);
  transition: background var(--transition), color var(--transition);
}
.close-btn:hover { background: var(--surface-mid); color: var(--text-primary); }

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px 92px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-padding-bottom: 92px;
}
.detail-meta-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
  border: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, oklch(99% 0.003 240), var(--surface));
  border-radius: var(--radius-md);
  padding: 8px 10px;
}
.detail-meta-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.detail-meta-error .detail-meta-value {
  color: oklch(48% 0.18 25);
}
.detail-meta-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.detail-meta-value {
  font-size: 11px;
  color: var(--text-primary);
  line-height: 1.25;
  white-space: nowrap;
}
.detail-empty {
  font-size: 14px;
  color: var(--text-muted);
  text-align: left;
  line-height: 1.6;
  padding: 8px 4px;
}
.conflict-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid oklch(74% 0.12 42);
  background: oklch(98% 0.025 72);
  border-radius: var(--radius-md);
  padding: 9px 10px;
}
.conflict-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.conflict-copy strong {
  font-size: 12px;
  color: oklch(43% 0.12 42);
}
.conflict-copy span {
  font-size: 12px;
  line-height: 1.45;
  color: oklch(38% 0.04 72);
}
.conflict-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.conflict-actions button {
  border: 1px solid oklch(82% 0.04 72);
  background: var(--surface);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;
}
.conflict-actions button.primary {
  border-color: oklch(58% 0.12 240);
  background: oklch(96% 0.018 240);
  color: oklch(43% 0.13 240);
}
.detail-field label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 3px;
}
.detail-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.detail-field input,
.detail-field textarea,
.detail-field select {
  width: 100%;
  background: var(--surface-mid);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
  resize: vertical;
}
.detail-field input:focus,
.detail-field textarea:focus,
.detail-field select:focus {
  border-color: oklch(60% 0.12 240);
  box-shadow: 0 0 0 3px oklch(60% 0.12 240 / 0.12);
}
.detail-field textarea { min-height: 54px; }
.content-actions { display: flex; gap: 5px; }
.content-actions button { border: 1px solid var(--border-subtle); background: var(--surface); border-radius: var(--radius-sm); padding: 3px 7px; font-size: 11px; cursor: pointer; color: var(--text-secondary); }
.content-actions button:hover { color: var(--text-primary); border-color: oklch(60% 0.12 240); }
.content-summary {
  min-height: 38px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-mid);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--transition);
}
.content-summary:hover { border-color: oklch(60% 0.12 240); }
.content-summary-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.content-summary-empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
.detail-notification-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-mid);
}
.detail-check {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--text-secondary);
}
.detail-check input {
  width: 13px;
  height: 13px;
  accent-color: oklch(60% 0.12 240);
}
.attachment-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.attachment-upload,
.attachment-actions button {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 7px;
}
.attachment-upload:disabled { cursor: not-allowed; opacity: 0.55; }
.attachment-input { display: none; }
.attachment-hint,
.attachment-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
}
.attachment-hint { color: var(--text-muted); }
.attachment-error { color: oklch(52% 0.16 25); }
.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.attachment-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 5px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-mid);
}
.attachment-preview,
.attachment-type {
  width: 34px;
  height: 34px;
  border-radius: 4px;
}
.attachment-preview { object-fit: cover; background: var(--surface); }
.attachment-type {
  display: grid;
  place-items: center;
  background: oklch(92% 0.025 240);
  color: oklch(42% 0.1 240);
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}
.attachment-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.attachment-copy span {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attachment-copy small { color: var(--text-muted); font-size: 10px; }
.attachment-actions { display: flex; flex-direction: column; gap: 3px; }
.attachment-actions button { padding: 2px 5px; font-size: 10px; }
.attachment-actions .danger { color: oklch(50% 0.16 25); }

/* ─── PRD 文档（P5-4）─── */
/* 与"资料附件"视觉一致，但用浅蓝左边框 + 浅背景暗示这是 PRD 专属区。 */
.prd-attachment-field {
  border-left: 3px solid oklch(60% 0.10 240 / 0.35);
  background: oklch(98% 0.012 240 / 0.6);
  padding-left: 8px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.prd-attachment-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}
.prd-attachment-list { gap: 6px; }
.prd-attachment-item {
  background: oklch(98% 0.014 240);
}

/* ─── 子任务（P5-1）─── */
.subtask-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
  padding-left: 10px;
  border-left: 2px solid var(--border-subtle);
}
.subtask-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-mid);
  font-size: 11px;
}
.subtask-item:hover { background: oklch(97% 0.006 240); }
.subtask-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}
.subtask-status-dot[data-status='已完成'] { background: oklch(60% 0.12 145); }
.subtask-status-dot[data-status='开发阶段'],
.subtask-status-dot[data-status='PR阶段'] { background: oklch(60% 0.12 240); }
.subtask-status-dot[data-status='测试阶段'],
.subtask-status-dot[data-status='验证中'] { background: oklch(70% 0.13 70); }
.subtask-status-dot[data-status='挂起'] { background: oklch(70% 0.05 60); }
.subtask-title {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.subtask-status-text {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}
.subtask-item button {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
}
.subtask-item button:hover { color: var(--text-primary); border-color: oklch(60% 0.12 240); }
.subtask-empty {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

/* ─── 留言（P2-5）─── */
.comment-count { margin-left: auto; font-size: 11px; color: var(--text-muted); }
.comment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 8px;
}
.comment-item {
  background: var(--surface-mid);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}
.comment-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.comment-meta strong { color: var(--text-primary); font-size: 12px; }
.comment-meta button {
  margin-left: auto;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 10px;
  color: oklch(50% 0.16 25);
  padding: 0;
}
.comment-content {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
.comment-empty { font-size: 12px; color: var(--text-muted); margin: 0 0 8px; }
.comment-compose { display: flex; gap: 8px; align-items: flex-end; }
.comment-compose textarea {
  flex: 1;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  background: var(--surface);
  color: var(--text-primary);
  resize: vertical;
  outline: none;
}
.comment-compose textarea:focus { border-color: oklch(62% 0.1 240); }
.comment-compose button {
  border: none;
  background: oklch(55% 0.12 240);
  color: white;
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
}
.comment-compose button:disabled { opacity: 0.55; cursor: not-allowed; }

/* ─── P6：标题行 / 只读徽章 / 转发按钮 ─── */
.detail-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.readonly-badge {
  font-size: 10px;
  padding: 2px 8px;
  background: var(--border-subtle);
  color: var(--text-muted);
  border-radius: 4px;
  margin-left: 2px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.transfer-btn {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 9px;
  transition: color var(--transition), border-color var(--transition), background var(--transition);
}
.transfer-btn:hover {
  color: oklch(43% 0.13 240);
  border-color: oklch(60% 0.12 240);
  background: oklch(96% 0.018 240);
}
.detail-field input:disabled,
.detail-field textarea:disabled,
.detail-field select:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  background: var(--surface);
}
.content-summary-readonly {
  cursor: default;
}
.content-summary-readonly:hover { border-color: var(--border-subtle); }

/* ─── P6-3：被转交提示横条 ─── */
.transfer-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  background: oklch(95% 0.06 60);
  border-left: 3px solid oklch(65% 0.15 60);
  padding: 8px 12px;
  margin-bottom: 2px;
  font-size: 12px;
  color: oklch(45% 0.12 60);
  border-radius: 4px;
}
.transfer-banner .transfer-icon {
  font-size: 13px;
  font-weight: 700;
  color: oklch(55% 0.15 60);
}
.transfer-banner .transfer-text { font-weight: 600; }
.transfer-banner .transfer-note {
  width: 100%;
  color: oklch(38% 0.06 60);
  font-size: 11px;
  line-height: 1.45;
  padding-top: 2px;
  border-top: 1px dashed oklch(80% 0.06 60 / 0.5);
  margin-top: 2px;
}

/* ─── P6-2：评论角色徽章 ─── */
.role-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 6px;
  font-weight: 500;
  color: white;
  line-height: 1.5;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
.role-dev  { background: oklch(60% 0.12 250); }
.role-mgmt { background: oklch(55% 0.18 300); }
.role-qa   { background: oklch(65% 0.15 60); }

/* ─── P6-3：转发 modal ─── */
.transfer-modal-mask {
  position: fixed;
  inset: 0;
  background: oklch(20% 0.02 240 / 0.4);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 16px;
}
.transfer-modal {
  width: min(420px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 40px oklch(20% 0.04 240 / 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.transfer-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.transfer-modal-header strong {
  font-size: 13px;
  color: var(--text-primary);
}
.transfer-modal-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
}
.transfer-modal-close:hover:not(:disabled) {
  background: var(--surface-mid);
  color: var(--text-primary);
}
.transfer-modal-close:disabled { cursor: not-allowed; opacity: 0.5; }
.transfer-modal-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.transfer-modal-body .detail-field { margin: 0; }
.transfer-modal-body .detail-field textarea {
  min-height: 64px;
  resize: vertical;
}
.transfer-modal-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}
.transfer-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--border-subtle);
}
.transfer-modal-footer button {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition), background var(--transition);
}
.transfer-modal-footer button:disabled { cursor: not-allowed; opacity: 0.55; }
.transfer-modal-footer button.primary {
  border-color: oklch(58% 0.12 240);
  background: oklch(96% 0.018 240);
  color: oklch(43% 0.13 240);
}
.transfer-modal-footer button.primary:hover:not(:disabled) {
  background: oklch(92% 0.04 240);
}
.transfer-modal-footer button:not(.primary):hover:not(:disabled) {
  color: var(--text-primary);
  border-color: oklch(60% 0.12 240);
}
</style>
