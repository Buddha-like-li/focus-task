<template>
  <div class="reports-page">
    <!-- Tab switcher -->
    <section class="reports-topbar">
      <div class="reports-heading">
        <span class="reports-eyebrow">报告</span>
        <h1>{{ activeTab === 'docs' ? 'Markdown 文档归档' : '完成情况总览' }}</h1>
        <p>{{ activeTab === 'docs' ? '按周期浏览任务文档快照，导出可独立浏览的报告。' : '按时间范围查看完成节奏、象限分布和最近交付。' }}</p>
      </div>

      <div class="tab-segment">
        <button class="tab-pill" :class="{ active: activeTab === 'docs' }" @click="activeTab = 'docs'">文档归档</button>
        <button class="tab-pill" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">完成总览</button>
      </div>
    </section>

    <!-- ─── Markdown 文档归档 ─── -->
    <template v-if="activeTab === 'docs'">
      <section class="docs-controls">
        <div class="mode-segment">
          <button
            v-for="opt in periodOptions"
            :key="opt.value"
            class="mode-pill"
            :class="{ active: periodMode === opt.value }"
            @click="switchPeriod(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="period-nav">
          <button class="period-arrow" @click="shiftPeriod(-1)" :disabled="loadingFiles">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M10 3L5 8L10 13" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <span class="period-label">{{ filesResponse?.label || periodLabel }}</span>
          <button class="period-arrow" @click="shiftPeriod(1)" :disabled="loadingFiles">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M6 3L11 8L6 13" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button v-if="offset !== 0" class="period-today" @click="offset = 0">回到本期</button>
        </div>
      </section>

      <section class="docs-toolbar">
        <div class="docs-info">
          <span v-if="filesResponse" class="docs-range">
            {{ formatRange(filesResponse.start) }} ~ {{ formatRange(filesResponse.end) }}
          </span>
          <span class="docs-count">{{ filesResponse?.files.length ?? 0 }} 个任务文档</span>
        </div>
        <div class="docs-actions">
          <button class="docs-btn" :disabled="exporting || !filesResponse?.files.length" @click="handleExport(false)">
            {{ exportInfo ? '重新生成' : '导出报告' }}
          </button>
          <button v-if="exportInfo" class="docs-btn docs-btn-ghost" :disabled="exporting" @click="downloadReport">
            下载 {{ exportInfo.reportFilename }}
          </button>
        </div>
      </section>

      <p v-if="exportInfo" class="export-meta">
        已生成：{{ formatExportTime(exportInfo.generatedAt) }} · {{ exportInfo.taskCount }} 个任务
      </p>

      <section v-if="loadingFiles" class="docs-loading">加载中…</section>
      <section v-else-if="filesError" class="docs-error">{{ filesError }}</section>
      <section v-else-if="!filesResponse?.files.length" class="docs-empty">本周期暂无任务文档快照。</section>
      <section v-else class="doc-list">
        <div v-for="file in filesResponse.files" :key="file.taskId" class="doc-row">
          <div class="doc-row-main">
            <span class="doc-row-title">{{ file.title || '未命名任务' }}</span>
            <span class="doc-row-status" :class="statusClass(file.status)">{{ file.status || '未开始' }}</span>
            <span v-if="file.owner" class="doc-row-owner">负责人：{{ file.owner }}</span>
            <span class="doc-row-time">快照时间：{{ formatSnapshotTime(file.snapshotAt) }}</span>
            <span class="doc-row-reason">{{ reasonLabel(file.snapshotReason) }}</span>
          </div>
          <div class="doc-row-actions">
            <button class="doc-icon-btn" title="预览文档" @click="openPreview(file)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M1.5 8S4 3 8 3s6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5Z"/>
                <circle cx="8" cy="8" r="2"/>
              </svg>
            </button>
          </div>
        </div>
      </section>
    </template>

    <!-- ─── Markdown 预览模态 ─── -->
    <Teleport to="body">
      <div v-if="previewOpen" class="md-preview-overlay" @click="closePreview">
        <div class="md-preview-modal" @click.stop>
          <div class="md-preview-head">
            <strong>{{ previewFile?.title || '未命名任务' }}</strong>
            <button class="md-preview-close" @click="closePreview" title="关闭">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16">
                <path d="M4 4L12 12M12 4L4 12"/>
              </svg>
            </button>
          </div>
          <div class="md-preview-body" v-html="previewHtml"></div>
        </div>
      </div>
    </Teleport>

    <!-- ─── 完成情况总览（原图表） ─── -->
    <template v-if="activeTab === 'overview'">
      <section class="reports-controls-row">
        <div class="range-segment">
          <button
            v-for="opt in timeOptions"
            :key="opt.value"
            class="range-pill"
            :class="{ active: dateRange === opt.value }"
            @click="setRange(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>

        <div v-if="dateRange === 'custom'" class="custom-range">
          <input type="date" v-model="customStart" class="date-input" />
          <span class="range-divider">至</span>
          <input type="date" v-model="customEnd" class="date-input" />
        </div>
      </section>

      <section class="reports-summary">
        <article class="summary-tile">
          <span class="summary-label">已完成</span>
          <strong class="summary-value">{{ reportTasks.length }}</strong>
          <span class="summary-note">当前区间内归档完成的任务数量</span>
        </article>
        <article class="summary-tile">
          <span class="summary-label">活跃天数</span>
          <strong class="summary-value">{{ activeDays }}</strong>
          <span class="summary-note">有完成记录的日期数</span>
        </article>
        <article class="summary-tile">
          <span class="summary-label">单日峰值</span>
          <strong class="summary-value">{{ busiestDayCount }}</strong>
          <span class="summary-note">{{ busiestDayLabel }}</span>
        </article>
        <article class="summary-tile">
          <span class="summary-label">主力象限</span>
          <strong class="summary-value summary-value-text">{{ topQuadrantLabel }}</strong>
          <span class="summary-note">完成占比最高的任务类型</span>
        </article>
      </section>

      <section class="reports-main">
        <article class="chart-panel">
          <div class="panel-head">
            <div>
              <span class="panel-kicker">趋势</span>
              <h2>完成任务走势</h2>
            </div>
            <span class="panel-meta">{{ chartDates.length }} 个日期节点</span>
          </div>

          <div class="chart-shell">
            <div class="chart-legend-inline">
              <button
                v-for="q in 4"
                :key="q"
                class="legend-chip"
                :class="{ inactive: !legendVisible[q] }"
                @click="toggleLegendQ(q)"
              >
                <span class="legend-swatch" :style="{ background: qColors[q] }"></span>
                <span>{{ qLabels[q] }}</span>
              </button>
            </div>

            <div class="chart-container">
              <div class="chart-y-axis">
                <div v-for="i in 6" :key="i" class="chart-y-label">
                  {{ Math.round((yMax / 5) * (i - 1)) }}
                </div>
              </div>

              <div class="chart-grid-lines">
                <div v-for="i in 6" :key="i" class="chart-grid-line"></div>
              </div>

              <div v-if="chartDates.length === 0" class="chart-empty">
                当前筛选范围内还没有完成记录
              </div>

              <div v-else class="chart-bars-wrap">
                <button
                  v-for="date in chartDates"
                  :key="date"
                  class="chart-bar-group"
                  type="button"
                  @mouseenter="showTooltip($event, date)"
                  @mouseleave="hideTooltip"
                  @focus="showTooltip($event, date)"
                  @blur="hideTooltip"
                >
                  <span class="chart-bar-value">{{ byDate[date].total }}</span>
                  <div
                    class="chart-bar"
                    :style="{ height: Math.max((byDate[date].total / yMax) * 100, 6) + '%', background: getBarGradient(date) }"
                  ></div>
                  <span class="chart-bar-label">{{ formatBarDate(date) }}</span>
                </button>
              </div>

              <div
                v-if="tooltip.visible"
                class="chart-tooltip"
                :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
              >
                <div class="tooltip-date">{{ tooltip.date }}</div>
                <div class="tooltip-total">共 <strong>{{ tooltip.total }}</strong> 项</div>
                <div v-for="d in tooltip.details" :key="d.label" class="tooltip-detail">
                  <span class="tooltip-dot" :style="{ background: d.color }"></span>
                  <span>{{ d.label }}</span>
                  <span class="tooltip-count">{{ d.count }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>

        <aside class="insight-panel">
          <div class="panel-head">
            <div>
              <span class="panel-kicker">分布</span>
              <h2>象限构成</h2>
            </div>
          </div>

          <div class="distribution-list">
            <div v-for="item in quadrantDistribution" :key="item.quadrant" class="distribution-row">
              <div class="distribution-label">
                <span class="distribution-dot" :style="{ background: item.color }"></span>
                <span>{{ item.label }}</span>
              </div>
              <div class="distribution-metrics">
                <span class="distribution-count">{{ item.count }}</span>
                <span class="distribution-share">{{ item.share }}%</span>
              </div>
              <div class="distribution-bar-track">
                <div class="distribution-bar-fill" :style="{ width: item.share + '%', background: item.color }"></div>
              </div>
            </div>
          </div>

          <div class="insight-card">
            <span class="insight-label">完成密度</span>
            <strong>{{ completionDensity }}</strong>
            <p>平均每个活跃日完成 {{ averagePerActiveDay }} 项。</p>
          </div>
        </aside>
      </section>

      <section class="reports-bottom">
        <article class="activity-panel">
          <div class="panel-head">
            <div>
              <span class="panel-kicker">流水</span>
              <h2>最近完成任务</h2>
            </div>
            <span class="panel-meta">按完成时间倒序</span>
          </div>

          <div v-if="recentTasks.length === 0" class="activity-empty">暂无已完成任务</div>
          <div v-else class="activity-list">
            <div v-for="task in recentTasks" :key="task.clientId" class="activity-item">
              <div class="activity-accent" :style="{ background: qColors[task.quadrant] }"></div>
              <div class="activity-main">
                <div class="activity-title-row">
                  <strong>{{ task.title || '未命名任务' }}</strong>
                  <span class="activity-badge">{{ qLabels[task.quadrant] }}</span>
                </div>
                <div class="activity-meta">
                  <span>{{ task.tag || '未分类' }}</span>
                  <span>{{ formatDoneTime(task.doneAt || task.updatedAt || '') }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article class="calendar-panel">
          <div class="panel-head">
            <div>
              <span class="panel-kicker">日历</span>
              <h2>完成热度</h2>
            </div>
            <span class="panel-meta">最近 14 天</span>
          </div>

          <div class="calendar-grid">
            <div v-for="day in recentHeatmap" :key="day.date" class="calendar-day">
              <span class="calendar-date">{{ day.label }}</span>
              <div class="calendar-track">
                <div class="calendar-fill" :style="{ width: day.fill + '%', background: day.color }"></div>
              </div>
              <span class="calendar-count">{{ day.count }}</span>
            </div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { marked } from 'marked'
import { useTaskStore } from '@/stores/taskStore'
import { toDateKey } from '@/utils/dateTime'
import * as api from '@/api'

// ─── Tab switch ───
const activeTab = ref<'docs' | 'overview'>('docs')

// ─── Markdown 文档归档 ───
type PeriodMode = 'daily' | 'weekly' | 'monthly'

const periodMode = ref<PeriodMode>('monthly')
const offset = ref(0)
const loadingFiles = ref(false)
const filesError = ref('')
const filesResponse = ref<api.MarkdownFilesResponse | null>(null)
const exporting = ref(false)
const exportInfo = ref<api.ReportExportResponse | null>(null)
const lastReportText = ref('')

const periodOptions = [
  { label: '日报', value: 'daily' as const },
  { label: '周报', value: 'weekly' as const },
  { label: '月报', value: 'monthly' as const },
]

const periodLabel = computed(() => {
  if (!filesResponse.value) return ''
  return filesResponse.value.label
})

async function fetchFiles() {
  loadingFiles.value = true
  filesError.value = ''
  exportInfo.value = null
  lastReportText.value = ''
  try {
    filesResponse.value = await api.getReportMarkdownFiles(periodMode.value, undefined, offset.value)
  } catch (error) {
    filesError.value = error instanceof Error ? error.message : '加载失败'
    filesResponse.value = null
  } finally {
    loadingFiles.value = false
  }
}

function switchPeriod(mode: PeriodMode) {
  if (periodMode.value === mode) return
  periodMode.value = mode
  offset.value = 0
  fetchFiles()
}

function shiftPeriod(delta: number) {
  offset.value += delta
  fetchFiles()
}

async function handleExport(regenerate: boolean) {
  if (!filesResponse.value) return
  exporting.value = true
  try {
    const res = await api.exportReport({
      period: periodMode.value,
      anchor: filesResponse.value.anchor,
      regenerate,
    })
    exportInfo.value = res
    lastReportText.value = res.reportText
  } catch (error) {
    filesError.value = error instanceof Error ? error.message : '导出失败'
  } finally {
    exporting.value = false
  }
}

function downloadReport() {
  if (!exportInfo.value || !lastReportText.value) return
  const blob = new Blob([lastReportText.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exportInfo.value.reportFilename
  link.click()
  URL.revokeObjectURL(url)
}

function renderMarkdown(md: string): string {
  if (!md) return '<p class="doc-empty-body">（无正文内容）</p>'
  return marked.parse(md, { async: false }) as string
}

// ─── Attachment ref resolution for preview ───
// Markdown stored in the API response uses ![alt](attachment:ID) refs.
// We resolve them to blob URLs via the attachment download API so images
// render correctly in the preview modal (same approach as ContentModal).
const ATTACHMENT_REF_RE = /!\[([^\]]*)\]\(attachment:([0-9a-f]{32}__[^\)]+)\)/g
const previewAttachmentUrls = ref<Record<string, string>>({})

function resolveAttachmentRefs(md: string): string {
  return md.replace(ATTACHMENT_REF_RE, (match, alt: string, id: string) => {
    const url = previewAttachmentUrls.value[id]
    return url ? `![${alt}](${url})` : match
  })
}

async function loadPreviewAttachments(taskId: number, md: string) {
  const ids = new Set<string>()
  let m: RegExpExecArray | null
  const re = /attachment:([0-9a-f]{32}__[^\)]+)/g
  while ((m = re.exec(md)) !== null) {
    ids.add(m[1])
  }
  const entries: Record<string, string> = {}
  await Promise.all(
    Array.from(ids).map(async (id) => {
      try {
        const blob = await api.downloadTaskAttachment(taskId, id)
        entries[id] = URL.createObjectURL(blob)
      } catch {
        // Attachment may have been deleted; leave unresolved.
      }
    }),
  )
  previewAttachmentUrls.value = entries
}

function revokePreviewUrls() {
  for (const url of Object.values(previewAttachmentUrls.value)) {
    URL.revokeObjectURL(url)
  }
  previewAttachmentUrls.value = {}
}

// ─── Preview modal ───
const previewOpen = ref(false)
const previewFile = ref<api.MarkdownFile | null>(null)
const previewHtml = ref('')
const previewLoading = ref(false)

async function openPreview(file: api.MarkdownFile) {
  previewFile.value = file
  previewOpen.value = true
  previewLoading.value = true
  previewHtml.value = '<p style="color:var(--text-muted)">加载中…</p>'
  try {
    await loadPreviewAttachments(file.taskId, file.markdown)
    const resolved = resolveAttachmentRefs(file.markdown)
    previewHtml.value = marked.parse(resolved, { async: false }) as string
  } catch {
    previewHtml.value = '<p style="color:oklch(50% 0.16 25)">渲染失败</p>'
  } finally {
    previewLoading.value = false
  }
}

function closePreview() {
  previewOpen.value = false
  previewFile.value = null
  previewHtml.value = ''
  revokePreviewUrls()
}

function formatRange(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatSnapshotTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatExportTime(iso: string): string {
  return formatSnapshotTime(iso)
}

function statusClass(status: string): string {
  if (!status) return ''
  if (status === '已完成') return 'status-done'
  if (status === '进行中' || status === '开发阶段') return 'status-active'
  return 'status-pending'
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = { create: '创建', content: '内容变更', status: '状态变更' }
  return map[reason] || reason
}

watch(periodMode, () => { /* handled in switchPeriod */ })

// ─── 完成情况总览（原逻辑） ───
type DateBucket = { total: number; q1: number; q2: number; q3: number; q4: number }

const store = useTaskStore()
const dateRange = ref('this-week')
const customStart = ref('')
const customEnd = ref('')
const legendVisible = reactive<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true })

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

