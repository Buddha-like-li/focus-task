export function toDateKey(value: string): string {
  return value ? value.slice(0, 10) : ''
}

function parseLocalParts(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)
  if (!match) return null
  const [, year, month, day, hour = '00', minute = '00'] = match
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  )
}

export function formatDateTimeLocal(value: string): string {
  if (!value) return ''
  const date = parseDateTimeLocal(value)
  if (!date || Number.isNaN(date.getTime())) return value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hours}:${minutes}`
}

export function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null
  const date = parseLocalParts(value) || new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function normalizeDateTimeLocal(value: string, fallbackTime = '09:00'): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T${fallbackTime}`
  return value
}

export function isOverdueDateTime(value: string): boolean {
  const date = parseDateTimeLocal(value)
  if (!date) return false
  return date.getTime() < Date.now()
}

export function formatRelativeDue(value: string): string {
  const date = parseDateTimeLocal(value)
  if (!date) return ''

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  if (diff === 0) return `今天 ${hm}`
  if (diff === 1) return `明天 ${hm}`
  if (diff === -1) return `昨天 ${hm}`
  if (diff < 0) return `${Math.abs(diff)}天前 ${hm}`
  if (diff <= 7) return `${diff}天后 ${hm}`
  return `${date.getMonth() + 1}/${date.getDate()} ${hm}`
}
