<template>
  <div
    class="quadrant"
    :class="['q' + quadrant, { 'drag-over': isDragOver }, { 'q-dimmed': isDimmed }]"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="quadrant-header">
      <div class="quadrant-dot"></div>
      <span class="quadrant-title">{{ title }}</span>
      <span class="quadrant-count">{{ undoneCount }}</span>
      <button
        class="quadrant-add"
        :disabled="creatingDraft"
        @click="showInlineAdd"
        title="添加任务"
      >+</button>
    </div>
    <p v-if="addError" class="inline-add-error" role="alert">{{ addError }}</p>
    <div class="task-list">
      <div
        v-for="entry in taskEntries"
        :key="entry.task.clientId"
        class="task-entry-block"
      >
        <div class="task-entry">
          <div class="task-entry-main">
            <TaskItem
              :task="entry.task"
              :quadrant="quadrant"
              :selected="entry.task.clientId === store.selectedTaskId"
              compact
              @select="store.selectTask(entry.task.clientId)"
              @toggle="store.toggleDone(entry.task.clientId)"
              @contextmenu="onItemContext($event, entry.task.clientId)"
              @dragstart="onDragStart(entry.task.clientId, $event)"
            />
          </div>
          <button
            v-if="entry.badgeCount > 0"
            class="child-badge"
            :class="{ expanded: isExpanded(entry.task.clientId) }"
            :title="isExpanded(entry.task.clientId) ? '收起子任务' : '展开子任务'"
            @click.stop="toggleExpand(entry.task.clientId)"
          >⊕ {{ entry.badgeCount }}</button>
          <span
            v-if="entry.orphan"
            class="orphan-tag"
            title="父任务不在当前象限或已删除"
          >无父任务</span>
        </div>
        <div v-if="isExpanded(entry.task.clientId)" class="subtask-children">
          <div v-if="entry.children.length === 0" class="subtask-empty-hint">
            当前视图下无可见子任务
          </div>
          <div
            v-for="child in entry.children"
            :key="child.clientId"
            class="subtask-row"
            :class="{ done: child.done, selected: child.clientId === store.selectedTaskId }"
            @click="store.selectTask(child.clientId)"
          >
            <div
              class="subtask-checkbox"
              :class="{ done: child.done }"
              @click.stop="store.toggleDone(child.clientId)"
            >
              <svg v-if="child.done" width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <span class="subtask-title">{{ child.title || '未命名任务' }}</span>
          </div>
        </div>
      </div>
      <div v-if="visibleTasks.length === 0" class="empty-state visible">
        <div class="empty-state-icon">
          <!-- Q1: target -->
          <svg v-if="quadrant === 1" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="q1Color" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
          </svg>
          <!-- Q2: chart -->
          <svg v-else-if="quadrant === 2" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="q2Color" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="3"/><line x1="2" y1="16" x2="22" y2="16"/><polyline points="10,16 10,10 14,10 14,6 18,6"/>
          </svg>
          <!-- Q3: inbox -->
          <svg v-else-if="quadrant === 3" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="q3Color" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22,12 16,12 14,15 10,15 8,12 2,12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A1 1 0 0 0 17.67 5H6.33a1 1 0 0 0-.88.55z"/>
          </svg>
          <!-- Q4: leaf -->
          <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="q4Color" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 18c4 0 7-3.5 7-7.5 0-2-1.5-3.5-3.5-3.5H13v-3c0-1.1-.9-2-2-2H8v4h2l-4 10a5 5 0 0 0 5 2z"/>
          </svg>
        </div>
        <p>{{ emptyText }}</p>
      </div>
    </div>
    <!-- Inline Add -->
    <div v-if="addVisible" class="inline-add visible">
      <div class="inline-add-dot"></div>
      <input
        ref="addInputEl"
        v-model="addTitle"
        class="inline-add-input"
        placeholder="添加任务，回车确认…"
        @input="onAddInput"
        @keydown.enter="confirmAdd"
        @keydown.escape="cancelAdd"
        @blur="cancelAdd"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, inject } from 'vue'
import { useTaskStore, type Task } from '@/stores/taskStore'
import { useTaskFilter } from '@/composables/useTaskFilter'
import TaskItem from './TaskItem.vue'

