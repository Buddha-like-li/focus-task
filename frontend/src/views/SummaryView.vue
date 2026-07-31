<template>
  <div class="summary-page">
    <!-- Header: mode toggle + period navigation -->
    <section class="summary-topbar">
      <div class="summary-heading">
        <span class="summary-eyebrow">总结</span>
        <h1>{{ periodTitle }}</h1>
        <p>{{ periodDescription }}</p>
      </div>

      <div class="summary-controls">
        <div class="mode-segment">
          <button
            v-for="opt in modeOptions"
            :key="opt.value"
            class="mode-pill"
            :class="{ active: mode === opt.value }"
            @click="switchMode(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="period-nav">
          <button class="period-arrow" @click="shiftPeriod(-1)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M10 3L5 8L10 13" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <span class="period-label">{{ periodLabel }}</span>
          <button class="period-arrow" @click="shiftPeriod(1)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M6 3L11 8L6 13" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button v-if="offset !== 0" class="period-today" @click="offset = 0">回到本期</button>
        </div>
      </div>
    </section>

    <!-- Core metrics with comparison -->
    <section class="summary-metrics">
      <article v-for="m in metricCards" :key="m.key" class="metric-tile">
        <span class="metric-label">{{ m.label }}</span>
        <div class="metric-row">
          <strong class="metric-value" :class="{ 'metric-value-text': m.isText }">{{ m.value }}</strong>
          <span
            v-if="m.delta !== null"
            class="metric-delta"
            :class="{ up: m.delta > 0, down: m.delta < 0, flat: m.delta === 0 }"
          >
            <svg v-if="m.delta > 0" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8L6 4L10 8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg v-if="m.delta < 0" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4L6 8L10 4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {{ m.deltaText }}
          </span>
        </div>
        <span class="metric-note">{{ m.note }}</span>
      </article>
    </section>

    <!-- Quadrant health + Completed tasks -->
    <section class="summary-mid">
      <article class="health-panel">
        <div class="panel-head">
          <div>
            <span class="panel-kicker">象限</span>
            <h2>象限健康度</h2>
          </div>
          <span class="panel-meta">{{ currentCompleted }} 项完成</span>
        </div>

        <div class="health-list">
          <div v-for="item in quadrantHealth" :key="item.quadrant" class="health-row">
            <div class="health-label">
              <span class="health-dot" :style="{ background: item.color }"></span>
              <span>{{ item.label }}</span>
            </div>
            <div class="health-bar-track">
              <div class="health-bar-fill" :style="{ width: item.share + '%', background: item.color }"></div>
            </div>
            <span class="health-count">{{ item.count }}</span>
            <span class="health-share">{{ item.share }}%</span>
            <span class="health-tag" :class="item.assessment.level">{{ item.assessment.text }}</span>
          </div>
        </div>

        <div class="health-verdict" :class="overallVerdict.level">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8L10.5 9.5"/>
          </svg>
          <span>{{ overallVerdict.text }}</span>
        </div>
      </article>

      <article class="completed-panel">
        <div class="panel-head">
          <div>
            <span class="panel-kicker">记录</span>
            <h2>完成任务</h2>
          </div>
          <span class="panel-meta">{{ completedTaskList.length }} 项</span>
        </div>

        <div v-if="completedTaskList.length === 0" class="panel-empty">本周期暂无完成的任务</div>
        <div v-else class="completed-list">
          <div
            v-for="group in groupedCompletedTasks"
            :key="group.task.clientId"
            class="completed-group"
          >
            <div class="completed-item" :class="{ 'has-children': !group.orphan && group.children.length > 0 }">
              <svg class="task-check-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="oklch(52% 0.15 145)" stroke-width="2">
                <path d="M3 8.5L6.5 12L13 4.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="completed-title">{{ group.task.title || '未命名任务' }}</span>
              <span v-if="group.orphan" class="orphan-tag">无父任务</span>
              <span
                v-else-if="group.children.length > 0"
                class="child-count-badge"
              >⊕ {{ group.children.length }}</span>
              <button
                v-if="!group.orphan && group.children.length > 0"
                type="button"
                class="expand-arrow"
                :class="{ expanded: expandedGroups.has(group.task.clientId) }"
                :aria-expanded="expandedGroups.has(group.task.clientId)"
                @click="toggleGroup(group.task.clientId)"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M6 3L11 8L6 13" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <span class="completed-time">{{ formatDoneDate(group.task.doneAt || '') }}</span>
            </div>
            <div
              v-if="!group.orphan && group.children.length > 0 && expandedGroups.has(group.task.clientId)"
              class="subtask-list"
            >
              <div v-for="child in group.children" :key="child.clientId" class="subtask-item">
                <svg class="subtask-check-icon" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="oklch(52% 0.15 145)" stroke-width="2">
                  <path d="M3 8.5L6.5 12L13 4.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="subtask-title">{{ child.title || '未命名任务' }}</span>
                <span class="subtask-time">{{ formatDoneDate(child.doneAt || '') }}</span>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>

    <!-- Highlights & Suggestions -->
    <section class="summary-bottom">
      <article class="highlights-panel">
        <div class="panel-head">
          <div>
            <span class="panel-kicker">亮点</span>
            <h2>高光任务</h2>
          </div>
          <span class="panel-meta">本周期完成的重点</span>
        </div>

        <div v-if="highlightTasks.length === 0" class="panel-empty">本周期暂无完成的重要任务</div>
        <div v-else class="highlights-list">
          <div v-for="(task, index) in highlightTasks" :key="task.clientId" class="highlight-item">
            <span class="highlight-rank">{{ index + 1 }}</span>
            <div class="highlight-accent" :style="{ background: qColors[task.quadrant] }"></div>
            <div class="highlight-main">
              <strong>{{ task.title || '未命名任务' }}<span v-if="task.childCount" class="highlight-subtask-hint">（含 {{ task.childCount }} 个子任务）</span></strong>
              <div class="highlight-meta">
                <span class="highlight-badge" :style="{ color: qColors[task.quadrant] }">{{ qLabels[task.quadrant] }}</span>
                <span v-if="task.tag">{{ task.tag }}</span>
                <span>{{ formatDoneDate(task.doneAt || '') }}</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="suggestions-panel">
        <div class="panel-head">
          <div>
            <span class="panel-kicker">建议</span>
            <h2>改进方向</h2>
          </div>
        </div>

        <div v-if="suggestions.length === 0" class="panel-empty">保持节奏，继续加油</div>
        <div v-else class="suggestions-list">
          <div v-for="(s, i) in suggestions" :key="i" class="suggestion-item" :class="s.level">
            <svg v-if="s.level === 'warn'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2L14.5 13H1.5L8 2Z" stroke-linejoin="round"/><path d="M8 6.5V9.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>
            <svg v-else-if="s.level === 'good'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8.5L6.5 12L13 4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5V8.5M8 11h.01" stroke-linecap="round"/></svg>
            <span>{{ s.text }}</span>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTaskStore, type Task } from '@/stores/taskStore'