const timeOptions = [
  { label: '本周', value: 'this-week' },
  { label: '本月', value: 'this-month' },
  { label: '本季', value: 'this-quarter' },
  { label: '本年', value: 'this-year' },
  { label: '自定义', value: 'custom' },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDateRange() {
  const todayStr = today()
  switch (dateRange.value) {
    case 'this-week': {
      const d = new Date()
      d.setDate(d.getDate() - d.getDay())
      return { start: fmtDate(d), end: todayStr }
    }
    case 'this-month': {
      const d = new Date()
      d.setDate(1)
      return { start: fmtDate(d), end: todayStr }
    }
    case 'this-quarter': {
      const d = new Date()
      d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1)
      return { start: fmtDate(d), end: todayStr }
    }
    case 'this-year': {
      const d = new Date()
      d.setMonth(0, 1)
      return { start: fmtDate(d), end: todayStr }
    }
    case 'custom':
      return { start: customStart.value, end: customEnd.value }
    default:
      return { start: todayStr, end: todayStr }
  }
}

function doneDateOf(task: { doneAt: string; due: string }) {
  return task.doneAt ? task.doneAt.slice(0, 10) : (toDateKey(task.due) || today())
}

const reportTasks = computed(() => {
  const range = getDateRange()
  return store.doneTasks.filter(task => {
    if (!legendVisible[task.quadrant]) return false
    const doneDate = doneDateOf(task)
    if (range.start && doneDate < range.start) return false
    if (range.end && doneDate > range.end) return false
    return true
  })
})