const props = defineProps<{ quadrant: number }>()
const store = useTaskStore()
const { filterForQuadrant } = useTaskFilter()
const showContextMenu: any = inject('showContextMenu', () => {})

const addVisible = ref(false)
const addTitle = ref('')
const addInputEl = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

const titles: Record<number, string> = {
  1: '重要 · 紧急', 2: '重要 · 不紧急', 3: '紧急 · 不重要', 4: '不重要 · 不紧急',
}
const emptyTexts: Record<number, string> = {
  1: '立即处理的要事', 2: '规划未来的重要事项', 3: '可委托他人的事务', 4: '可考虑删除的事项',
}

// Quadrant stroke colors for empty-state SVG icons
const q1Color = 'oklch(62% 0.14 4)'
const q2Color = 'oklch(54% 0.13 138)'
const q3Color = 'oklch(56% 0.12 205)'
const q4Color = 'oklch(50% 0.01 240)'

const title = computed(() => titles[props.quadrant])
const emptyText = computed(() => emptyTexts[props.quadrant])

const visibleTasks = computed(() => filterForQuadrant(store.quadrantTasks(props.quadrant)))

const undoneCount = computed(() => visibleTasks.value.filter(t => !t.done).length)

// ─── Parent / Subtask grouping (P5-1) ───
// activeTasks now flattens subtasks so each child is independently addressable
// in the store. To avoid double-rendering (parent row AND orphaned child row)
// we group them: top-level parents render as one row with a count badge, and
// their inline children only appear when expanded. Children whose parent is
// absent from this quadrant's filtered list surface as "orphan" top-level rows.
interface TaskEntry {
  task: Task
  children: Task[]
  badgeCount: number
  orphan: boolean
}

const taskEntries = computed<TaskEntry[]>(() => {
  const list = visibleTasks.value
  const byClientId = new Map(list.map(t => [t.clientId, t]))
  const seen = new Set<string>()
  const entries: TaskEntry[] = []

  for (const t of list) {
    if (seen.has(t.clientId)) continue

    const isChild = !!t.parentTaskId
    const parentInList = t.parentTaskId ? byClientId.has(t.parentTaskId) : false

    if (isChild && parentInList) {
      // Rendered under its parent; skip the standalone row.
      continue
    }

    if (isChild && !parentInList) {
      // Orphan subtask: parent is in another quadrant / deleted / filtered out.
      entries.push({ task: t, children: [], badgeCount: 0, orphan: true })
      seen.add(t.clientId)
      continue
    }

    // Top-level parent (or a parentless task). Collect inline children from
    // the filtered list so search/today/done filters apply consistently.
    const children = list.filter(c => c.parentTaskId === t.clientId)
    for (const c of children) seen.add(c.clientId)
    // badgeCount reflects the canonical child count (server-reported when
    // available) so the badge is stable even if a child is filtered out.
    const badgeCount = Math.max(t.childCount || 0, children.length, t.subtasks?.length || 0)
    entries.push({ task: t, children, badgeCount, orphan: false })
    seen.add(t.clientId)
  }

  return entries
})

// ─── Expand state (P5-1) ───
// Persisted per-parent in localStorage under ``focus-task-subtask-expand-<clientId>``.
// We load every matching key once on mount and keep the Set in memory; toggling
// rewrites just the affected key so we don't wipe unrelated entries.
const EXPAND_PREFIX = 'focus-task-subtask-expand-'

function loadExpanded(): Set<string> {
  const set = new Set<string>()
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith(EXPAND_PREFIX) && localStorage.getItem(key) === '1') {
        set.add(key.slice(EXPAND_PREFIX.length))
      }
    }
  } catch {
    // localStorage may be unavailable (sandboxed iframe); degrade to in-memory.
  }
  return set
}

const expandedParents = ref<Set<string>>(loadExpanded())

function isExpanded(clientId: string): boolean {
  return expandedParents.value.has(clientId)
}

