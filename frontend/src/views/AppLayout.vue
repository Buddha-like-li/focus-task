<template>
  <div class="app">
    <!-- Header drag region for the Windows Tauri shell. -->
    <header class="header" id="app-header" data-tauri-drag-region>
      <div class="header-logo" data-tauri-drag-region>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <rect x="2" y="2" width="9" height="9" rx="2.5" fill="oklch(55% 0.18 25)"/>
          <rect x="13" y="2" width="9" height="9" rx="2.5" fill="oklch(62% 0.13 145)"/>
          <rect x="2" y="13" width="9" height="9" rx="2.5" fill="oklch(62% 0.14 250)"/>
          <rect x="13" y="13" width="9" height="9" rx="2.5" fill="oklch(68% 0.04 0)"/>
        </svg>
      </div>
      <div class="header-divider" data-tauri-drag-region></div>
      <div class="header-brand" data-tauri-drag-region>
        <span class="header-title">Focus Task</span>
        <span class="header-subtitle">聚焦任务桌面台</span>
      </div>
      <div class="header-spacer" data-tauri-drag-region></div>
      <div v-if="showTaskChrome" class="header-actions">
        <div class="search-bar">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
            <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10L14 14"/>
          </svg>
          <input type="text" v-model="store.searchQuery" placeholder="搜索任务…" />
        </div>
        <button class="btn-icon" @click="panelOpen = !panelOpen" title="详情面板">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18">
            <rect x="2" y="2" width="12" height="12" rx="2"/><line x1="10" y1="2" x2="10" y2="14"/>
          </svg>
        </button>
        <button class="btn-icon btn-danger" @click="clearDone" title="清除已完成">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20">
            <path d="M3 4h10M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5 4l.5 8.5h5L11 4"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Sidebar -->
    <Sidebar />

    <!-- Main Content -->
    <div class="main" :class="{ 'panel-hidden': !panelOpen, 'reports-active': isFullView }">
      <div
        v-if="store.serviceError || reconnecting"
        class="service-status"
        role="status"
        aria-live="polite"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5v4M8 11.25v.25" />
        </svg>
        <span class="service-status-message">
          {{ reconnecting ? '正在重新连接 Focus Task 本地服务...' : store.serviceError }}
        </span>
        <button
          type="button"
          class="service-status-retry"
          :disabled="reconnecting"
          @click="reconnect"
        >
          {{ reconnecting ? '连接中...' : '重新连接' }}
        </button>
      </div>

      <SettingsView v-if="isSettingsRoute" />

      <!-- Matrix View -->
      <div v-else-if="!isFullView" class="matrix-area">
        <!-- Stats Bar -->
        <div class="stats-bar">
          <div class="stats-kicker">
            <span class="stats-kicker-label">今日焦点</span>
            <strong>{{ focusSummary }}</strong>
          </div>
          <div class="stat-item">
            <div class="stat-dot" style="background:oklch(55% 0.12 240)"></div>
            <span>共 <strong>{{ allVisible.length }}</strong> 项</span>
          </div>
          <div class="stat-item">
            <div class="stat-dot" style="background:oklch(54% 0.13 138)"></div>
            <span>已完成 <strong>{{ doneVisible.length }}</strong> 项</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" :style="{ width: progressPct + '%' }"></div>
          </div>
          <div class="stat-item">
            <strong>{{ progressPct }}%</strong>
          </div>
        </div>

        <!-- Matrix: flexbox-based for reliable equal-height rows -->
        <div class="axis-container">
          <!-- Top axis label -->
          <div class="axis-row-top">
            <div class="axis-vlabel"><span>重要</span></div>
            <div class="axis-sublabel-row">
              <span>紧急 ↑</span>
              <span>↓ 不紧急</span>
            </div>
          </div>
          <!-- Top row: Q1 + Q2 -->
          <div class="matrix-row">
            <div class="axis-vlabel-spacer"></div>
            <QuadrantCard :quadrant="1" />
            <QuadrantCard :quadrant="2" />
          </div>
          <!-- Bottom row: Q3 + Q4 -->
          <div class="matrix-row">
            <div class="axis-vlabel-spacer"><span>← 不重要</span></div>
            <QuadrantCard :quadrant="3" />
            <QuadrantCard :quadrant="4" />
          </div>
        </div>
      </div>

      <!-- Reports View -->
      <ReportsView v-else-if="isReportsView" />

      <!-- Summary View -->
      <SummaryView v-else-if="isSummaryView" />

      <!-- Requirements View （需求池， P2-4) -->
      <RequirementsView v-else-if="isRequirementsView" />

      <!-- Teammates View （队友任务， P6-3) -->
      <TeammatesView v-else-if="isTeammatesView" />

      <!-- Detail Panel -->
      <Transition name="panel">
        <DetailPanel v-if="panelOpen && !isFullView && !isSettingsRoute" />
      </Transition>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible"
      ref="contextMenuEl"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="context-item" @click="ctxAction('edit')">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M11 2L14 5L6 13H3V10L11 2Z"/></svg>
        编辑标题
      </div>
      <div class="context-item" @click="ctxAction('move', 1)">
        <svg viewBox="0 0 16 16" fill="none" stroke-width="1.5" width="14" height="14"><circle cx="8" cy="8" r="3" fill="oklch(62% 0.14 4)" stroke="none"/></svg>
        移至：重要且紧急
      </div>
      <div class="context-item" @click="ctxAction('move', 2)">
        <svg viewBox="0 0 16 16" fill="none" stroke-width="1.5" width="14" height="14"><circle cx="8" cy="8" r="3" fill="oklch(54% 0.13 138)" stroke="none"/></svg>
        移至：重要不紧急
      </div>
      <div class="context-item" @click="ctxAction('move', 3)">
        <svg viewBox="0 0 16 16" fill="none" stroke-width="1.5" width="14" height="14"><circle cx="8" cy="8" r="3" fill="oklch(56% 0.12 205)" stroke="none"/></svg>
        移至：紧急不重要
      </div>
      <div class="context-item" @click="ctxAction('move', 4)">
        <svg viewBox="0 0 16 16" fill="none" stroke-width="1.5" width="14" height="14"><circle cx="8" cy="8" r="3" fill="oklch(54% 0.01 0)" stroke="none"/></svg>
        移至：不重要不紧急
      </div>
      <div class="context-sep"></div>
      <div class="context-item danger" @click="ctxAction('delete')">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M3 4h10M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5 4l.5 8.5h5L11 4"/></svg>
        删除任务
      </div>
    </div>

    <!-- Update notification badge (FT-07) -->
    <div v-if="updateBadgeVisible" class="update-badge" @click="openUpdateDialog">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
        <path d="M8 2v8M8 12v1M3 10l5-8 5 8"/>
      </svg>
      <span>新版本 {{ updateInfo.version }} 可用</span>
    </div>

    <!-- Update dialog (FT-07) -->
    <n-modal
      v-model:show="showUpdateDialog"
      :mask-closable="!installingUpdate"
      :close-on-esc="!installingUpdate"
    >
      <n-card style="max-width: 460px" :title="`新版本 ${updateInfo.version || ''}`" :bordered="false">
        <p v-if="updateInfo.body" class="update-body">{{ updateInfo.body }}</p>
        <p v-else class="update-body">点击「立即更新」将下载并自动安装。</p>
        <p v-if="installingUpdate && installStatus" class="update-status" role="status" aria-live="polite">
          {{ installStatus }}
        </p>
        <n-progress v-if="installingUpdate && downloadProgress > 0 && downloadProgress < 100" type="line" :percentage="downloadProgress" />
        <p v-if="installError" class="update-error" role="alert">{{ installError }}</p>
        <template #footer>
          <div class="modal-actions">
            <n-button :disabled="installingUpdate" @click="showUpdateDialog = false">稍后</n-button>
            <n-button type="primary" :loading="installingUpdate" :disabled="installingUpdate" @click="installUpdate">
              {{ installingUpdate ? installStatus || '正在更新…' : '立即更新' }}
            </n-button>
          </div>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted, onUnmounted, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NModal, NCard, NButton, NProgress } from 'naive-ui'
