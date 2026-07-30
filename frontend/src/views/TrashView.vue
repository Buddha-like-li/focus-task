<template>
  <section class="trash-page" aria-labelledby="trash-title">
    <header class="trash-header">
      <div class="trash-title-group">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M4 7h16M9 11v6M15 11v6M8 7l1-3h6l1 3M6.5 7l.8 13h9.4l.8-13" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div>
          <h1 id="trash-title">垃圾桶</h1>
          <p>已移入的任务可恢复；彻底删除后无法恢复。</p>
        </div>
      </div>
      <button
        type="button"
        class="refresh-button"
        :disabled="trash.loading"
        title="刷新垃圾桶"
        aria-label="刷新垃圾桶"
        @click="reload"
      >
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M20 11a8 8 0 0 0-14.8-4.2L3 9m1-5v5h5M4 13a8 8 0 0 0 14.8 4.2L21 15m-1 5v-5h-5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </header>

    <div v-if="trash.error || restoreNotice" class="trash-alert" role="alert">
      <span>{{ trash.error || restoreNotice }}</span>
      <button v-if="trash.error" type="button" class="retry-button" :disabled="trash.loading" @click="reload">重试</button>
    </div>

    <div v-if="trash.loading && trash.tasks.length === 0" class="trash-state" role="status">
      正在加载垃圾桶…
    </div>

    <div v-else-if="trash.tasks.length === 0" class="trash-state trash-empty">
      <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 7h16M9 11v6M15 11v6M8 7l1-3h6l1 3M6.5 7l.8 13h9.4l.8-13" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <strong>垃圾桶为空</strong>
      <span>移入垃圾桶的任务会显示在这里。</span>
    </div>

    <div v-else class="trash-list" aria-live="polite">
      <div class="trash-list-summary">共 {{ trash.count }} 项</div>
      <article v-for="task in trash.tasks" :key="task.id ?? task.clientId" class="trash-row">
        <div class="trash-row-main">
          <h2>{{ taskTitle(task) }}</h2>
          <div class="trash-meta">
            <span>{{ task.taskBelonging || '项目管理' }}</span>
            <span>{{ taskStatus(task) }}</span>
            <span v-if="task.updatedAt">最后更新：{{ formatDateTimeLocal(task.updatedAt) }}</span>
            <span v-if="subtaskCount(task) > 0">含 {{ subtaskCount(task) }} 个子任务</span>
          </div>
        </div>
        <div class="trash-actions">
          <button
            type="button"
            class="restore-button"
            :disabled="!task.id || trash.isPending(task.id)"
            @click="restore(task)"
          >
            {{ trash.isPending(task.id) ? '处理中…' : '恢复' }}
          </button>
          <button
            type="button"
            class="permanent-delete-button"
            :disabled="!task.id || trash.isPending(task.id)"
            @click="openPermanentDeleteConfirmation(task)"
          >
            彻底删除
          </button>
        </div>
      </article>
    </div>

    <n-modal
      v-model:show="showPermanentDeleteConfirmation"
      :mask-closable="!isConfirmingPermanentDelete"
      :close-on-esc="!isConfirmingPermanentDelete"
    >
      <n-card
        class="permanent-delete-dialog"
        title="彻底删除任务"
        :bordered="false"
        role="alertdialog"
        aria-modal="true"
      >
        <p class="dialog-task-title">{{ taskToPermanentlyDelete ? taskTitle(taskToPermanentlyDelete) : '' }}</p>
        <p>此操作无法恢复。</p>
        <p>
          将永久删除服务中保存的任务记录、附件、任务文档、快照和报告副本，以及本机报告目录中该任务的应用保存副本；如任务含有子任务，子任务也会一并永久删除。
        </p>
        <p class="dialog-note">其他位置自行另存的文件不在本次清理范围内。</p>
        <p v-if="isConfirmingPermanentDelete" class="dialog-progress" role="status">正在请求服务彻底删除任务…</p>
        <p v-if="trash.error" class="dialog-error" role="alert">{{ trash.error }}</p>
        <template #footer>
          <div class="dialog-actions">
            <n-button :disabled="isConfirmingPermanentDelete" @click="closePermanentDeleteConfirmation">取消</n-button>
            <n-button
              type="error"
              :loading="isConfirmingPermanentDelete"
              :disabled="isConfirmingPermanentDelete"
              @click="confirmPermanentDelete"
            >
              彻底删除
            </n-button>
          </div>
        </template>
      </n-card>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NModal } from 'naive-ui'
import type { Task } from '@/stores/taskStore'
import { useTaskStore } from '@/stores/taskStore'
import { useTrashStore } from '@/stores/trashStore'
import { formatDateTimeLocal } from '@/utils/dateTime'
import { deleteTaskReportCopies } from '@/utils/reportFileActions'

const trash = useTrashStore()
const taskStore = useTaskStore()
const taskToPermanentlyDelete = ref<Task | null>(null)
const showPermanentDeleteConfirmation = ref(false)
const restoreNotice = ref('')
const isConfirmingPermanentDelete = computed(() =>
  taskToPermanentlyDelete.value ? trash.isPending(taskToPermanentlyDelete.value.id) : false,
)

