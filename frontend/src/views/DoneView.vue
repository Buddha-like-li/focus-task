<template>
  <div class="list-view">
    <div class="list-header">
      <h2>✅ 已完成</h2>
      <span class="count">{{ store.doneTasks.length }}</span>
    </div>
    <div class="list-body">
      <TaskItem
        v-for="task in store.doneTasks"
        :key="task.clientId"
        :task="task"
        :quadrant="task.quadrant"
        :selected="task.clientId === store.selectedTaskId"
        @select="store.selectTask(task.clientId)"
        @toggle="store.toggleDone(task.clientId)"
      />
      <div v-if="store.doneTasks.length === 0" class="empty">还没有已完成的任务</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTaskStore } from '@/stores/taskStore'
import TaskItem from '@/components/TaskItem.vue'
const store = useTaskStore()
</script>

<style scoped>
.list-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.list-header h2 { font-size: 17px; font-weight: 600; }
.count { font-size: 13px; color: var(--text-muted); }
.list-body { flex: 1; overflow-y: auto; padding: 12px 20px; }
.empty { text-align: center; padding: 40px 0; color: var(--text-muted); }
</style>
