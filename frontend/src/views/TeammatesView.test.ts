import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive, type App } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Task } from '@/stores/taskStore'

const mocks = vi.hoisted(() => ({
  auth: null as any,
  team: null as any,
  taskStore: {
    setView: vi.fn(),
    selectTask: vi.fn(),
  },
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => mocks.auth,
}))

vi.mock('@/stores/teamStore', () => ({
  useTeamStore: () => mocks.team,
}))

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => mocks.taskStore,
}))

import TeammatesView from './TeammatesView.vue'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function task(title: string): Task {
  return {
    id: 1,
    clientId: 'task-a',
    quadrant: 1,
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
    deleted: false,
  }
}

describe('队友任务账号切换隔离', () => {
  let app: App<Element> | null = null
  let mountPoint: HTMLDivElement | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth = reactive({ userId: 1, sessionRevision: 1 })
    mocks.team = {
      hasTeam: true,
      isInTeam: true,
      members: [{ userId: 2, username: '队友', role: '开发', joinedAt: '' }],
      fetchTeam: vi.fn(),
      fetchMemberTasks: vi.fn(),
      usernameOf: vi.fn(() => '队友'),
    }
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    app = null
    mountPoint = null
  })

  it('账号 A 的延迟队友任务响应不会显示在账号 B 会话中', async () => {
    const requestA = deferred<Task[]>()
    mocks.team.fetchMemberTasks.mockReturnValueOnce(requestA.promise)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: TeammatesView }],
    })
    await router.push('/')
    await router.isReady()

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(TeammatesView)
    app.use(router)
    app.mount(mountPoint)

    await vi.waitFor(() => {
      expect(mocks.team.fetchMemberTasks).toHaveBeenCalledWith(2, {})
    })

    mocks.auth.sessionRevision = 2
    await nextTick()
    requestA.resolve([task('账号 A 的队友任务')])
    await nextTick()
    await nextTick()

    expect(mountPoint.textContent).not.toContain('账号 A 的队友任务')
    expect(mountPoint.textContent).toContain('该队友暂无符合条件的任务。')
  })
})