function toggleExpand(clientId: string) {
  const next = new Set(expandedParents.value)
  if (next.has(clientId)) {
    next.delete(clientId)
    try { localStorage.removeItem(EXPAND_PREFIX + clientId) } catch {}
  } else {
    next.add(clientId)
    try { localStorage.setItem(EXPAND_PREFIX + clientId, '1') } catch {}
  }
  expandedParents.value = next
}

const isDimmed = computed(() => {
  const fq = store.filterQuadrant
  return fq !== null && fq !== undefined && fq !== props.quadrant
})

// ─── Inline Add ───
let draftId: string | null = null
const creatingDraft = ref(false)
const addError = ref('')

async function showInlineAdd() {
  if (creatingDraft.value) return
  creatingDraft.value = true
  addError.value = ''
  try {
    const task = await store.addTask(props.quadrant, '')
    draftId = task.clientId
    addVisible.value = true
    store.selectTask(task.clientId)
    await nextTick()
    addInputEl.value?.focus()
  } catch (error) {
    addError.value = error instanceof Error ? error.message : '创建任务失败'
  } finally {
    creatingDraft.value = false
  }
}

function onAddInput() {
  if (!draftId) return
  const task = store.tasks.find(t => t.clientId === draftId)
  if (task) {
    task.title = addTitle.value
    // The detail panel will pick up the change reactively
  }
}

async function confirmAdd() {
  if (draftId) {
    const title = addTitle.value.trim()
    if (title) {
      const saved = await store.updateTask(draftId, { title })
      if (!saved) {
        addError.value = store.serviceError || '无法保存任务，请确认本地服务正在运行后重试。'
        return
      }
    } else {
      const removed = await store.moveTaskToTrash(draftId)
      if (!removed) {
        addError.value = store.serviceError || '无法将空任务移入垃圾桶，请确认本地服务正在运行后重试。'
        return
      }
    }
  }
  addError.value = ''
  addTitle.value = ''
  addVisible.value = false
  draftId = null
}

async function cancelAdd() {
  const currentDraftId = draftId
  const title = addTitle.value.trim()
  if (currentDraftId && title) {
    const saved = await store.updateTask(currentDraftId, { title })
    if (!saved) {
      addError.value = store.serviceError || '无法保存任务，请确认本地服务正在运行后重试。'
      return
    }
  }
  // A task is created before its title is entered so it can be edited in the
  // details panel. Losing focus must never discard that task.
  addTitle.value = ''
  addVisible.value = false
  draftId = null
  addError.value = ''
}

// ─── Drag & Drop ───
let dragId = ''

function onDragStart(clientId: string, e: DragEvent) {
  dragId = clientId
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  if (dragId) {
    await store.updateTask(dragId, { quadrant: props.quadrant })
    dragId = ''
  }
}

// ─── Context Menu ───
function onItemContext(e: MouseEvent, clientId: string) {
  showContextMenu(e, clientId)
}
</script>

<style scoped>
.quadrant {
  border-radius: var(--radius-lg);
  border: 1px solid;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  /* flex 项默认 min-width:auto，长标签等不可断内容会撑破 1fr 宽度。 */
  min-width: 0;
  flex: 1;
  transition: box-shadow var(--transition), opacity var(--transition), filter var(--transition), transform var(--transition);
}
.quadrant:hover { box-shadow: 0 18px 36px oklch(0% 0 0 / 0.045); transform: translateY(-1px); }
.q-dimmed { opacity: 0.35; filter: grayscale(30%); }

.q1 { background: var(--q1-bg); border-color: var(--q1-border); }
.q2 { background: var(--q2-bg); border-color: var(--q2-border); }
.q3 { background: var(--q3-bg); border-color: var(--q3-border); }
.q4 { background: var(--q4-bg); border-color: var(--q4-border); }

.drag-over { outline: 2px solid var(--q1-header); outline-offset: -2px; }
.q2.drag-over { outline-color: var(--q2-header); }
.q3.drag-over { outline-color: var(--q3-header); }
.q4.drag-over { outline-color: var(--q4-header); }

.quadrant-header {
  display: flex; align-items: center;
  padding: 9px 11px 8px; gap: 7px;
  border-bottom: 0.5px solid;
  backdrop-filter: blur(12px);
}
.q1 .quadrant-header { border-color: var(--q1-border); }
.q2 .quadrant-header { border-color: var(--q2-border); }
.q3 .quadrant-header { border-color: var(--q3-border); }
.q4 .quadrant-header { border-color: var(--q4-border); }