import { isOverdueDateTime, toDateKey } from '@/utils/dateTime'

const store = useTaskStore()

type ViewMode = 'week' | 'month'

const mode = ref<ViewMode>('week')
const offset = ref(0)

const qColors: Record<number, string> = {
  1: 'oklch(62% 0.14 4)',
  2: 'oklch(54% 0.13 138)',
  3: 'oklch(56% 0.12 205)',
  4: 'oklch(50% 0.01 240)',
}

const qLabels: Record<number, string> = {
  1: '重要且紧急',
  2: '重要不紧急',
  3: '紧急不重要',
  4: '不重要不紧急',
}

const modeOptions = [
  { label: '周报', value: 'week' as ViewMode },
  { label: '月报', value: 'month' as ViewMode },
]

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Period calculation ───
interface PeriodRange {
  start: string
  end: string
  startObj: Date
  endObj: Date
  label: string
  title: string
  description: string
}

function getPeriodRange(mode: ViewMode, off: number): PeriodRange {
  const now = new Date()

  if (mode === 'week') {
    // Sunday = start of week (matching ReportsView convention)
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay() + off * 7)
    start.setHours(0, 0, 0, 0)

    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)

    const weekLabels = ['第一周', '第二周', '第三周', '第四周', '第五周']
    const monthLabel = `${start.getMonth() + 1}月`
    const dayInMonth = Math.ceil(start.getDate() / 7)
    const label = off === 0 ? '本周' : off === -1 ? '上周' : off === 1 ? '下周' : `${monthLabel}第${Math.min(dayInMonth, 5)}周`

    return {
      start: fmtDate(start),
      end: fmtDate(end),
      startObj: start,
      endObj: end,
      label,
      title: off === 0 ? '本周总结' : `${label}总结`,
      description: `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`,
    }
  }

  // Month
  const start = new Date(now.getFullYear(), now.getMonth() + off, 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + off + 1, 0, 23, 59, 59, 999)

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  const monthLabel = `${start.getFullYear()}年${monthNames[start.getMonth()]}`
  const label = off === 0 ? '本月' : off === -1 ? '上月' : off === 1 ? '下月' : monthLabel

  return {
    start: fmtDate(start),
    end: fmtDate(end),
    startObj: start,
    endObj: end,
    label,
    title: off === 0 ? '本月总结' : `${label}总结`,
    description: monthLabel,
  }
}

