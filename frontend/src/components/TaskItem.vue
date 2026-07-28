<template>
  <div
    class="task-item"
    :class="{ done: task.done, selected, compact }"
    draggable="true"
    @click="$emit('select')"
    @dragstart="$emit('dragstart', $event)"
    @contextmenu="$emit('contextmenu', $event)"
  >
    <div class="task-checkbox" :class="{ done: task.done }" @click.stop="$emit('toggle')">
      <svg v-if="task.done" class="check-icon" width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <div class="task-content">
      <div class="task-title-row">
        <div class="task-title">{{ task.title || '未命名任务' }}</div>
      </div>
      <div v-if="!compact && (task.due || task.tag || task.updatedAt)" class="task-meta">
        <span v-if="task.due" class="task-due" :class="{ overdue: isOverdue }">{{ formatDate(task.due) }}</span>
        <span v-if="task.tag" class="task-tag">{{ task.tag }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@/stores/taskStore'
import { formatRelativeDue, isOverdueDateTime } from '@/utils/dateTime'

const props = defineProps<{
  task: Task
  quadrant: number
  selected: boolean
  compact?: boolean
}>()

defineEmits(['select', 'toggle', 'dragstart', 'contextmenu'])

const isOverdue = computed(() => {
  if (!props.task.due || props.task.done) return false
  return isOverdueDateTime(props.task.due)
})

function formatDate(dateStr: string) {
  return formatRelativeDue(dateStr)
}
</script>

<style scoped>
.task-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 5px 6px; border-radius: var(--radius-sm);
  cursor: pointer; transition: background var(--transition);
  position: relative; animation: taskIn 0.2s ease-out;
}

/* Quadrant-specific hover */
.q1 .task-item:hover { background: var(--q1-item-hover); }
.q2 .task-item:hover { background: var(--q2-item-hover); }
.q3 .task-item:hover { background: var(--q3-item-hover); }
.q4 .task-item:hover { background: var(--q4-item-hover); }

/* Selected indicator */
.task-item.selected::before {
  content: ''; position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 2.5px; border-radius: 2px;
}
.q1 .task-item.selected::before { background: var(--q1-header); }
.q2 .task-item.selected::before { background: var(--q2-header); }
.q3 .task-item.selected::before { background: var(--q3-header); }
.q4 .task-item.selected::before { background: var(--q4-header); }
.task-item.selected { padding-left: 12px; }

/* Checkbox */
.task-checkbox {
  width: 15px; height: 15px; border-radius: 50%;
  border: 1.5px solid; flex-shrink: 0; cursor: pointer;
  transition: all var(--transition); margin-top: 1px;
  display: grid; place-items: center; background: var(--surface);
}
.q1 .task-checkbox { border-color: var(--q1-header); }
.q2 .task-checkbox { border-color: var(--q2-header); }
.q3 .task-checkbox { border-color: var(--q3-header); }
.q4 .task-checkbox { border-color: var(--q4-header); }

.q1 .task-checkbox:hover { background: var(--q1-header); }
.q2 .task-checkbox:hover { background: var(--q2-header); }
.q3 .task-checkbox:hover { background: var(--q3-header); }
.q4 .task-checkbox:hover { background: var(--q4-header); }

.task-checkbox.done { opacity: 1; animation: checkPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.q1 .task-checkbox.done { background: var(--q1-header); border-color: var(--q1-header); }
.q2 .task-checkbox.done { background: var(--q2-header); border-color: var(--q2-header); }
.q3 .task-checkbox.done { background: var(--q3-header); border-color: var(--q3-header); }
.q4 .task-checkbox.done { background: var(--q4-header); border-color: var(--q4-header); }

@keyframes checkPop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.3); }
  60%  { transform: scale(0.95); }
  100% { transform: scale(1); }
}

.check-icon { display: block; }

/* Content */
.task-content { flex: 1; min-width: 0; text-align: left; }
.task-title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.task-title {
  font-size: 14px; font-weight: 450; color: var(--text-primary);
  line-height: 1.4; word-break: break-word; text-align: left;
  flex: 1;
  min-width: 0;
}
.task-item.done .task-title {
  text-decoration: line-through;
  color: var(--text-muted);
  animation: strikeIn 0.35s ease-out;
}

@keyframes strikeIn {
  0%   { opacity: 1; color: var(--text-primary); }
  50%  { opacity: 0.6; }
  100% { opacity: 1; color: var(--text-muted); }
}

.task-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.task-due { font-size: 12px; color: var(--text-muted); }
.task-due.overdue { color: oklch(55% 0.18 20); font-weight: 500; }
.task-tag { font-size: 11px; font-weight: 500; border-radius: 3px; padding: 1px 5px; }
.q1 .task-tag { background: var(--q1-tag-bg); color: var(--q1-header); }
.q2 .task-tag { background: var(--q2-tag-bg); color: var(--q2-header); }
.q3 .task-tag { background: var(--q3-tag-bg); color: var(--q3-header); }
.q4 .task-tag { background: var(--q4-tag-bg); color: var(--q4-header); }

@keyframes taskIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
