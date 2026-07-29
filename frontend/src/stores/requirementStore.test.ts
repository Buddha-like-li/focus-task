import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Requirement } from '@/api'
import type { Task } from '@/stores/taskStore'

vi.mock('@/api', () => ({
  listRequirements: vi.fn(),
  createRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  deleteRequirement: vi.fn(),
  promoteRequirement: vi.fn(),
}))

import * as api from '@/api'
import { useRequirementStore } from './requirementStore'

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 1,
    title: '待转换需求',
    content: '',
    status: '计划中',
    priority: '中',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const promotedTask = {
  id: 10,
  clientId: 'promoted-task',
  quadrant: 4,
  title: '已转换任务',
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
  deleted: false,
} satisfies Task

describe('requirementStore promotion', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('removes the requirement only after the service returns the promoted task', async () => {
    const store = useRequirementStore()
    store.requirements = [makeRequirement(), makeRequirement({ id: 2, title: '保留需求' })]
    vi.mocked(api.promoteRequirement).mockResolvedValue(promotedTask)

    await expect(store.promoteToTask(1, 4)).resolves.toEqual(promotedTask)

    expect(api.promoteRequirement).toHaveBeenCalledWith(1, 4)
    expect(store.requirements).toEqual([expect.objectContaining({ id: 2 })])
  })

  it('keeps the requirement when the service rejects conversion', async () => {
    const store = useRequirementStore()
    const requirement = makeRequirement()
    store.requirements = [requirement]
    vi.mocked(api.promoteRequirement).mockRejectedValue(new Error('服务不可用'))

    await expect(store.promoteToTask(requirement.id, 1)).rejects.toThrow('服务不可用')

    expect(store.requirements).toEqual([requirement])
  })
})