import { useTaskStore } from '@/stores/taskStore'
import { useAuthStore } from '@/stores/authStore'
import { useRequirementStore } from '@/stores/requirementStore'
import { formatInstallPhase, useAppUpdate } from '@/composables/useAppUpdate'
import { isTauriRuntime } from '@/utils/platform'
import { appLogger } from '@/composables/useAppLogger'
import * as api from '@/api'
import Sidebar from '@/components/Sidebar.vue'
import QuadrantCard from '@/components/QuadrantCard.vue'
import DetailPanel from '@/components/DetailPanel.vue'
import ReportsView from '@/views/ReportsView.vue'
import SummaryView from '@/views/SummaryView.vue'
import RequirementsView from '@/views/RequirementsView.vue'
import TeammatesView from '@/views/TeammatesView.vue'
import SettingsView from '@/views/SettingsView.vue'

const store = useTaskStore()
const auth = useAuthStore()
const requirementStore = useRequirementStore()
const route = useRoute()
const router = useRouter()
const panelOpen = ref(true)
const reconnecting = ref(false)
const isSettingsRoute = computed(() => route.path === '/settings')
const isReportsView = computed(() => !isSettingsRoute.value && store.currentView === 'reports')
const isSummaryView = computed(() => !isSettingsRoute.value && store.currentView === 'summary')
const isRequirementsView = computed(() => !isSettingsRoute.value && store.currentView === 'requirements')
const isTeammatesView = computed(() => !isSettingsRoute.value && (store.currentView as string) === 'teammates')
const isFullView = computed(() => isReportsView.value || isSummaryView.value || isRequirementsView.value || isTeammatesView.value)
const showTaskChrome = computed(() => !isSettingsRoute.value)