const byDate = computed<Record<string, DateBucket>>(() => {
  const map: Record<string, DateBucket> = {}
  for (const task of reportTasks.value) {
    const date = doneDateOf(task)
    if (!map[date]) map[date] = { total: 0, q1: 0, q2: 0, q3: 0, q4: 0 }
    map[date].total += 1
    map[date][`q${task.quadrant}` as keyof DateBucket] += 1
  }
  return map
})

const chartDates = computed(() => Object.keys(byDate.value).sort())
const yMax = computed(() => {
  const max = Math.max(...chartDates.value.map(date => byDate.value[date].total), 1)
  return Math.ceil(max / 4) * 4 || 4
})

const activeDays = computed(() => chartDates.value.length)
const busiestDay = computed(() => {
  if (!chartDates.value.length) return { date: '', total: 0 }
  return chartDates.value
    .map(date => ({ date, total: byDate.value[date].total }))
    .sort((a, b) => b.total - a.total)[0]
})

const busiestDayCount = computed(() => busiestDay.value.total || 0)
const busiestDayLabel = computed(() => busiestDay.value.date ? `${formatBarDate(busiestDay.value.date)} 最集中` : '暂无峰值')

const quadrantDistribution = computed(() => {
  const total = reportTasks.value.length || 1
  return [1, 2, 3, 4].map(quadrant => {
    const count = reportTasks.value.filter(task => task.quadrant === quadrant).length
    return {
      quadrant,
      label: qLabels[quadrant],
      color: qColors[quadrant],
      count,
      share: Math.round((count / total) * 100),
    }
  })
})

