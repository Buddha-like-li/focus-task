<template>
  <div class="mates-page">
    <!-- Header -->
    <section class="mates-topbar">
      <div class="mates-heading">
        <span class="mates-eyebrow">团队</span>
        <h1>👥 队友任务</h1>
        <p>查看团队成员的任务进度（只读）</p>
      </div>
    </section>

    <!-- 空态：没有团队 -->
    <section v-if="!teamStore.hasTeam" class="mates-empty">
      <div class="mates-empty-icon">🤝</div>
      <p class="mates-empty-text">还没有团队，请先在设置中创建团队。</p>
      <button class="primary-btn" @click="router.push('/settings')">去设置</button>
    </section>

    <!-- 空态：不在团队里 -->
    <section v-else-if="!teamStore.isInTeam" class="mates-empty">
      <div class="mates-empty-icon">🚫</div>
      <p class="mates-empty-text">你不在团队中，无法查看队友任务。</p>
    </section>

    <template v-else>
      <!-- Filter bar -->
      <section class="mates-filters">
        <label class="mates-field">
          <span>队友</span>
          <select v-model.number="selectedUserId" class="mates-select">
            <option :value="null">全部队友</option>
            <option
              v-for="m in teammateOptions"
              :key="m.userId"
              :value="m.userId"
            >
              {{ m.username }}（{{ m.role || '成员' }}）
            </option>
          </select>
        </label>

        <label class="mates-field">
          <span>象限</span>
          <select v-model.number="filters.quadrant" class="mates-select">
            <option :value="null">全部</option>
            <option :value="1">重要且紧急</option>
            <option :value="2">重要不紧急</option>
            <option :value="3">紧急不重要</option>
            <option :value="4">不重要不紧急</option>
          </select>
        </label>

        <label class="mates-field">
          <span>状态</span>
          <select v-model="filters.status" class="mates-select">
            <option :value="null">全部</option>
            <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>

        <label class="mates-field">
          <span>类别</span>
          <select v-model="filters.category" class="mates-select">
            <option :value="null">全部</option>
            <option v-for="c in CATEGORY_OPTIONS" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
      </section>

      <!-- Loading -->
      <section v-if="loading" class="mates-empty">
        <p class="mates-empty-text">加载中…</p>
      </section>

      <!-- Empty result -->
      <section v-else-if="tasks.length === 0" class="mates-empty">
        <div class="mates-empty-icon">📭</div>
        <p class="mates-empty-text">该队友暂无符合条件的任务。</p>
      </section>

      <!-- Task list -->
      <section v-else class="mates-list">
        <article
          v-for="task in tasks"
          :key="task.clientId"
          class="mates-card"
          @click="openTask(task)"
        >
          <span class="mates-status-dot" :style="statusDotStyle(task.status, task.done)"></span>

          <div class="mates-card-main">
            <div class="mates-title-row">
              <span class="mates-title" :title="task.title">{{ task.title || '未命名任务' }}</span>
              <span
                v-if="task.category"
                class="mates-cat-badge"
                :style="categoryStyle(task.category)"
              >{{ task.category }}</span>
              <span
                v-if="task.previousOwnerId != null && task.previousOwnerId === auth.userId"
                class="mates-transfer-tag"
                :title="task.transferNote || '该任务由你转交给当前队友'"
              >由你转交<template v-if="task.transferNote">：{{ task.transferNote }}</template></span>
            </div>
            <div class="mates-meta-row">
              <span class="mates-owner">@{{ ownerName(task) }}</span>
              <span v-if="task.due" class="mates-due">截止 {{ formatDue(task.due) }}</span>
              <span v-else class="mates-due mates-due-empty">无截止时间</span>
              <span v-if="task.status" class="mates-status-text" :style="statusTextStyle(task.status)">{{ task.status }}</span>
            </div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTeamStore } from '@/stores/teamStore'
import { useAuthStore } from '@/stores/authStore'
import { useTaskStore, type Task } from '@/stores/taskStore'

const teamStore = useTeamStore()
const auth = useAuthStore()
const taskStore = useTaskStore()
const router = useRouter()