// ─── Window Dragging ───
// Tauri v2 official approach: listen to mousedown on the header element by ID,
// call startDragging() directly (no await, no .catch(), must be synchronous).
// See: https://v2.tauri.app/learn/window-customization/
let appWindow: any = null

async function initDrag() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    appWindow = getCurrentWindow()
  } catch {
    return // browser dev mode, no dragging needed
  }

  const header = document.getElementById('app-header')
  if (!header) return

  header.addEventListener('mousedown', (e: MouseEvent) => {
    // Only left mouse button (e.buttons: 1 = primary button held down)
    if (e.buttons !== 1) return
    // Skip if clicking interactive elements (search bar, buttons)
    const t = e.target as HTMLElement
    if (t.closest('.header-actions') || t.tagName === 'INPUT' || t.tagName === 'BUTTON') return
    // Double-click → maximize/restore
    if (e.detail === 2) {
      appWindow.toggleMaximize()
      return
    }
    // Single click → drag (must be called synchronously inside mousedown)
    appWindow.startDragging()
  })
}

// ─── Stats ───
const allVisible = computed(() => {
  const q = store.searchQuery.toLowerCase()
  return store.activeTasks.filter(t => !q || t.title.toLowerCase().includes(q))
})
const doneVisible = computed(() => allVisible.value.filter(t => t.done))
const progressPct = computed(() => {
  const total = allVisible.value.length
  return total ? Math.round(doneVisible.value.length / total * 100) : 0
})
const focusSummary = computed(() => {
  const urgentImportant = store.quadrantTasks(1).filter(t => !t.done).length
  if (urgentImportant > 0) return `${urgentImportant} 项需要优先处理`
  const importantPlanned = store.quadrantTasks(2).filter(t => !t.done).length
  if (importantPlanned > 0) return `${importantPlanned} 项值得安排到计划里`
  return '当前节奏很干净'
})

// ─── Context Menu ───
const contextMenu = reactive({ visible: false, x: 0, y: 0, clientId: '' })
const contextMenuEl = ref<HTMLElement | null>(null)
const contextMenuViewportMargin = 8
let contextMenuRequestId = 0

function clampContextMenuCoordinate(coordinate: number, menuSize: number, viewportSize: number): number {
  const maximum = Math.max(contextMenuViewportMargin, viewportSize - menuSize - contextMenuViewportMargin)
  return Math.max(contextMenuViewportMargin, Math.min(coordinate, maximum))
}

function showContextMenu(e: MouseEvent, clientId: string) {
  e.preventDefault()
  const requestId = ++contextMenuRequestId
  contextMenu.visible = true
  contextMenu.clientId = clientId

  // 首帧先保证点击点不会在视口外；下一帧按实际渲染出的菜单尺寸重新定位。
  contextMenu.x = clampContextMenuCoordinate(e.clientX, 0, window.innerWidth)
  contextMenu.y = clampContextMenuCoordinate(e.clientY, 0, window.innerHeight)
  void nextTick(() => {
    if (!contextMenu.visible || requestId !== contextMenuRequestId || !contextMenuEl.value) return
    const { width, height } = contextMenuEl.value.getBoundingClientRect()
    contextMenu.x = clampContextMenuCoordinate(e.clientX, width, window.innerWidth)
    contextMenu.y = clampContextMenuCoordinate(e.clientY, height, window.innerHeight)
  })
}

function hideContextMenu() {
  contextMenu.visible = false
}

function ctxAction(action: string, quadrant?: number) {
  const cid = contextMenu.clientId
  if (action === 'edit') {
    store.selectTask(cid)
  } else if (action === 'move' && quadrant) {
    store.updateTask(cid, { quadrant })
  } else if (action === 'delete') {
    store.removeTask(cid)
  }
  hideContextMenu()
}

function clearDone() {
  const done = store.activeTasks.filter(t => t.done)
  done.forEach(t => store.removeTask(t.clientId))
}