const topQuadrant = computed(() => {
  return quadrantDistribution.value
    .slice()
    .sort((a, b) => b.count - a.count)[0]
})

const topQuadrantLabel = computed(() => topQuadrant.value?.count ? topQuadrant.value.label : '暂无数据')
const averagePerActiveDay = computed(() => activeDays.value ? (reportTasks.value.length / activeDays.value).toFixed(1) : '0.0')
const completionDensity = computed(() => activeDays.value ? `${averagePerActiveDay.value} / 天` : '暂无记录')

const recentTasks = computed(() => reportTasks.value.slice(0, 8))

const recentHeatmap = computed(() => {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (13 - index))
    const key = fmtDate(date)
    const count = byDate.value[key]?.total || 0
    return { date: key, count }
  })
  const peak = Math.max(...days.map(item => item.count), 1)
  return days.map(item => ({
    ...item,
    label: `${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8, 10))}`,
    fill: Math.max(Math.round((item.count / peak) * 100), item.count ? 12 : 0),
    color: item.count ? 'oklch(58% 0.11 240)' : 'oklch(90% 0.006 240)',
  }))
})

function getBarGradient(date: string) {
  const data = byDate.value[date]
  const colors: { pct: number; color: string }[] = []
  if (legendVisible[1] && data.q1) colors.push({ pct: data.q1 / data.total, color: qColors[1] })
  if (legendVisible[2] && data.q2) colors.push({ pct: data.q2 / data.total, color: qColors[2] })
  if (legendVisible[3] && data.q3) colors.push({ pct: data.q3 / data.total, color: qColors[3] })
  if (legendVisible[4] && data.q4) colors.push({ pct: data.q4 / data.total, color: qColors[4] })
  if (!colors.length) return 'var(--border-subtle)'
  if (colors.length === 1) return colors[0].color

  let acc = 0
  const stops: string[] = []
  colors.forEach((entry, index) => {
    if (index > 0) acc += colors[index - 1].pct
    stops.push(`${entry.color} ${Math.round(acc * 100)}%`)
    stops.push(`${entry.color} ${Math.round((acc + entry.pct) * 100)}%`)
  })
  return `linear-gradient(to top, ${stops.join(', ')})`
}

