import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOverdueDateTime } from './dateTime'

describe('dateTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not mark a task overdue on its due date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T23:59:59'))

    expect(isOverdueDateTime('2026-06-12T09:00')).toBe(false)
    expect(isOverdueDateTime('2026-06-12T18:00')).toBe(false)
  })

  it('marks a task overdue from the next local day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T00:00:00'))

    expect(isOverdueDateTime('2026-06-12T18:00')).toBe(true)
    expect(isOverdueDateTime('2026-06-13T00:00')).toBe(false)
  })
})