async function reconnect() {
  reconnecting.value = true
  try {
    await store.fetchTasks()
  } catch {
    // fetchTasks retains the current service error for the status banner.
  } finally {
    reconnecting.value = false
  }
}

// Expose showContextMenu for child components
provide('showContextMenu', showContextMenu)

// ─── Auto-update (FT-07) ───────────────────────────────────────────────
const {
  updateInfo,
  downloadProgress,
  installing: installingUpdate,
  installPhase,
  installError,
  checkForUpdate,
  downloadAndInstall,
} = useAppUpdate()
const showUpdateDialog = ref(false)
const updateBadgeVisible = ref(false)
const installStatus = computed(() => formatInstallPhase(installPhase.value))

function openUpdateDialog() {
  showUpdateDialog.value = true
}

async function installUpdate() {
  try {
    await downloadAndInstall()
  } catch (err) {
    // The Tauri updater logs the failure; the modal can stay open for retry.
    appLogger.error('[update] AppLayout installUpdate failed', err, { persist: true })
  }
}

onMounted(() => {
  document.addEventListener('click', hideContextMenu)
  // Window dragging is independent of data loading and must not delay a
  // visible service connection error.
  void initDrag()
  // When any API call gets a 401/403 (token expired or missing from keyring),
  // log out and send the user back to the login page instead of leaving them
  // staring at silent failures.
  api.onAuthExpired(async (context) => {
    if (await auth.invalidateSessionIfCurrent(context)) {
      router.replace('/login')
    }
  })

  // The Windows client talks directly to the local Focus Task service. A failed
  // initial request is logged and never falls back to a separate task store.
  store.fetchTasks().catch(() => {})

  // P2-4: 需求池独立拉取（失败不阻塞主流程）
  requirementStore.fetchAll().catch(() => {})

  // FT-07: silent update check 5s after startup. Only on Tauri runtime.
  if (isTauriRuntime()) {
    setTimeout(async () => {
      try {
        const info = await checkForUpdate({ silent: true })
        if (info) {
          updateBadgeVisible.value = true
        }
      } catch (err) {
        // Network or signature error — silently ignore; user can retry
        // from SettingsView → 关于 → 检查更新.
        console.debug('Silent update check failed:', err)
      }
    }, 5000)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
  api.onAuthExpired(null)
})
</script>

<style scoped>
.app {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-rows: var(--header-height) minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
}
.header {
  grid-column: 1 / -1;
  background: linear-gradient(180deg, oklch(99% 0.003 240), var(--surface));
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 10px;
  z-index: 20;
  /* Make header a drag target via cursor, actual drag via JS startDragging() */
  cursor: default;
  -webkit-user-select: none;
  user-select: none;
}
.header-logo { display: flex; align-items: center; justify-content: center; padding: 0 2px; }
.header-logo svg { display: block; width: 22px; height: 22px; }
.header-divider { width: 1px; height: 20px; background: var(--border-subtle); margin: 0 1px; }
.header-title {
  font-family: 'DM Serif Display', serif;
  font-size: 20px;
  color: var(--text-primary);
  letter-spacing: -0.28px;
  line-height: 1.05;
}
.header-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.header-subtitle { font-size: 12px; color: var(--text-muted); line-height: 1.1; }
.header-spacer { flex: 1; min-width: 0; }
/* All interactive elements: normal cursor, no drag */
.header-actions {
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: default;
  -webkit-user-select: auto;
  user-select: auto;
}
.btn-icon {
  width: 30px; height: 30px; border-radius: var(--radius-sm);
  border: none; background: transparent; cursor: pointer;
  display: grid; place-items: center; color: var(--text-secondary);
  transition: background var(--transition), color var(--transition);
}
.btn-icon:hover { background: var(--surface-mid); color: var(--text-primary); }
.btn-icon.btn-danger { color: oklch(58% 0.16 20); }
.btn-icon.btn-danger:hover { background: oklch(96% 0.02 20); color: oklch(48% 0.18 20); }
.search-bar {
  display: flex; align-items: center; gap: 6px;
  background: var(--surface-mid); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm); padding: 5px 12px; width: 268px;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.search-bar:focus-within {
  border-color: oklch(60% 0.12 240);
  box-shadow: 0 0 0 3px oklch(60% 0.12 240 / 0.12);
}
.search-bar input {
  background: none; border: none; outline: none;
  font: inherit; font-size: 14px; color: var(--text-primary); width: 100%;
}
.search-bar input::placeholder { color: var(--text-muted); }

/* ─── Main Content ─── */
.main {
  display: grid;
  grid-template-columns: 1fr 260px;
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
  min-height: 0;
  position: relative;
  transition: grid-template-columns 220ms cubic-bezier(0.2, 0, 0, 1);
}
.main.panel-hidden { grid-template-columns: 1fr 0; }
.main.reports-active { grid-template-columns: 1fr 0; }

.service-status {
  position: absolute;
  top: 8px;
  left: 16px;
  right: 16px;
  z-index: 10;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 10px;
  border: 1px solid oklch(75% 0.12 50);
  border-radius: var(--radius-sm);
  background: oklch(98% 0.025 80);
  color: oklch(35% 0.09 45);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.08);
  font-size: 13px;
}
.service-status-message {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.service-status-retry {
  flex: 0 0 auto;
  min-height: 26px;
  border: 1px solid oklch(63% 0.11 50);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: oklch(36% 0.09 45);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 9px;
}
.service-status-retry:hover:not(:disabled) { background: oklch(94% 0.04 70); }
.service-status-retry:disabled { cursor: wait; opacity: 0.7; }

.matrix-area {
  /* 底部 56px 一次给足，其中为右下角同步状态浮层预留避让空间。 */
  padding: 6px 16px 56px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: visible;
}

/* ─── Stats Bar ─── */
.stats-bar {
  display: flex; align-items: center; gap: 14px;
  padding: 0 0 8px; flex-shrink: 0;
  border-bottom: 1px solid oklch(88% 0.01 240 / 0.55);
  margin-bottom: 6px;
}
.stats-kicker {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}
.stats-kicker-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.stats-kicker strong {
  font-size: 13px;
  color: var(--text-primary);
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}
.stat-dot { width: 7px; height: 7px; border-radius: 50%; }
.stat-item strong { color: var(--text-secondary); font-weight: 600; }
.progress-bar-wrap { flex: 1; height: 5px; background: var(--border-subtle); border-radius: 999px; overflow: hidden; }
.progress-bar-fill { height: 100%; background: oklch(60% 0.12 240); border-radius: 2px; transition: width 0.4s cubic-bezier(0.2, 0, 0, 1); }

/* ─── Axis Container: flexbox-based for reliable equal-height rows ─── */
.axis-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  /* 底部留白由 .matrix-area 统一承担。 */
}