function formatBarDate(date: string) {
  const d = new Date(date)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatDoneTime(value: string) {
  if (!value) return '未记录时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function toggleLegendQ(q: number) {
  legendVisible[q] = !legendVisible[q]
}

function setRange(range: string) {
  dateRange.value = range
  if (range === 'custom') {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    if (!customStart.value) customStart.value = fmtDate(start)
    if (!customEnd.value) customEnd.value = fmtDate(end)
  }
}

const tooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  date: '',
  total: 0,
  details: [] as { label: string; color: string; count: number }[],
})

function showTooltip(event: MouseEvent | FocusEvent, date: string) {
  const data = byDate.value[date]
  const target = event.currentTarget as HTMLElement | null
  const container = target?.closest('.chart-container')
  if (!target || !container) return

  const rect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  tooltip.x = targetRect.left - rect.left - 24
  tooltip.y = Math.max(targetRect.top - rect.top - 96, 8)
  tooltip.date = formatBarDate(date)
  tooltip.total = data.total
  tooltip.details = [
    { label: qLabels[1], color: qColors[1], count: data.q1 },
    { label: qLabels[2], color: qColors[2], count: data.q2 },
    { label: qLabels[3], color: qColors[3], count: data.q3 },
    { label: qLabels[4], color: qColors[4], count: data.q4 },
  ].filter(item => item.count > 0)
  tooltip.visible = true
}

