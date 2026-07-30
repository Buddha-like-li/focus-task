<template>
  <aside class="sidebar">
    <div class="sidebar-section-label">视图</div>
    <div
      v-for="item in viewItems"
      :key="item.key"
      class="sidebar-item"
      :class="{ active: !isSettingsRoute && store.currentView === item.key && !store.filterQuadrant }"
      @click="clickView(item.key)"
    >
      <div class="sidebar-dot" :style="{ background: item.color }"></div>
      <span>{{ item.label }}</span>
      <span v-if="item.badge" class="sidebar-badge">{{ item.badge }}</span>
    </div>

    <div class="sidebar-section-label">象限</div>
    <div
      v-for="q in quadrants"
      :key="q.id"
      class="sidebar-item"
      :class="{ active: !isSettingsRoute && store.filterQuadrant === q.id }"
      @click="clickQuadrant(q.id)"
    >
      <div class="sidebar-dot" :style="{ background: q.color }"></div>
      <span>{{ q.label }}</span>
      <span v-if="q.badge" class="sidebar-badge">{{ q.badge }}</span>
    </div>

    <div class="sidebar-section-label">需求</div>
    <div
      class="sidebar-item"
      :class="{ active: !isSettingsRoute && store.currentView === 'requirements' }"
      @click="openRequirements"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="oklch(55% 0.12 240)" stroke-width="1.5" style="flex-shrink:0">
        <rect x="2.5" y="2" width="11" height="12" rx="1.5"/>
        <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke-linecap="round"/>
      </svg>
      <span>需求池</span>
      <span v-if="openRequirementCount" class="sidebar-badge">{{ openRequirementCount }}</span>
    </div>

    <div class="sidebar-section-label">团队</div>
    <div
      class="sidebar-item"
      :class="{ active: !isSettingsRoute && (store.currentView as string) === 'teammates' }"
      @click="openTeammates"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="oklch(55% 0.12 240)" stroke-width="1.5" style="flex-shrink:0">
        <circle cx="5.5" cy="6" r="2"/>
        <path d="M2 13c0-2 1.5-3.2 3.5-3.2S9 11 9 13" stroke-linecap="round"/>
        <circle cx="10.5" cy="6.5" r="1.6"/>
        <path d="M9.5 10.2c1.6-.6 3.4-.5 4.5.3M11 13c0-1 .3-1.8.8-2.4" stroke-linecap="round"/>
      </svg>
      <span>队友任务</span>
    </div>

    <div class="sidebar-section-label">统计</div>
    <div
      class="sidebar-item"
      :class="{ active: !isSettingsRoute && store.currentView === 'summary' }"
      @click="openSummary"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="oklch(55% 0.12 240)" stroke-width="1.5" style="flex-shrink:0">
        <path d="M3 13V5M7 13V8M11 13V3" stroke-linecap="round"/>
        <circle cx="3" cy="4" r="1" fill="oklch(55% 0.12 240)" stroke="none"/>
        <circle cx="7" cy="7" r="1" fill="oklch(55% 0.12 240)" stroke="none"/>
        <circle cx="11" cy="2" r="1" fill="oklch(55% 0.12 240)" stroke="none"/>
      </svg>
      <span>总结</span>
    </div>
    <div
      class="sidebar-item"
      :class="{ active: !isSettingsRoute && store.currentView === 'reports' }"
      @click="openReports"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="oklch(55% 0.12 240)" stroke-width="1.5" style="flex-shrink:0">
        <rect x="2" y="2" width="5" height="12" rx="1"/><rect x="9" y="6" width="5" height="8" rx="1"/>
      </svg>
      <span>报告</span>
    </div>

    <div class="sidebar-section-label">归档</div>
    <div
      class="sidebar-item"
      :class="{ active: !isSettingsRoute && store.currentView === 'trash' }"
      @click="openTrash"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="oklch(48% 0.03 245)" stroke-width="1.5" style="flex-shrink:0">
        <path d="M2 4.5h12M5.5 7v4.5M10.5 7v4.5M5 4.5l.7-2h4.6l.7 2M3.8 4.5l.6 9h7.2l.6-9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>垃圾桶</span>
      <span v-if="trashStore.count" class="sidebar-badge">{{ trashStore.count }}</span>
    </div>

    <div class="sidebar-section-label">偏好</div>
    <div
      class="sidebar-item"
      :class="{ active: route.path === '/settings' }"
      @click="router.push('/settings')"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="oklch(56% 0.11 240)" stroke-width="1.5" style="flex-shrink:0">
        <circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.95 3.05l-1.4 1.4M4.45 11.55l-1.4 1.4M12.95 12.95l-1.4-1.4M4.45 4.45l-1.4-1.4"/>
      </svg>
      <span>设置</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTaskStore } from '@/stores/taskStore'