.quadrant-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.q1 .quadrant-dot { background: var(--q1-header); }
.q2 .quadrant-dot { background: var(--q2-header); }
.q3 .quadrant-dot { background: var(--q3-header); }
.q4 .quadrant-dot { background: var(--q4-header); }

.quadrant-title { font-size: 14px; font-weight: 600; flex: 1; }
.q1 .quadrant-title { color: var(--q1-header); }
.q2 .quadrant-title { color: var(--q2-header); }
.q3 .quadrant-title { color: var(--q3-header); }
.q4 .quadrant-title { color: var(--q4-header); }

.quadrant-count {
  font-size: 12px; font-weight: 600; border-radius: 20px;
  padding: 1px 7px; opacity: 0.7;
}
.q1 .quadrant-count { background: var(--q1-count-bg); color: var(--q1-header); }
.q2 .quadrant-count { background: var(--q2-count-bg); color: var(--q2-header); }
.q3 .quadrant-count { background: var(--q3-count-bg); color: var(--q3-header); }
.q4 .quadrant-count { background: var(--q4-count-bg); color: var(--q4-header); }

.quadrant-add {
  width: 26px; height: 26px; border-radius: 50%;
  border: 1.5px solid; background: transparent;
  cursor: pointer; display: grid; place-items: center;
  font-size: 18px; font-weight: 300;
  transition: all var(--transition); line-height: 1;
}
.q1 .quadrant-add { border-color: var(--q1-border); color: var(--q1-header); }
.q2 .quadrant-add { border-color: var(--q2-border); color: var(--q2-header); }
.q3 .quadrant-add { border-color: var(--q3-border); color: var(--q3-header); }
.q4 .quadrant-add { border-color: var(--q4-border); color: var(--q4-header); }

.q1 .quadrant-add:hover { background: var(--q1-header); color: white; border-color: var(--q1-header); }
.q2 .quadrant-add:hover { background: var(--q2-header); color: white; border-color: var(--q2-header); }
.q3 .quadrant-add:hover { background: var(--q3-header); color: white; border-color: var(--q3-header); }
.q4 .quadrant-add:hover { background: var(--q4-header); color: white; border-color: var(--q4-header); }

/* ─── Task List ─── */
.task-list {
  flex: 1; overflow-y: auto;
  padding: 6px 7px 0;
  display: flex; flex-direction: column; gap: 3px;
  min-height: 0;
}

.quadrant-footer {
  height: 30px;
  flex-shrink: 0;
  border-top: 0.5px solid;
  background: transparent;
  margin: 0 12px 12px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 4px;
}
.q1 .quadrant-footer { border-color: var(--q1-border); }
.q2 .quadrant-footer { border-color: var(--q2-border); }
.q3 .quadrant-footer { border-color: var(--q3-border); }
.q4 .quadrant-footer { border-color: var(--q4-border); }

.mode-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: oklch(96% 0.005 240 / 0.6);
  opacity: 0.95;
}
.mode-toggle-btn {
  border: none;
  background: transparent;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 3px 9px;
  border-radius: 999px;
  cursor: pointer;
}
.mode-toggle-btn.active {
  background: var(--text-primary, oklch(30% 0.04 240));
  color: white;
}
.task-list::-webkit-scrollbar { width: 4px; }
.task-list::-webkit-scrollbar-track { background: transparent; }
.task-list::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 2px; }

/* ─── Empty State ─── */
.empty-state {
  flex: 1; display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 6px; padding: 18px;
  opacity: 0; transition: opacity 0.3s;
}
.empty-state.visible { opacity: 1; }
.empty-state-icon { font-size: 22px; margin-bottom: 2px; }
.empty-state p {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.5;
  max-width: 18ch;
}