function hideTooltip() {
  tooltip.visible = false
}

// ─── Lifecycle ───
onMounted(() => {
  fetchFiles()
})

onUnmounted(() => {
  revokePreviewUrls()
})
</script>

<style scoped>
.reports-page {
  height: 100%;
  overflow-y: auto;
  padding: 18px 20px 52px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background:
    linear-gradient(180deg, oklch(98.8% 0.003 240), oklch(97.8% 0.004 240));
}

.reports-topbar,
.reports-summary,
.reports-main,
.reports-bottom {
  width: 100%;
}

.reports-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.reports-heading {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.reports-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.reports-heading h1 {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 650;
  color: var(--text-primary);
}

.reports-heading p {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
}

/* ─── Tab switcher ─── */
.tab-segment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: oklch(99.2% 0.002 240 / 0.94);
  box-shadow: 0 10px 24px oklch(0% 0 0 / 0.03);
}

.tab-pill {
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

.tab-pill:hover {
  color: var(--text-primary);
}

.tab-pill.active {
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: 0 1px 2px oklch(0% 0 0 / 0.06);
}

/* ─── Docs controls ─── */
.docs-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
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
  transition: background var(--transition), color var(--transition);
  white-space: nowrap;
}

.mode-pill:hover {
  color: var(--text-primary);
}

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
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.period-arrow:hover:not(:disabled) {
  background: oklch(95% 0.015 240);
  color: var(--text-primary);
}

.period-arrow:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.period-label {
  min-width: 120px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.period-today {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.period-today:hover {
  background: oklch(95% 0.015 240);
  color: var(--text-primary);
}

/* ─── Docs toolbar ─── */
.docs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.docs-info {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 13px;
  color: var(--text-secondary);
}

.docs-range {
  font-weight: 500;
}

.docs-count {
  color: var(--text-muted);
}

.docs-actions {
  display: flex;
  gap: 8px;
}

.docs-btn {
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: oklch(55% 0.12 240);
  color: white;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition);
}

.docs-btn:hover:not(:disabled) {
  background: oklch(48% 0.13 240);
}

.docs-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.docs-btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}

.docs-btn-ghost:hover:not(:disabled) {
  background: oklch(95% 0.015 240);
  color: var(--text-primary);
}

.export-meta {
  font-size: 12px;
  color: var(--text-muted);
  padding: 0 2px;
}

/* ─── Docs list ─── */
.docs-loading,
.docs-error,
.docs-empty {
  padding: 48px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted);
  background: oklch(99.5% 0.002 240 / 0.96);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}

.docs-error {
  color: oklch(50% 0.16 25);
}

/* ─── Compact doc list rows ─── */
.doc-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 18px;
}

.doc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: oklch(99.5% 0.002 240 / 0.96);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  transition: background var(--transition);
}

.doc-row:hover {
  background: oklch(98% 0.004 240);
}

.doc-row-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.doc-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

.doc-row-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.doc-row-status.status-done {
  background: oklch(94% 0.08 145 / 0.5);
  color: oklch(42% 0.13 145);
  border-color: oklch(80% 0.1 145);
}