const currentRange = computed(() => getPeriodRange(mode.value, offset.value))
const prevRange = computed(() => getPeriodRange(mode.value, offset.value - 1))

// ─── Task filtering ───
function doneDateOf(task: { doneAt: string; due: string }): string {
  return task.doneAt ? task.doneAt.slice(0, 10) : (toDateKey(task.due) || '')
}

function tasksInRange(range: PeriodRange) {
  return store.doneTasks.filter(task => {
    const doneDate = doneDateOf(task)
    if (!doneDate) return false
    return doneDate >= range.start && doneDate <= range.end
  })
}

function allTasksInRange(range: PeriodRange) {
  // All tasks that were "active" during this period:
  // - created before or during the period
  // - not deleted before the period start
  const startStr = range.start
  const endStr = range.end
  return store.activeTasks.filter(task => {
    const created = (task.createdAt || '').slice(0, 10)
    const due = toDateKey(task.due)
    const done = doneDateOf(task)
    // Task existed in this period if: created before end AND (not done before start OR due in period)
    if (created && created > endStr) return false
    if (done && done < startStr && (!due || due < startStr)) return false
    return true
  })
}

function overdueInPeriod(range: PeriodRange): number {
  return store.activeTasks.filter(task => {
    const due = toDateKey(task.due)
    if (!due) return false
    if (due < range.start || due > range.end) return false
    // 截止日期当天不算逾期；未完成任务从截止日期次日开始计入。
    if (!task.done) return isOverdueDateTime(task.due)
    const doneDate = doneDateOf(task)
    return doneDate > due
  }).length
}

function activeDaysInPeriod(range: PeriodRange): number {
  const done = tasksInRange(range)
  const days = new Set(done.map(t => doneDateOf(t)).filter(Boolean))
  return days.size
}

// ─── Core metrics ───
const currentCompleted = computed(() => tasksInRange(currentRange.value).length)
const prevCompleted = computed(() => tasksInRange(prevRange.value).length)
const currentActiveDays = computed(() => activeDaysInPeriod(currentRange.value))
const prevActiveDays = computed(() => activeDaysInPeriod(prevRange.value))
const currentOverdue = computed(() => overdueInPeriod(currentRange.value))
const prevOverdue = computed(() => overdueInPeriod(prevRange.value))
const currentTotalTasks = computed(() => allTasksInRange(currentRange.value).length)
const prevTotalTasks = computed(() => allTasksInRange(prevRange.value).length)

const currentCompletionRate = computed(() => {
  if (!currentTotalTasks.value) return 0
  return Math.round((currentCompleted.value / currentTotalTasks.value) * 100)
})
const prevCompletionRate = computed(() => {
  if (!prevTotalTasks.value) return 0
  return Math.round((prevCompleted.value / prevTotalTasks.value) * 100)
})

function calcDelta(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return 0
  if (prev === 0) return null // can't compute percentage from zero
  return Math.round(((curr - prev) / prev) * 100)
}