.axis-row-top {
  display: flex;
  align-items: flex-end;
  /* 与 .matrix-row 一致，且不额外缩进：标签列本身占用 22px。 */
  gap: 10px;
  flex-shrink: 0;
  height: 18px;
}
.axis-sublabel-row {
  flex: 1;
  display: flex;
  justify-content: space-between;
  padding: 0 2px;
}
.axis-sublabel-row span { font-size: 11px; font-weight: 500; color: var(--text-muted); }
/* 与下方 .axis-vlabel-spacer 同宽，让顶部标签对准象限卡片。 */
.axis-vlabel { width: 22px; flex-shrink: 0; overflow: visible; }
.axis-vlabel span { font-size: 11px; font-weight: 500; color: var(--text-muted); white-space: nowrap; }

.matrix-row {
  display: flex;
  gap: 10px;
  flex: 1;
  min-height: 0;
}

.axis-vlabel-spacer {
  width: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.axis-vlabel-spacer span {
  font-size: 11px; font-weight: 500; color: var(--text-muted);
  writing-mode: vertical-lr; transform: rotate(180deg);
}

/* ─── Context Menu ─── */
.context-menu {
  position: fixed; background: var(--surface); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md); box-shadow: var(--shadow-panel);
  padding: 4px; z-index: 1000; min-width: 160px;
  max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow-y: auto;
}
.context-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: var(--radius-sm);
  cursor: pointer; font-size: 14px; color: var(--text-primary);
  transition: background var(--transition);
}
.context-item:hover { background: var(--surface-mid); }
.context-item.danger { color: oklch(50% 0.18 20); }
.context-item.danger:hover { background: oklch(96% 0.02 20); }
.context-sep { height: 1px; background: var(--border-subtle); margin: 3px 0; }

/* Panel transition */
.panel-enter-active { transition: opacity 160ms cubic-bezier(0.2, 0, 0, 1); }
.panel-leave-active { transition: opacity 160ms cubic-bezier(0.2, 0, 0, 1); }
.panel-enter-from, .panel-leave-to { opacity: 0; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ─── Update badge & dialog (FT-07) ─── */
.update-badge {
  position: fixed;
  top: 56px;
  right: 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: oklch(96% 0.04 250);
  color: oklch(45% 0.12 250);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 50;
}
.update-badge:hover { background: oklch(94% 0.05 250); }
.update-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted, #4b5563);
  white-space: pre-wrap;
  margin: 0 0 14px;
}
</style>