import { useRequirementStore } from '@/stores/requirementStore'
import { useTrashStore } from '@/stores/trashStore'
import { toDateKey } from '@/utils/dateTime'
import { useRoute, useRouter } from 'vue-router'

const store = useTaskStore()
const requirementStore = useRequirementStore()
const trashStore = useTrashStore()
const route = useRoute()
const router = useRouter()
const isSettingsRoute = computed(() => route.path === '/settings')

const today = new Date().toISOString().slice(0, 10)

// 需求池徽章：未完结（非 已完成/已搁置）的需求数
const openRequirementCount = computed(
  () => requirementStore.requirements.filter(r => r.status !== '已完成' && r.status !== '已搁置').length,
)

const viewItems = computed(() => [
  { key: 'matrix' as const, label: '四象限矩阵', color: 'oklch(55% 0.12 240)', badge: store.activeTasks.length },
  { key: 'today' as const, label: '今日任务', color: 'oklch(62% 0.14 4)', badge: store.activeTasks.filter(t => toDateKey(t.due) === today && !t.done).length },
  { key: 'done' as const, label: '已完成', color: 'oklch(64% 0.01 240)', badge: store.doneTasks.length },
])

const quadrants = computed(() => [
  { id: 1, label: '重要且紧急', color: 'oklch(62% 0.14 4)', badge: store.quadrantTasks(1).filter(t => !t.done).length },
  { id: 2, label: '重要不紧急', color: 'oklch(54% 0.13 138)', badge: store.quadrantTasks(2).filter(t => !t.done).length },
  { id: 3, label: '紧急不重要', color: 'oklch(56% 0.12 205)', badge: store.quadrantTasks(3).filter(t => !t.done).length },
  { id: 4, label: '不重要不紧急', color: 'oklch(54% 0.01 0)', badge: store.quadrantTasks(4).filter(t => !t.done).length },
])

function clickView(key: 'matrix' | 'today' | 'done' | 'reports' | 'summary' | 'requirements') {
  store.filterQuadrant = null
  store.setView(key)
  if (route.path === '/settings') {
    router.push('/')
  }
}

function clickQuadrant(q: number) {
  store.filterQuadrant = store.filterQuadrant === q ? null : q
  store.setView('matrix')
  if (route.path === '/settings') {
    router.push('/')
  }
}

function openReports() {
  store.filterQuadrant = null
  store.setView('reports')
  if (route.path === '/settings') {
    router.push('/')
  }
}

function openSummary() {
  store.filterQuadrant = null
  store.setView('summary')
  if (route.path === '/settings') {
    router.push('/')
  }
}

function openRequirements() {
  store.filterQuadrant = null
  store.setView('requirements')
  if (route.path === '/settings') {
    router.push('/')
  }
}

function openTeammates() {
  store.filterQuadrant = null
  store.setView('teammates')
  if (route.path === '/settings') {
    router.push('/')
  }
}

function openTrash() {
  store.filterQuadrant = null
  store.setView('trash')
  if (route.path === '/settings') {
    router.push('/')
  }
}
</script>

<style scoped>
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border-subtle);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}
.sidebar-section-label {
  padding: 6px 8px 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  margin-top: 8px;
}
.sidebar-section-label:first-child { margin-top: 0; }
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 450;
  transition: background var(--transition), color var(--transition);
  user-select: none;
}
.sidebar-item:hover { background: var(--surface-mid); color: var(--text-primary); }
.sidebar-item.active { background: oklch(95% 0.015 240); color: oklch(35% 0.1 240); font-weight: 500; }
.sidebar-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.sidebar-badge {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface-mid);
  border-radius: 20px;
  padding: 0 6px;
  min-width: 18px;
  text-align: center;
  line-height: 18px;
}
.sidebar-item.active .sidebar-badge {
  background: oklch(88% 0.04 240);
  color: oklch(35% 0.1 240);
}
</style>