const STATUS_OPTIONS = ['未开始', '进行中', '开发阶段', 'PR阶段', '测试阶段', '验证中', '已完成', '挂起']
const CATEGORY_OPTIONS = ['需求', 'bug', '研究']

interface FilterState {
  quadrant: number | null
  status: string | null
  category: string | null
}

const selectedUserId = ref<number | null>(null)
const filters = ref<FilterState>({ quadrant: null, status: null, category: null })
const tasks = ref<Task[]>([])
const loading = ref(false)
let taskRequestRevision = 0

// 下拉只列其他队友（排除当前用户），队友任务视图是看"别人"的。
const teammateOptions = computed(() =>
  teamStore.members.filter(m => m.userId !== auth.userId)
)

function buildFilters(): { quadrant?: number; status?: string; category?: string } {
  const out: { quadrant?: number; status?: string; category?: string } = {}
  if (filters.value.quadrant != null) out.quadrant = filters.value.quadrant
  if (filters.value.status) out.status = filters.value.status
  if (filters.value.category) out.category = filters.value.category
  return out
}

async function loadTasks() {
  const requestRevision = ++taskRequestRevision
  const sessionRevision = auth.sessionRevision
  const isCurrentRequest = () => (
    requestRevision === taskRequestRevision && sessionRevision === auth.sessionRevision
  )

  if (!teamStore.hasTeam || !teamStore.isInTeam) {
    if (isCurrentRequest()) {
      tasks.value = []
      loading.value = false
    }
    return
  }
  loading.value = true
  try {
    const f = buildFilters()
    if (selectedUserId.value != null) {
      const loaded = await teamStore.fetchMemberTasks(selectedUserId.value, f)
      if (!isCurrentRequest()) return
      tasks.value = loaded
    } else {
      // 全部队友：并发拉取后合并。排除自己。
      const targets = teammateOptions.value.map(m => m.userId)
      const results = await Promise.all(
        targets.map(uid => teamStore.fetchMemberTasks(uid, f).catch(() => [] as Task[]))
      )
      if (!isCurrentRequest()) return
      tasks.value = results.flat()
    }
  } catch {
    if (!isCurrentRequest()) return
    tasks.value = []
  } finally {
    if (isCurrentRequest()) loading.value = false
  }
}

watch(
  () => auth.sessionRevision,
  () => {
    taskRequestRevision += 1
    tasks.value = []
    loading.value = false
  },
)

// 筛选或队友变更时重新拉取。imputed 触发会立即跑一次，覆盖初次加载。
watch(
  [selectedUserId, () => filters.value.quadrant, () => filters.value.status, () => filters.value.category],
  () => {
    loadTasks()
  },
  { immediate: true }
)

onMounted(() => {
  // 兜底：AppLayout 也会拉，但这里再保证一次。
  if (!teamStore.hasTeam) {
    teamStore.fetchTeam().catch(() => {}).finally(() => {
      // 成员列表就绪后再触发一次加载（watch immediate 跑得早，此时可能
      // 还没有成员，会直接返回空）。这里只在还没加载过且确实进团队时补跑。
      if (teamStore.isInTeam && tasks.value.length === 0 && !loading.value) {
        loadTasks()
      }
    })
  }
})

onBeforeUnmount(() => {
  taskRequestRevision += 1
})

function openTask(task: Task) {
  // TeammatesView 是全屏视图，DetailPanel 仅在非全屏视图下渲染。先切回
  // matrix 让面板挂上，再选中任务，详情面板即可正确渲染（只读模式由
  // DetailPanel 根据任务属主判断，这里只需保证 selectTask 被调用）。
  taskStore.setView('matrix')
  taskStore.selectTask(task.clientId)
}

function ownerName(task: Task): string {
  // Task 不直接含 user_id，列表项的"属主"显示选中队友名；全部队友模式
  // 下用 owner 字段兜底（可能是中文名/角色），保证有可读文本。
  if (selectedUserId.value != null) {
    return teamStore.usernameOf(selectedUserId.value) || task.owner || '队友'
  }
  return task.owner || '队友'
}