/* ─── Inline Add ─── */
.inline-add {
  display: none; padding: 6px 8px; gap: 8px; align-items: center;
}
.inline-add.visible { display: flex; }
.inline-add-error {
  margin: 6px 8px 0;
  color: oklch(52% 0.17 25);
  font-size: 12px;
  line-height: 1.45;
}
.inline-add-dot {
  width: 15px; height: 15px; border-radius: 50%;
  border: 1.5px dashed; flex-shrink: 0;
}
.q1 .inline-add-dot { border-color: var(--q1-header); }
.q2 .inline-add-dot { border-color: var(--q2-header); }
.q3 .inline-add-dot { border-color: var(--q3-header); }
.q4 .inline-add-dot { border-color: var(--q4-header); }
.inline-add-input {
  flex: 1; background: none; border: none; outline: none;
  font: inherit; font-size: 14px; color: var(--text-primary);
}
.inline-add-input::placeholder { color: var(--text-muted); }

/* ─── Parent / Subtask grouping (P5-1) ─── */
.task-entry-block {
  display: flex;
  flex-direction: column;
}
.task-entry {
  display: flex;
  align-items: center;
  gap: 4px;
}
.task-entry-main { flex: 1; min-width: 0; }

.child-badge {
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
  background: var(--surface-mid);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  padding: 0 8px;
  height: 20px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  transition: background var(--transition), color var(--transition);
}
.child-badge:hover { background: var(--surface); color: var(--text-primary); }
.child-badge.expanded {
  background: oklch(55% 0.12 240);
  color: white;
  border-color: oklch(55% 0.12 240);
}

.orphan-tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
  padding: 1px 6px;
  background: oklch(96% 0.03 25);
  color: oklch(48% 0.15 25);
  line-height: 1.4;
}

.subtask-children {
  margin: 2px 0 4px 16px;
  padding-left: 10px;
  border-left: 2px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.subtask-empty-hint {
  font-size: 11px;
  color: var(--text-muted);
  padding: 4px 6px;
  font-style: italic;
}

.subtask-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition);
  position: relative;
}
.q1 .subtask-row:hover { background: var(--q1-item-hover); }
.q2 .subtask-row:hover { background: var(--q2-item-hover); }
.q3 .subtask-row:hover { background: var(--q3-item-hover); }
.q4 .subtask-row:hover { background: var(--q4-item-hover); }
.subtask-row.selected::before {
  content: '';
  position: absolute;
  left: 0; top: 3px; bottom: 3px;
  width: 2px; border-radius: 2px;
}
.q1 .subtask-row.selected::before { background: var(--q1-header); }
.q2 .subtask-row.selected::before { background: var(--q2-header); }
.q3 .subtask-row.selected::before { background: var(--q3-header); }
.q4 .subtask-row.selected::before { background: var(--q4-header); }

.subtask-checkbox {
  width: 12px; height: 12px; border-radius: 50%;
  border: 1.5px solid; flex-shrink: 0; cursor: pointer;
  margin-top: 1px;
  display: grid; place-items: center;
  background: var(--surface);
  transition: all var(--transition);
}
.q1 .subtask-checkbox { border-color: var(--q1-header); }
.q2 .subtask-checkbox { border-color: var(--q2-header); }
.q3 .subtask-checkbox { border-color: var(--q3-header); }
.q4 .subtask-checkbox { border-color: var(--q4-header); }
.q1 .subtask-checkbox:hover { background: var(--q1-header); }
.q2 .subtask-checkbox:hover { background: var(--q2-header); }
.q3 .subtask-checkbox:hover { background: var(--q3-header); }
.q4 .subtask-checkbox:hover { background: var(--q4-header); }
.subtask-checkbox.done {
  animation: checkPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.q1 .subtask-checkbox.done { background: var(--q1-header); border-color: var(--q1-header); }
.q2 .subtask-checkbox.done { background: var(--q2-header); border-color: var(--q2-header); }
.q3 .subtask-checkbox.done { background: var(--q3-header); border-color: var(--q3-header); }
.q4 .subtask-checkbox.done { background: var(--q4-header); border-color: var(--q4-header); }

.subtask-title {
  font-size: 12.5px;
  font-weight: 450;
  color: var(--text-secondary);
  line-height: 1.4;
  word-break: break-word;
  text-align: left;
  flex: 1;
  min-width: 0;
}
.subtask-row.done .subtask-title {
  text-decoration: line-through;
  color: var(--text-muted);
}
</style>
