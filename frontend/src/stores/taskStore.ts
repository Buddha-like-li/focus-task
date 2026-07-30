import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import { normalizeDateTimeLocal } from '@/utils/dateTime'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTrashStore } from '@/stores/trashStore'
import { appLogger } from '@/composables/useAppLogger'

export interface Task {
  id?: number
  clientId: string
  quadrant: number
  title: string
  notes: string
  done: boolean
  startAt: string
  due: string
  tag: string
  repeat: string
  notifyOnStart: boolean
  notifyOnDue: boolean
  notifyOnOverdue: boolean
  showInFocus: boolean
  sortOrder: number
  doneAt: string
  deleted: boolean
  taskBelonging?: string
  category?: string
  owner?: string
  source?: string
  status?: string
  parentTaskId?: string
  priority?: string
  totalCost?: number | null
  personDays?: number | null
  createdAt?: string
  updatedAt?: string
  subtasks?: Task[]
  childCount?: number
  requirementId?: number | null
  previousOwnerId?: number | null
  transferNote?: string
}

export type TaskView =
  | 'matrix'
  | 'today'
  | 'done'
  | 'reports'
  | 'summary'
  | 'requirements'
  | 'teammates'
  | 'trash'

export const useTaskStore = defineStore('tasks', () => {
  const settings = useSettingsStore()
  const tasks = ref<Task[]>([])
  const selectedTaskId = ref<string | null>(null)
  const currentView = ref<TaskView>('matrix')
  const searchQuery = ref('')
  const filterQuadrant = ref<number | null>(null)
  const loading = ref(false)
  const serviceError = ref('')
  // A logout invalidates all requests started by the prior account. This is
  // deliberately separate from request ordering within one account.
  let sessionRevision = 0
  // A successful local mutation must also invalidate an earlier list request
  // from the same account, otherwise its stale response can resurrect a task.
  let listRevision = 0

  function normalizeTask(task: Task): Task {
    return {
      ...task,
      startAt: normalizeDateTimeLocal(task.startAt || '', settings.state.defaultStartTime || '09:00'),
      due: normalizeDateTimeLocal(task.due || '', settings.state.defaultDueTime || '18:00'),
      notifyOnStart: task.notifyOnStart ?? true,
      notifyOnDue: task.notifyOnDue ?? true,
      notifyOnOverdue: task.notifyOnOverdue ?? true,
      taskBelonging: (task.taskBelonging ?? '').trim() || '项目管理',
      category: task.category || '需求',
      owner: task.owner || '唐星',
      source: task.source || '开发自测',
      status: task.status || (task.done ? '已完成' : '未开始'),
      parentTaskId: task.parentTaskId || '',
      priority: task.priority || '中',
      totalCost: task.totalCost ?? null,
      personDays: task.personDays ?? null,
      subtasks: task.subtasks ?? [],
      childCount: task.childCount ?? 0,
      requirementId: task.requirementId ?? null,
      previousOwnerId: task.previousOwnerId ?? null,
      transferNote: task.transferNote ?? '',
    }
  }

  function flattenTasks(serverTasks: Task[]): Task[] {
    const flattened: Task[] = []
    for (const task of serverTasks) {
      flattened.push(task)
      if (task.subtasks?.length) flattened.push(...flattenTasks(task.subtasks))
    }
    return flattened
  }

  function replaceServerTasks(serverTasks: Task[], invalidatePendingList = true) {
    if (invalidatePendingList) listRevision += 1
    tasks.value = flattenTasks(serverTasks).map(normalizeTask)
    if (selectedTaskId.value && !tasks.value.some(task => task.clientId === selectedTaskId.value && !task.deleted)) {
      selectedTaskId.value = null
    }
  }

  /** 写入或刷新服务端工作流返回的单个任务。 */
  function upsertServerTask(serverTask: Task): Task {
    listRevision += 1
    const normalized = normalizeTask(serverTask)
    const index = tasks.value.findIndex(task => task.clientId === normalized.clientId)
    if (index === -1) tasks.value.unshift(normalized)
    else tasks.value.splice(index, 1, normalized)
    serviceError.value = ''
    return normalized
  }

  /** Remove account-specific task data before another user signs in. */
  function clearSessionState() {
    sessionRevision += 1
    listRevision += 1
    tasks.value = []
    selectedTaskId.value = null
    searchQuery.value = ''
    filterQuadrant.value = null
    serviceError.value = ''
    loading.value = false
    currentView.value = 'matrix'
  }

  function isCurrentSession(requestRevision: number): boolean {
    return requestRevision === sessionRevision
  }

  function invalidatePendingList() {
    listRevision += 1
    loading.value = false
  }

  const activeTasks = computed(() => tasks.value.filter(task => !task.deleted))
  const selectedTask = computed(() =>
    activeTasks.value.find(task => task.clientId === selectedTaskId.value) || null,
  )
  const serviceConnected = computed(() => !loading.value && !serviceError.value)

  function quadrantTasks(quadrant: number) {
    return activeTasks.value
      .filter(task => task.quadrant === quadrant)
      .sort((a, b) => a.sortOrder - b.sortOrder || (b.createdAt || '').localeCompare(a.createdAt || ''))
  }

  const todayTasks = computed(() => {
    const today = new Date().toISOString().slice(0, 10)
    return activeTasks.value.filter(task => task.due.slice(0, 10) === today && !task.done)
  })

  const doneTasks = computed(() =>
    activeTasks.value.filter(task => task.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')),
  )

  async function fetchTasks() {
    const requestRevision = sessionRevision
    const requestListRevision = ++listRevision
    loading.value = true
    serviceError.value = ''
    try {
      const serverTasks = await api.listTasks(true)
      if (requestRevision !== sessionRevision || requestListRevision !== listRevision) return
      replaceServerTasks(serverTasks, false)
    } catch (error) {
      if (requestRevision !== sessionRevision || requestListRevision !== listRevision) return
      serviceError.value = error instanceof Error ? error.message : '无法连接 Focus Task 服务'
      appLogger.warn('[tasks] fetchTasks failed', error)
      throw error
    } finally {
      if (requestRevision === sessionRevision && requestListRevision === listRevision) loading.value = false
    }
  }

  async function addTask(quadrant: number, title: string): Promise<Task> {
    const requestRevision = sessionRevision
    const now = new Date().toISOString()
    const clientId = crypto.randomUUID()
    const created = await api.createTask({
      clientId,
      quadrant,
      title,
      notes: '',
      done: false,
      startAt: '',
      due: '',
      tag: '',
      repeat: 'none',
      notifyOnStart: true,
      notifyOnDue: true,
      notifyOnOverdue: true,
      showInFocus: false,
      sortOrder: 0,
      doneAt: '',
      taskBelonging: '项目管理',
      category: '需求',
      owner: '唐星',
      source: '开发自测',
      status: '未开始',
      parentTaskId: '',
      priority: '中',
      totalCost: null,
      personDays: null,
      createdAt: now,
      updatedAt: now,
      requirementId: null,
    })
    const task = normalizeTask(created)
    if (!isCurrentSession(requestRevision)) return task
    tasks.value.unshift(task)
    selectedTaskId.value = task.clientId
    serviceError.value = ''
    return task
  }

  async function updateTask(clientId: string, updates: Partial<Task>): Promise<boolean> {
    const requestRevision = sessionRevision
    const task = tasks.value.find(item => item.clientId === clientId)
    if (!task?.id) return false

    const previous = { ...task }
    let patch = updates
    if (updates.status !== undefined) {
      const done = updates.status === '已完成'
      patch = { ...updates, done, doneAt: done ? (task.doneAt || new Date().toISOString()) : '' }
    }
    Object.assign(task, patch)

    try {
      const updated = await api.updateTask(task.id, patch)
      if (!isCurrentSession(requestRevision)) return false
      Object.assign(task, normalizeTask(updated))
      serviceError.value = ''
      return true
    } catch (error) {
      if (!isCurrentSession(requestRevision)) return false
      Object.assign(task, previous)
      serviceError.value = error instanceof Error ? error.message : '保存任务失败'
      appLogger.warn('[tasks] updateTask failed', error)
      return false
    }
  }

  async function ensurePersisted(clientId: string): Promise<Task> {
    const task = tasks.value.find(item => item.clientId === clientId)
    if (!task?.id) {
      throw new Error('任务尚未写入 Focus Task 服务，请确认服务容器正在运行后重试。')
    }
    return task
  }

  async function toggleDone(clientId: string) {
    const task = tasks.value.find(item => item.clientId === clientId)
    if (!task) return
    await updateTask(clientId, {
      done: !task.done,
      doneAt: task.done ? '' : new Date().toISOString(),
      status: task.done ? '未开始' : '已完成',
    })
  }

  function taskTreeClientIds(rootClientId: string): Set<string> {
    const ids = new Set([rootClientId])
    let foundDescendant = true
    while (foundDescendant) {
      foundDescendant = false
      for (const task of tasks.value) {
        if (task.parentTaskId && ids.has(task.parentTaskId) && !ids.has(task.clientId)) {
          ids.add(task.clientId)
          foundDescendant = true
        }
      }
    }
    return ids
  }

  /** 普通删除仅将任务移入垃圾桶，用户可在垃圾桶中恢复或彻底删除。 */
  async function moveTaskToTrash(clientId: string): Promise<boolean> {
    const requestRevision = sessionRevision
    const task = tasks.value.find(item => item.clientId === clientId)
    if (!task?.id) return false
    try {
      const trashStore = useTrashStore()
      await trashStore.ensureTrashSupported()
      if (!isCurrentSession(requestRevision)) return false
      await api.moveTaskToTrash(task.id)
      if (!isCurrentSession(requestRevision)) return false
      invalidatePendingList()
      const movedTaskIds = taskTreeClientIds(clientId)
      tasks.value = tasks.value.filter(item => !movedTaskIds.has(item.clientId))
      if (selectedTaskId.value && movedTaskIds.has(selectedTaskId.value)) selectedTaskId.value = null
      trashStore.recordMovedTask(task)
      serviceError.value = ''
      return true
    } catch (error) {
      if (!isCurrentSession(requestRevision)) return false
      serviceError.value = error instanceof Error ? error.message : '移入垃圾桶失败'
      appLogger.warn('[tasks] moveTaskToTrash failed', error)
      return false
    }
  }

  /** @deprecated 使用 moveTaskToTrash；旧调用仍保持“移入垃圾桶”语义。 */
  async function removeTask(clientId: string): Promise<boolean> {
    return moveTaskToTrash(clientId)
  }

  /** 在服务端永久删除成功后清除当前账号内存中的旧任务副本。 */
  function forgetTask(task: Pick<Task, 'id' | 'clientId'>) {
    invalidatePendingList()
    const removedTaskIds = taskTreeClientIds(task.clientId)
    tasks.value = tasks.value.filter((item) => item.id !== task.id && !removedTaskIds.has(item.clientId))
    if (selectedTaskId.value && removedTaskIds.has(selectedTaskId.value)) selectedTaskId.value = null
  }

  async function reorderTasks(items: { clientId: string; sortOrder: number }[]): Promise<boolean> {
    const requestRevision = sessionRevision
    await api.reorderTasks(items)
    return isCurrentSession(requestRevision)
  }

  function selectTask(clientId: string | null) {
    selectedTaskId.value = clientId
  }

  function setView(view: TaskView) {
    currentView.value = view
  }

  return {
    tasks,
    selectedTaskId,
    currentView,
    searchQuery,
    loading,
    serviceError,
    serviceConnected,
    activeTasks,
    selectedTask,
    quadrantTasks,
    todayTasks,
    doneTasks,
    filterQuadrant,
    replaceServerTasks,
    clearSessionState,
    upsertServerTask,
    fetchTasks,
    addTask,
    updateTask,
    ensurePersisted,
    toggleDone,
    moveTaskToTrash,
    removeTask,
    forgetTask,
    reorderTasks,
    selectTask,
    setView,
  }
})
