import { computed } from 'vue'
import { useTaskStore, type Task } from '@/stores/taskStore'
import { toDateKey } from '@/utils/dateTime'

/**
 * Shared task filtering logic.
 * Keeps view-aware filtering out of presentational components.
 */
export function useTaskFilter() {
  const store = useTaskStore()

  /** Apply global search + view filters on top of a per-quadrant task list. */
  function filterForQuadrant(tasks: Task[]): Task[] {
    let list = tasks
    const q = store.searchQuery.toLowerCase()
    if (q) list = list.filter(t => t.title.toLowerCase().includes(q))
    const view = store.currentView
    if (view === 'today') {
      const today = new Date().toISOString().slice(0, 10)
      list = list.filter(t => toDateKey(t.due) === today)
    } else if (view === 'done') {
      list = list.filter(t => t.done)
    }
    return list
  }

  /** Whether a quadrant card should appear dimmed (another quadrant is actively filtered). */
  function quadrantDimmed(quadrant: number): boolean {
    const fq = store.filterQuadrant
    return fq !== null && fq !== undefined && fq !== quadrant
  }

  /** Reactive dimmed flag — use in templates. */
  const dimmed = (quadrant: number) => computed(() => quadrantDimmed(quadrant))

  return { filterForQuadrant, quadrantDimmed, dimmed }
}