function taskTitle(task: Task): string {
  return task.title.trim() || '未命名任务'
}

function taskStatus(task: Task): string {
  return task.status || (task.done ? '已完成' : '未开始')
}

function subtaskCount(task: Task): number {
  const nestedCount = (task.subtasks || []).reduce((total, child) => total + 1 + subtaskCount(child), 0)
  return Math.max(task.childCount || 0, nestedCount)
}

async function reload() {
  restoreNotice.value = ''
  await trash.fetchTrash().catch(() => undefined)
}

async function restore(task: Task) {
  restoreNotice.value = ''
  const restored = await trash.restoreTask(task)
  if (!restored) return

  try {
    // 不能只在垃圾桶页面移除条目：恢复成功后工作台必须重新从服务端加载。
    await taskStore.fetchTasks()
  } catch {
    restoreNotice.value = '任务已恢复，但工作台未能刷新。请重新连接本地服务后查看任务。'
  }
}

function openPermanentDeleteConfirmation(task: Task) {
  if (trash.isPending(task.id)) return
  taskToPermanentlyDelete.value = task
  showPermanentDeleteConfirmation.value = true
}

function closePermanentDeleteConfirmation() {
  if (isConfirmingPermanentDelete.value) return
  showPermanentDeleteConfirmation.value = false
  taskToPermanentlyDelete.value = null
}

async function confirmPermanentDelete() {
  const task = taskToPermanentlyDelete.value
  if (!task) return

  const outcome = await trash.permanentlyDeleteTask(task)
  if (!outcome) return
  // taskStore 保留软删除数据作历史归属建议；永久删除后不能让该缓存继续保留。
  taskStore.forgetTask(task)
  if (outcome.cleanupPending) {
    restoreNotice.value = '服务记录已删除，文件清理待处理。'
  }
  try {
    await deleteTaskReportCopies(task.id!)
  } catch {
    // 服务端已完成彻底删除，不能因本机副本清理失败而伪造失败或尝试回滚服务数据。
    restoreNotice.value = outcome.cleanupPending
      ? '服务记录已删除，文件清理待处理；本机报告副本清理失败。'
      : '服务数据已删除，但本机报告副本清理失败。'
  }
  closePermanentDeleteConfirmation()
}

onMounted(() => {
  void reload()
})
</script>

<style scoped>
.trash-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 28px clamp(20px, 3vw, 46px) 44px;
}

.trash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.trash-title-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  color: oklch(48% 0.03 245);
}

.trash-title-group h1 {
  color: var(--text-primary);
  font-size: 20px;
  line-height: 1.25;
  font-weight: 650;
}

.trash-title-group p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.refresh-button {
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.refresh-button:hover:not(:disabled) {
  background: var(--surface-mid);
  color: var(--text-primary);
}

.refresh-button:disabled,
.retry-button:disabled,
.restore-button:disabled,
.permanent-delete-button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.trash-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding: 10px 12px;
  border: 1px solid oklch(82% 0.08 25);
  border-radius: 6px;
  background: oklch(98% 0.025 25);
  color: oklch(42% 0.14 25);
  font-size: 13px;
}

.retry-button,
.restore-button,
.permanent-delete-button {
  min-height: 32px;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}

.retry-button {
  padding: 0 10px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
}

.trash-state {
  min-height: 260px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 14px;
  text-align: center;
}

.trash-empty strong {
  color: var(--text-secondary);
  font-size: 15px;
}

.trash-list {
  margin-top: 20px;
}

.trash-list-summary {
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.trash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface);
}

.trash-row + .trash-row {
  margin-top: 8px;
}

.trash-row-main {
  min-width: 0;
}

.trash-row h2 {
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}

.trash-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 7px;
  color: var(--text-muted);
  font-size: 12px;
}

.trash-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}

.restore-button {
  padding: 0 12px;
  border: 1px solid oklch(68% 0.1 145);
  background: oklch(96% 0.03 145);
  color: oklch(38% 0.12 145);
}

.restore-button:hover:not(:disabled) {
  background: oklch(92% 0.06 145);
}

.permanent-delete-button {
  padding: 0 12px;
  border: 1px solid oklch(76% 0.1 25);
  background: transparent;
  color: oklch(48% 0.16 25);
}

.permanent-delete-button:hover:not(:disabled) {
  background: oklch(96% 0.025 25);
}

.dialog-task-title {
  margin-bottom: 12px;
  color: var(--text-primary);
  font-weight: 650;
  overflow-wrap: anywhere;
}

.permanent-delete-dialog p + p {
  margin-top: 8px;
}

.permanent-delete-dialog p {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.permanent-delete-dialog .dialog-note {
  color: var(--text-muted);
  font-size: 13px;
}

.permanent-delete-dialog .dialog-progress {
  color: var(--text-secondary);
}

.permanent-delete-dialog .dialog-error {
  padding: 8px 10px;
  border: 1px solid oklch(82% 0.08 25);
  border-radius: 6px;
  background: oklch(98% 0.025 25);
  color: oklch(42% 0.14 25);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 720px) {
  .trash-page {
    padding: 20px 16px 30px;
  }

  .trash-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .trash-actions {
    width: 100%;
  }

  .trash-actions button {
    flex: 1;
  }
}
</style>