.doc-row-status.status-active {
  background: oklch(94% 0.06 60 / 0.5);
  color: oklch(45% 0.13 60);
  border-color: oklch(82% 0.08 60);
}

.doc-row-status.status-pending {
  background: var(--surface-mid);
  color: var(--text-muted);
}

.doc-row-owner,
.doc-row-time {
  white-space: nowrap;
}

.doc-row-reason {
  padding: 1px 8px;
  border-radius: 999px;
  background: oklch(94% 0.01 240);
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.doc-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.doc-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.doc-icon-btn:hover {
  background: oklch(94% 0.01 240);
  color: var(--text-primary);
}

/* ─── Preview modal ─── */
.md-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: oklch(0% 0 0 / 0.4);
  backdrop-filter: blur(2px);
}

.md-preview-modal {
  width: min(820px, 92vw);
  height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  background: oklch(99.5% 0.002 240);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 24px 60px oklch(0% 0 0 / 0.18);
  overflow: hidden;
}

.md-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: oklch(98% 0.003 240);
}

.md-preview-head strong {
  font-size: 16px;
  font-weight: 650;
  color: var(--text-primary);
}

.md-preview-close {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.md-preview-close:hover {
  background: oklch(94% 0.01 240);
  color: var(--text-primary);
}

.md-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
}

.md-preview-body :deep(h1) {
  font-size: 20px;
  font-weight: 650;
  margin: 0 0 12px;
}

.md-preview-body :deep(h2) {
  font-size: 17px;
  font-weight: 600;
  margin: 16px 0 8px;
}

.md-preview-body :deep(p) {
  margin: 0 0 10px;
}

.md-preview-body :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 8px 0;
}

.md-preview-body :deep(code) {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  background: oklch(94% 0.006 240);
  padding: 1px 5px;
  border-radius: 4px;
}

.md-preview-body :deep(pre) {
  background: oklch(96% 0.005 240);
  padding: 12px 14px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 13px;
  margin: 0 0 10px;
}

.md-preview-body :deep(pre code) {
  background: transparent;
  padding: 0;
}

.md-preview-body :deep(hr) {
  border: none;
  border-top: 1px solid oklch(90% 0.005 240);
  margin: 14px 0;
}

.md-preview-body :deep(ul),
.md-preview-body :deep(ol) {
  padding-left: 22px;
  margin: 0 0 10px;
}

.doc-empty-body {
  color: var(--text-muted);
  font-style: italic;
}

/* ─── Overview (original chart styles) ─── */
.reports-controls-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.range-segment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: oklch(99.2% 0.002 240 / 0.94);
  box-shadow: 0 10px 24px oklch(0% 0 0 / 0.03);
}

.range-pill {
  height: 32px;
  padding: 0 12px;
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

.range-pill:hover {
  color: var(--text-primary);
}

.range-pill.active {
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: 0 1px 2px oklch(0% 0 0 / 0.06);
}

.custom-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-input {
  width: 136px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.date-input:focus {
  border-color: oklch(58% 0.11 240);
  box-shadow: 0 0 0 3px oklch(58% 0.11 240 / 0.12);
}

.range-divider {
  font-size: 13px;
  color: var(--text-muted);
}

.reports-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-tile,
.chart-panel,
.insight-panel,
.activity-panel,
.calendar-panel {
  background: oklch(99.5% 0.002 240 / 0.96);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  box-shadow: 0 12px 28px oklch(0% 0 0 / 0.03);
}

.summary-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  min-height: 104px;
}

.summary-label,
.panel-kicker,
.insight-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.summary-value {
  font-size: 28px;
  line-height: 1;
  font-weight: 680;
  color: var(--text-primary);
}

.summary-value-text {
  font-size: 20px;
  line-height: 1.15;
}

.summary-note {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.reports-main {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(300px, 0.9fr);
  gap: 14px;
  min-height: 420px;
}

.reports-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.75fr);
  gap: 14px;
  min-height: 220px;
  margin-bottom: 18px;
}

.chart-panel,
.insight-panel,
.activity-panel,
.calendar-panel {
  padding: 16px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
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

.chart-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1;
}

.chart-legend-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.legend-chip {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--surface);
  font: inherit;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.legend-chip.inactive {
  opacity: 0.45;
}

.legend-swatch,
.distribution-dot,
.tooltip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chart-container {
  position: relative;
  flex: 1;
  min-height: 290px;
  padding: 10px 6px 6px 38px;
  overflow: hidden;
}