function fmtDelta(delta: number | null): string {
  if (delta === null) return '新增'
  if (delta === 0) return '持平'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta}%`
}

interface MetricCard {
  key: string
  label: string
  value: string | number
  isText?: boolean
  delta: number | null
  deltaText: string
  note: string
}

const metricCards = computed<MetricCard[]>(() => {
  const completedDelta = calcDelta(currentCompleted.value, prevCompleted.value)
  const rateDelta = currentCompletionRate.value - prevCompletionRate.value
  const daysDelta = calcDelta(currentActiveDays.value, prevActiveDays.value)
  const overdueDelta = currentOverdue.value - prevOverdue.value

  return [
    {
      key: 'completed',
      label: '完成数',
      value: currentCompleted.value,
      delta: completedDelta,
      deltaText: fmtDelta(completedDelta),
      note: `上期 ${prevCompleted.value} 项`,
    },
    {
      key: 'rate',
      label: '完成率',
      value: currentCompletionRate.value + '%',
      delta: prevCompletionRate.value === 0 && currentCompletionRate.value === 0 ? 0 : rateDelta,
      deltaText: rateDelta === 0 ? '持平' : `${rateDelta > 0 ? '+' : ''}${rateDelta}pp`,
      note: `上期 ${prevCompletionRate.value}%`,
    },
    {
      key: 'days',
      label: '活跃天数',
      value: currentActiveDays.value,
      delta: daysDelta,
      deltaText: fmtDelta(daysDelta),
      note: `上期 ${prevActiveDays.value} 天`,
    },
    {
      key: 'overdue',
      label: '逾期数',
      value: currentOverdue.value,
      delta: overdueDelta === 0 ? 0 : overdueDelta,
      deltaText: overdueDelta === 0 ? '持平' : `${overdueDelta > 0 ? '+' : ''}${overdueDelta}`,
      note: `上期 ${prevOverdue.value} 项`,
    },
  ]
})

// ─── Quadrant health ───
const quadrantHealth = computed(() => {
  const done = tasksInRange(currentRange.value)
  const total = done.length || 1

  return [1, 2, 3, 4].map(q => {
    const count = done.filter(t => t.quadrant === q).length
    const share = Math.round((count / total) * 100)

    let assessment = { level: 'neutral', text: '正常' }
    if (q === 1) {
      if (share >= 40) assessment = { level: 'warn', text: '危机模式' }
      else if (share >= 25) assessment = { level: 'caution', text: '偏多' }
      else assessment = { level: 'good', text: '可控' }
    } else if (q === 2) {
      if (share >= 35) assessment = { level: 'good', text: '规划充分' }
      else if (share < 15) assessment = { level: 'caution', text: '偏少' }
      else assessment = { level: 'neutral', text: '正常' }
    } else if (q === 3) {
      if (share >= 30) assessment = { level: 'warn', text: '考虑委托' }
      else if (share >= 20) assessment = { level: 'caution', text: '偏多' }
      else assessment = { level: 'neutral', text: '正常' }
    } else {
      if (share >= 20) assessment = { level: 'warn', text: '浪费时间' }
      else if (share >= 10) assessment = { level: 'caution', text: '偏多' }
      else assessment = { level: 'good', text: '精简' }
    }

    return {
      quadrant: q,
      label: qLabels[q],
      color: qColors[q],
      count,
      share,
      assessment,
    }
  })
})

const overallVerdict = computed(() => {
  const q1Share = quadrantHealth.value[0].share
  const q2Share = quadrantHealth.value[1].share
  const q4Share = quadrantHealth.value[3].share
  const overdue = currentOverdue.value

  if (q1Share >= 40) return { level: 'warn', text: '紧急任务占比过高，建议优先规划 Q2 任务减少危机' }
  if (q4Share >= 20) return { level: 'warn', text: '低价值活动偏多，建议减少 Q4 任务投入' }
  if (overdue >= 5) return { level: 'caution', text: `有 ${overdue} 项逾期，建议重新评估截止日期或优先级` }
  if (q2Share >= 35) return { level: 'good', text: '长期规划投入充足，节奏健康，继续保持' }
  if (currentCompleted.value === 0) return { level: 'neutral', text: '本周期暂无完成记录，开始行动吧' }
  return { level: 'neutral', text: '整体节奏平稳，保持当前步调' }
})

// ─── Completed task list (all tasks in range) ───
const completedTaskList = computed(() => {
  const done = tasksInRange(currentRange.value)
  // Sort by completion time desc (most recent first)
  return done
    .slice()
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
})

// ─── P5-3: Group completed tasks by parent (top-level + children, with orphans) ───
interface CompletedGroup {
  task: Task
  children: Task[]
  orphan: boolean
}

const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(clientId: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(clientId)) {
    next.delete(clientId)
  } else {
    next.add(clientId)
  }
  expandedGroups.value = next
}

const groupedCompletedTasks = computed<CompletedGroup[]>(() => {
  const list = completedTaskList.value
  // Index top-level tasks (those without a parentTaskId) by clientId for fast child lookup.
  const topLevelMap = new Map<string, Task>()
  for (const t of list) {
    if (!t.parentTaskId) {
      topLevelMap.set(t.clientId, t)
    }
  }

  const groups: CompletedGroup[] = []

  // Walk the sorted list so parents keep their completion-time order.
  for (const t of list) {
    if (!t.parentTaskId) {
      groups.push({ task: t, children: [], orphan: false })
      continue
    }
    // Child task: attach to its parent if the parent is in this period's list.
    const parent = topLevelMap.get(t.parentTaskId)
    if (parent) {
      const parentGroup = groups.find(g => g.task.clientId === parent.clientId)
      if (parentGroup) {
        parentGroup.children.push(t)
        continue
      }
    }
    // Orphan: parent not completed in this period (or parent missing). Treat as top-level.
    groups.push({ task: t, children: [], orphan: true })
  }

  return groups
})

// ─── Highlight tasks (Q1/Q2 Top 3) ───
const highlightTasks = computed(() => {
  const done = tasksInRange(currentRange.value)
  // Prioritize Q1 and Q2 completed tasks
  return done
    .filter(t => t.quadrant === 1 || t.quadrant === 2)
    .sort((a, b) => {
      // Q1 first, then Q2, then by completion time desc
      if (a.quadrant !== b.quadrant) return a.quadrant - b.quadrant
      return (b.doneAt || '').localeCompare(a.doneAt || '')
    })
    .slice(0, 3)
})

// ─── Suggestions ───
const suggestions = computed(() => {
  const result: { level: 'warn' | 'caution' | 'good' | 'info'; text: string }[] = []
  const q1Share = quadrantHealth.value[0].share
  const q2Share = quadrantHealth.value[1].share
  const q3Share = quadrantHealth.value[2].share
  const q4Share = quadrantHealth.value[3].share

  if (q1Share >= 40) {
    result.push({ level: 'warn', text: `Q1 占比 ${q1Share}%，紧急任务过多。建议每天预留 1 小时处理 Q2 规划类任务，逐步减少危机。` })
  }
  if (q4Share >= 20) {
    result.push({ level: 'warn', text: `Q4 占比 ${q4Share}%，低价值活动偏多。建议设定时间限额或直接砍掉部分任务。` })
  }
  if (q3Share >= 30) {
    result.push({ level: 'caution', text: `Q3 占比 ${q3Share}%，紧急但不重要的事务较多。考虑委派他人或批量处理。` })
  }
  if (currentOverdue.value >= 3) {
    result.push({ level: 'caution', text: `${currentOverdue.value} 项任务逾期。建议重新评估优先级，逾期任务可降级或删除。` })
  }
  if (currentCompletionRate.value < 50 && currentTotalTasks.value > 5) {
    result.push({ level: 'caution', text: `完成率仅 ${currentCompletionRate.value}%。建议减少并行任务，集中精力完成少数要事。` })
  }
  if (q2Share >= 35) {
    result.push({ level: 'good', text: `Q2 投入占比 ${q2Share}%，长期规划做得好，继续保持这种节奏。` })
  }
  if (currentActiveDays.value >= 5 && mode.value === 'week') {
    result.push({ level: 'good', text: `本周活跃 ${currentActiveDays.value} 天，坚持力很强。` })
  }
  if (currentCompleted.value > 0 && currentCompleted.value >= prevCompleted.value) {
    result.push({ level: 'good', text: `完成数${currentCompleted.value === prevCompleted.value ? '与上期持平' : `较上期增加 ${currentCompleted.value - prevCompleted.value} 项`}，稳步前进。` })
  }
  if (result.length === 0 && currentCompleted.value > 0) {
    result.push({ level: 'info', text: '数据正常，没有明显需要改进的地方。保持当前节奏即可。' })
  }

  return result.slice(0, 6)
})

// ─── Navigation ───
function switchMode(m: ViewMode) {
  mode.value = m
  offset.value = 0
}

function shiftPeriod(delta: number) {
  offset.value += delta
}

function formatDoneDate(value: string): string {
  if (!value) return '未记录'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ─── Computed labels for template ───
const periodTitle = computed(() => currentRange.value.title)
const periodDescription = computed(() => currentRange.value.description)
const periodLabel = computed(() => currentRange.value.label)
</script>

<style scoped>
.summary-page {
  height: 100%;
  overflow-y: auto;
  padding: 18px 20px 52px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background:
    linear-gradient(180deg, oklch(98.8% 0.003 240), oklch(97.8% 0.004 240));
}

.summary-topbar,
.summary-metrics,
.summary-mid,
.summary-bottom {
  width: 100%;
}

/* ─── Topbar ─── */
.summary-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.summary-heading {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.summary-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.summary-heading h1 {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 650;
  color: var(--text-primary);
}

.summary-heading p {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.summary-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  min-width: 0;
}

.mode-segment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: oklch(99.2% 0.002 240 / 0.94);
  box-shadow: 0 10px 24px oklch(0% 0 0 / 0.03);
}

.mode-pill {
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition), color var(--transition), box-shadow var(--transition);
  white-space: nowrap;
}

.mode-pill:hover { color: var(--text-primary); }

.mode-pill.active {
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: 0 1px 2px oklch(0% 0 0 / 0.06);
}

.period-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.period-arrow {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background var(--transition), color var(--transition);
}

.period-arrow:hover { background: var(--surface-mid); color: var(--text-primary); }

.period-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 48px;
  text-align: center;
}

.period-today {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--transition);
}

.period-today:hover { color: var(--text-primary); }

/* ─── Metrics ─── */
.summary-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  min-height: 104px;
  background: oklch(99.5% 0.002 240 / 0.96);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  box-shadow: 0 12px 28px oklch(0% 0 0 / 0.03);
}

.metric-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.metric-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.metric-value {
  font-size: 28px;
  line-height: 1;
  font-weight: 680;
  color: var(--text-primary);
}

.metric-value-text {
  font-size: 20px;
  line-height: 1.15;
}

.metric-delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 600;
}

.metric-delta.up { color: oklch(52% 0.15 145); }
.metric-delta.down { color: oklch(56% 0.18 20); }
.metric-delta.flat { color: var(--text-muted); }

/* For overdue, down is good, up is bad - but we keep it simple with the arrow direction */

.metric-note {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
}

/* ─── Mid: Health + Completed ─── */
.summary-mid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
}

.health-panel,
.completed-panel {
  background: oklch(99.5% 0.002 240 / 0.96);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  box-shadow: 0 12px 28px oklch(0% 0 0 / 0.03);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.panel-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.panel-head h2 {
  font-size: 18px;
  line-height: 1.2;
  font-weight: 650;
  color: var(--text-primary);
  margin-top: 3px;
}

.panel-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.health-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.health-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(80px, 1.2fr) 28px 36px 72px;
  gap: 10px;
  align-items: center;
}

.health-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.health-bar-track {
  height: 7px;
  border-radius: 999px;
  background: oklch(92% 0.004 240);
  overflow: hidden;
}

.health-bar-fill {
  height: 100%;
  border-radius: inherit;
  transition: width 0.4s cubic-bezier(0.2, 0, 0, 1);
}

.health-count {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: right;
}

.health-share {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.health-tag {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.health-tag.good { background: oklch(92% 0.04 145); color: oklch(40% 0.12 145); }
.health-tag.caution { background: oklch(93% 0.04 75); color: oklch(42% 0.1 75); }
.health-tag.warn { background: oklch(92% 0.04 25); color: oklch(42% 0.12 25); }
.health-tag.neutral { background: oklch(93% 0.005 240); color: var(--text-muted); }

.health-verdict {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.health-verdict.good { background: oklch(96% 0.015 145); color: oklch(35% 0.1 145); }
.health-verdict.caution { background: oklch(96% 0.015 75); color: oklch(38% 0.1 75); }
.health-verdict.warn { background: oklch(96% 0.015 25); color: oklch(38% 0.12 25); }
.health-verdict.neutral { background: oklch(96% 0.005 240); color: var(--text-secondary); }

/* ─── Bottom: Highlights & Suggestions ─── */
.summary-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  min-height: 200px;
  /* 底部留白由 .summary-page 的 padding 统一承担。 */
}

.highlights-panel,
.suggestions-panel {
  background: oklch(99.5% 0.002 240 / 0.96);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  box-shadow: 0 12px 28px oklch(0% 0 0 / 0.03);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.panel-empty {
  flex: 1;
  display: grid;
  place-items: center;
  font-size: 14px;
  color: var(--text-muted);
}

/* ─── Highlight tasks (original) ─── */
.highlights-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.highlight-item {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: oklch(98.7% 0.003 240);
  border: 1px solid oklch(90% 0.005 240);
}

.highlight-rank {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: oklch(93% 0.008 240);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  flex-shrink: 0;
  align-self: center;
}

.highlight-accent {
  width: 4px;
  border-radius: 999px;
  flex-shrink: 0;
}

.highlight-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.highlight-main strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: left;
}

.highlight-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-muted);
}

.highlight-badge {
  font-weight: 500;
}

/* ─── Completed task list ─── */
.completed-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  max-height: 280px;
  padding-right: 4px;
}

.completed-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  border-radius: 6px;
}

.task-check-icon {
  flex-shrink: 0;
}

.completed-title {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-primary);
  line-height: 1.5;
  text-align: left;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.completed-time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.completed-item.has-children {
  cursor: default;
}

.child-count-badge {
  flex-shrink: 0;
  background: oklch(93% 0.008 240);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  line-height: 1.4;
}

.orphan-tag {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  padding: 1px 4px;
}

.expand-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  transition: background var(--transition), color var(--transition);
}

.expand-arrow:hover {
  background: oklch(95% 0.006 240);
  color: var(--text-secondary);
}

.expand-arrow svg {
  transition: transform 0.18s ease;
}

.expand-arrow.expanded svg {
  transform: rotate(90deg);
}

.subtask-list {
  padding-left: 24px;
  border-left: 2px solid var(--border-subtle);
  margin-left: 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.subtask-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 6px;
}

.subtask-check-icon {
  flex-shrink: 0;
  opacity: 0.75;
}

.subtask-title {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  line-height: 1.5;
  text-align: left;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtask-time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

.highlight-subtask-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 2px;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.suggestion-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.suggestion-item.warn { background: oklch(97% 0.012 25); color: oklch(38% 0.12 25); }
.suggestion-item.caution { background: oklch(97% 0.01 75); color: oklch(38% 0.1 75); }
.suggestion-item.good { background: oklch(97% 0.012 145); color: oklch(35% 0.1 145); }
.suggestion-item.info { background: oklch(97% 0.005 240); color: var(--text-secondary); }

.suggestion-item svg { flex-shrink: 0; margin-top: 2px; }

@media (max-width: 1180px) {
  .summary-metrics { grid-template-columns: repeat(2, 1fr); }
  .summary-mid { grid-template-columns: 1fr; }
  .summary-bottom { grid-template-columns: 1fr; }
  .summary-topbar { flex-direction: column; align-items: stretch; }
  .summary-controls { align-items: flex-start; }
  .health-row { grid-template-columns: minmax(0, 1fr) 28px 36px 72px; }
  .health-bar-track { display: none; }
}
</style>
