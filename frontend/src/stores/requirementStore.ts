import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  listRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  promoteRequirement,
  type Requirement,
  type RequirementInput,
} from '@/api'
import type { Task } from '@/stores/taskStore'

/**
 * 需求池 store（P2-4）。
 *
 * 需求是"未来计划做的事"：不进入四象限、不参与统计，只是先记下来。
 * 后端按 sort_order + created_at desc 排好序返回，前端保持该顺序。
 */
export const useRequirementStore = defineStore('requirements', () => {
  const requirements = ref<Requirement[]>([])
  const loading = ref(false)
  const error = ref('')
  let sessionRevision = 0

  async function fetchAll() {
    const requestRevision = sessionRevision
    loading.value = true
    error.value = ''
    try {
      const fetched = await listRequirements()
      if (requestRevision !== sessionRevision) return
      requirements.value = fetched
    } catch (err: any) {
      if (requestRevision !== sessionRevision) return
      error.value = err?.message || '加载需求失败'
    } finally {
      if (requestRevision === sessionRevision) loading.value = false
    }
  }

  async function add(input: RequirementInput): Promise<Requirement> {
    const requestRevision = sessionRevision
    const created = await createRequirement(input)
    if (!isCurrentSession(requestRevision)) return created
    requirements.value = [created, ...requirements.value]
    return created
  }

  async function update(id: number, input: RequirementInput): Promise<Requirement> {
    const requestRevision = sessionRevision
    const updated = await updateRequirement(id, input)
    if (!isCurrentSession(requestRevision)) return updated
    requirements.value = requirements.value.map(item => (item.id === id ? updated : item))
    return updated
  }

  async function remove(id: number): Promise<void> {
    const requestRevision = sessionRevision
    await deleteRequirement(id)
    if (!isCurrentSession(requestRevision)) return
    requirements.value = requirements.value.filter(item => item.id !== id)
  }

  /** 服务端负责转换事务；仅在当前账号会话仍有效时更新本地需求池。 */
  async function promoteToTask(id: number, quadrant: number): Promise<Task | null> {
    const requestRevision = sessionRevision
    const task = await promoteRequirement(id, quadrant)
    if (!isCurrentSession(requestRevision)) return null
    requirements.value = requirements.value.filter(item => item.id !== id)
    return task
  }

  /** Remove requirements from the prior account before another user signs in. */
  function clearSessionState() {
    sessionRevision += 1
    requirements.value = []
    error.value = ''
    loading.value = false
  }

  function isCurrentSession(requestRevision: number): boolean {
    return requestRevision === sessionRevision
  }

  return { requirements, loading, error, fetchAll, add, update, remove, promoteToTask, clearSessionState }
})