.chart-y-axis {
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 34px;
  width: 30px;
  display: flex;
  flex-direction: column-reverse;
  justify-content: space-between;
  align-items: flex-end;
}

.chart-y-label {
  font-size: 11px;
  color: var(--text-muted);
}

.chart-grid-lines {
  position: absolute;
  left: 38px;
  right: 6px;
  top: 6px;
  bottom: 34px;
  display: flex;
  flex-direction: column-reverse;
  justify-content: space-between;
  pointer-events: none;
}

.chart-grid-line {
  height: 1px;
  width: 100%;
  background: oklch(89% 0.006 240);
}

.chart-empty {
  position: absolute;
  inset: 0 6px 20px 38px;
  display: grid;
  place-items: center;
  font-size: 14px;
  color: var(--text-muted);
}

.chart-bars-wrap {
  position: absolute;
  left: 38px;
  right: 6px;
  top: 6px;
  bottom: 6px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
  gap: 10px;
  align-items: end;
}

.chart-bar-group {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.chart-bar-group:focus-visible {
  outline: 2px solid oklch(58% 0.11 240 / 0.4);
  outline-offset: 3px;
  border-radius: 8px;
}

.chart-bar-value {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.chart-bar {
  width: min(34px, 100%);
  border-radius: 8px 8px 3px 3px;
  box-shadow: inset 0 1px 0 oklch(100% 0 0 / 0.32);
}

.chart-bar-label {
  min-height: 18px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.chart-tooltip {
  position: absolute;
  z-index: 20;
  min-width: 156px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: oklch(100% 0 0 / 0.97);
  box-shadow: 0 18px 36px oklch(0% 0 0 / 0.08);
  pointer-events: none;
}

.tooltip-date {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.tooltip-total {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.tooltip-detail {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
}

.tooltip-count {
  margin-left: auto;
  font-weight: 600;
  color: var(--text-primary);
}

.insight-panel {
  gap: 14px;
}

.distribution-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.distribution-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  align-items: center;
}

.distribution-label,
.distribution-metrics {
  display: flex;
  align-items: center;
  gap: 8px;
}

.distribution-label {
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.distribution-metrics {
  font-size: 12px;
  color: var(--text-secondary);
}

.distribution-count {
  font-weight: 700;
  color: var(--text-primary);
}

.distribution-share {
  width: 42px;
  text-align: right;
}

.distribution-bar-track {
  grid-column: 1 / -1;
  height: 7px;
  border-radius: 999px;
  background: oklch(92% 0.004 240);
  overflow: hidden;
}

.distribution-bar-fill {
  height: 100%;
  border-radius: inherit;
}

.insight-card {
  margin-top: auto;
  padding: 14px;
  border-radius: 8px;
  background: linear-gradient(180deg, oklch(98.8% 0.01 240), oklch(96.8% 0.013 240));
  border: 1px solid oklch(89% 0.01 240);
}

.insight-card strong {
  display: block;
  margin: 5px 0 4px;
  font-size: 22px;
  line-height: 1.1;
  color: var(--text-primary);
}

.insight-card p {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.activity-panel,
.calendar-panel {
  min-height: 220px;
}

.activity-list,
.calendar-grid {
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
  padding-bottom: 10px;
}

.activity-empty {
  flex: 1;
  display: grid;
  place-items: center;
  font-size: 14px;
  color: var(--text-muted);
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.activity-item {
  display: flex;
  gap: 10px;
  align-items: stretch;
  padding: 10px 12px;
  border-radius: 8px;
  background: oklch(98.7% 0.003 240);
  border: 1px solid oklch(90% 0.005 240);
}

.activity-accent {
  width: 4px;
  border-radius: 999px;
  flex-shrink: 0;
}

.activity-main {
  min-width: 0;
  flex: 1;
}

.activity-title-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.activity-title-row strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.activity-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
}

.activity-meta {
  margin-top: 5px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-muted);
}

.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.calendar-day {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 28px;
  gap: 10px;
  align-items: center;
}

.calendar-date,
.calendar-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.calendar-track {
  height: 10px;
  border-radius: 999px;
  background: oklch(92% 0.004 240);
  overflow: hidden;
}

.calendar-fill {
  height: 100%;
  border-radius: inherit;
}

@media (max-width: 1180px) {
  .reports-main,
  .reports-bottom,
  .reports-summary {
    grid-template-columns: 1fr;
  }

  .reports-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .docs-controls {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
