import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  listRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  type Requirement,
  type RequirementInput,
} from '@/api'

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

  async function fetchAll() {
    loading.value = true
    error.value = ''
    try {
      requirements.value = await listRequirements()
    } catch (err: any) {
      error.value = err?.message || '加载需求失败'
    } finally {
      loading.value = false
    }
  }

  async function add(input: RequirementInput): Promise<Requirement> {
    const created = await createRequirement(input)
    requirements.value = [created, ...requirements.value]
    return created
  }

  async function update(id: number, input: RequirementInput): Promise<Requirement> {
    const updated = await updateRequirement(id, input)
    requirements.value = requirements.value.map(item => (item.id === id ? updated : item))
    return updated
  }

  async function remove(id: number): Promise<void> {
    await deleteRequirement(id)
    requirements.value = requirements.value.filter(item => item.id !== id)
  }

  return { requirements, loading, error, fetchAll, add, update, remove }
})
