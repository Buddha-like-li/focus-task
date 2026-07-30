import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Task } from '@/stores/taskStore'
import { appLogger } from '@/composables/useAppLogger'

type TrashAction = 'load' | 'restore' | 'permanentDelete'

export interface PermanentDeleteOutcome {
  cleanupPending: boolean
}

function formatTrashError(error: unknown, action: TrashAction): string {
  if (typeof api.ApiRequestError === 'function' && error instanceof api.ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return '登录状态已失效或当前账号无权操作该任务，请重新登录后重试。'
    }
    if (error.status === 404) {
      return '任务已不存在、未在垃圾桶中，或不属于当前账号。请刷新后重试。'
    }
    if (error.status === 409) {
      return action === 'restore'
        ? '该任务当前无法恢复。可能与已有任务冲突，或不满足本机任务的安全限制。'
        : '该任务当前无法彻底删除。可能与已有任务冲突，或不满足本机任务的安全限制。'
    }
  }

  if (error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)) {
    return error.message
  }

  if (action === 'restore') return '恢复任务失败，请确认本地服务正常后重试。'
  if (action === 'permanentDelete') return '彻底删除任务失败，请确认本地服务正常后重试。'
  return '无法加载垃圾桶，请确认本地服务正常后重试。'
}

export const useTrashStore = defineStore('trash', () => {
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const error = ref('')
  const pendingTaskIds = ref<Set<number>>(new Set())
  let sessionRevision = 0
  let listRevision = 0

  const count = computed(() => tasks.value.length)

  function isCurrentSession(requestRevision: number): boolean {
    return requestRevision === sessionRevision
  }

  function setPending(taskId: number, pending: boolean) {
    const next = new Set(pendingTaskIds.value)
    if (pending) next.add(taskId)
    else next.delete(taskId)
    pendingTaskIds.value = next
  }

  function isPending(taskId: number | undefined): boolean {
    return taskId !== undefined && pendingTaskIds.value.has(taskId)
  }

  /** 账户切换或退出时，废弃旧账号尚未完成的网络响应。 */
  function clearSessionState() {
    sessionRevision += 1
    listRevision += 1
    tasks.value = []
    loading.value = false
    error.value = ''
    pendingTaskIds.value = new Set()
  }

  /** 垃圾桶始终从服务端单独加载，绝不复用工作台的历史任务缓存。 */
  async function fetchTrash(): Promise<void> {
    const requestRevision = sessionRevision
    const requestListRevision = ++listRevision
    loading.value = true
    error.value = ''
    try {
      const serverTasks = await api.listTrashTasks()
      if (!isCurrentSession(requestRevision) || requestListRevision !== listRevision) return
      // 服务端契约只返回已删除任务；客户端仍做防御性过滤，避免活动任务误入垃圾桶。
      tasks.value = serverTasks.filter((task) => task.deleted)
    } catch (caught) {
      if (!isCurrentSession(requestRevision) || requestListRevision !== listRevision) return
      error.value = formatTrashError(caught, 'load')
      appLogger.warn('[垃圾桶] 加载失败', caught)
      throw caught
    } finally {
      if (isCurrentSession(requestRevision) && requestListRevision === listRevision) loading.value = false
    }
  }

  /**
   * 任务从工作台移入垃圾桶后立即更新导航数量。同步失效早于此次
   * 操作发起的列表请求，避免旧响应覆盖新的乐观条目。
   */
  function recordMovedTask(task: Task) {
    listRevision += 1
    const trashed = { ...task, deleted: true }
    const index = tasks.value.findIndex((item) => item.id === trashed.id || item.clientId === trashed.clientId)
    if (index === -1) tasks.value.unshift(trashed)
    else tasks.value.splice(index, 1, trashed)
    error.value = ''
  }

  async function restoreTask(task: Task): Promise<Task | null> {
    if (!task.id || isPending(task.id)) return null

    const requestRevision = sessionRevision
    setPending(task.id, true)
    error.value = ''
    try {
      const restored = await api.restoreTrashTask(task.id)
      if (!isCurrentSession(requestRevision)) return null
      listRevision += 1
      tasks.value = tasks.value.filter((item) => item.id !== task.id)
      return restored
    } catch (caught) {
      if (!isCurrentSession(requestRevision)) return null
      error.value = formatTrashError(caught, 'restore')
      appLogger.warn('[垃圾桶] 恢复失败', caught)
      return null
    } finally {
      if (isCurrentSession(requestRevision)) setPending(task.id, false)
    }
  }

  async function permanentlyDeleteTask(task: Task): Promise<PermanentDeleteOutcome | null> {
    if (!task.id || isPending(task.id)) return null

    const requestRevision = sessionRevision
    setPending(task.id, true)
    error.value = ''
    try {
      const result = await api.permanentlyDeleteTask(task.id)
      if (!isCurrentSession(requestRevision)) return null
      if (result.ok !== true || result.permanentlyDeleted !== true) {
        error.value = '服务未确认任务已彻底删除，请刷新垃圾桶后重试。'
        appLogger.warn('[垃圾桶] 服务未确认彻底删除', result)
        return null
      }
      listRevision += 1
      tasks.value = tasks.value.filter((item) => item.id !== task.id)
      return { cleanupPending: result.cleanupPending === true }
    } catch (caught) {
      if (!isCurrentSession(requestRevision)) return null
      error.value = formatTrashError(caught, 'permanentDelete')
      appLogger.warn('[垃圾桶] 彻底删除失败', caught)
      return null
    } finally {
      if (isCurrentSession(requestRevision)) setPending(task.id, false)
    }
  }

  return {
    tasks,
    loading,
    error,
    count,
    clearSessionState,
    fetchTrash,
    recordMovedTask,
    restoreTask,
    permanentlyDeleteTask,
    isPending,
  }
})