function formatDue(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Status / category styling ───
// 状态圆点：已完成=绿、开发/PR阶段=蓝、测试/验证=橙、挂起=灰、未开始=空心
function statusDotStyle(status: string | undefined, done: boolean): Record<string, string> {
  const s = status || (done ? '已完成' : '未开始')
  if (s === '已完成') return { background: 'oklch(60% 0.15 145)', border: '1px solid oklch(60% 0.15 145)' }
  if (s === '开发阶段' || s === 'PR阶段') return { background: 'oklch(58% 0.13 240)', border: '1px solid oklch(58% 0.13 240)' }
  if (s === '测试阶段' || s === '验证中' || s === '进行中') return { background: 'oklch(70% 0.14 60)', border: '1px solid oklch(70% 0.14 60)' }
  if (s === '挂起') return { background: 'transparent', border: '1px solid oklch(70% 0.01 240)' }
  // 未开始 = 空心
  return { background: 'transparent', border: '1px solid var(--text-muted)' }
}

function statusTextStyle(status: string | undefined): string {
  const s = status || '未开始'
  const map: Record<string, string> = {
    未开始: 'color: var(--text-muted)',
    进行中: 'color: oklch(55% 0.13 60)',
    开发阶段: 'color: oklch(50% 0.13 240)',
    PR阶段: 'color: oklch(50% 0.13 250)',
    测试阶段: 'color: oklch(52% 0.13 70)',
    验证中: 'color: oklch(52% 0.13 70)',
    已完成: 'color: oklch(48% 0.13 145)',
    挂起: 'color: var(--text-muted)',
  }
  return map[s] || map['未开始']
}

// 类别徽章：需求=蓝、bug=红、研究=紫
function categoryStyle(category?: string): string {
  const map: Record<string, string> = {
    需求: 'background: oklch(94% 0.04 240); color: oklch(45% 0.12 240)',
    bug: 'background: oklch(94% 0.05 25); color: oklch(48% 0.16 25)',
    研究: 'background: oklch(95% 0.04 300); color: oklch(45% 0.13 300)',
  }
  return (category && map[category]) || map['需求']
}
</script>

<style scoped>
.mates-page {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background:
    linear-gradient(180deg, oklch(98.8% 0.003 240), oklch(97.8% 0.004 240));
}

.mates-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.mates-heading {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.mates-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.mates-heading h1 {
  font-size: 26px;
  line-height: 1.1;
  font-weight: 650;
  color: var(--text-primary);
}

.mates-heading p {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
}

/* ─── Filter bar ─── */
.mates-filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.mates-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 auto;
}

.mates-field > span {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.mates-select {
  width: 160px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 13px;
  background: var(--surface);
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
  cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.mates-select:focus {
  border-color: oklch(62% 0.1 240);
  box-shadow: 0 0 0 3px oklch(62% 0.1 240 / 0.12);
}

/* ─── Task list ─── */
.mates-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mates-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.mates-card:hover {
  border-color: oklch(70% 0.1 240);
  box-shadow: 0 2px 8px oklch(0% 0 0 / 0.04);
}

.mates-status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
  box-sizing: border-box;
}

.mates-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mates-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.mates-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.mates-cat-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.mates-transfer-tag {
  flex-shrink: 0;
  background: oklch(90% 0.08 60);
  color: oklch(50% 0.15 60);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 8px;
  white-space: nowrap;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mates-meta-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-muted);
}

.mates-owner {
  font-weight: 500;
  color: var(--text-secondary);
}

.mates-due {
  white-space: nowrap;
}

.mates-due-empty {
  font-style: italic;
}

.mates-status-text {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* ─── Empty / loading ─── */
.mates-empty {
  padding: 60px 0;
  text-align: center;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.mates-empty-icon {
  font-size: 36px;
}

.mates-empty-text {
  font-size: 14px;
  margin: 0;
}

.primary-btn {
  background: oklch(55% 0.12 240);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition);
}

.primary-btn:hover {
  background: oklch(48% 0.13 240);
}

@media (max-width: 720px) {
  .mates-select {
    width: 140px;
  }
  .mates-filters {
    gap: 8px;
  }
}
</style>
