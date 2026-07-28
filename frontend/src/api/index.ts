/**
 * API client for the local Focus Task service.
 * Handles snake_case ↔ camelCase conversion transparently.
 */
import type { Task } from '@/stores/taskStore'
import { loadAuthState } from '@/utils/secureStorage'
import {
  LOCAL_SERVICE_API_BASE,
  buildApiUrl,
  networkFailureMessage,
} from './base'
import { appLogger } from '@/composables/useAppLogger'

export interface TaskAttachment {
  id: string
  filename: string
  contentType: string
  size: number
  isImage: boolean
}

const API_BASE = LOCAL_SERVICE_API_BASE

// Global auth-expiry hook. Set by the app shell so the API layer can trigger a
// redirect to the login page without a circular import (api -> store -> api).
let authExpiredHandler: (() => void) | null = null

export function onAuthExpired(handler: (() => void) | null) {
  authExpiredHandler = handler
}

// The auth store sets this immediately after service login so the first API
// request uses the newly-issued token before Windows Credential Manager is
// queried again.
let inMemoryToken: string | null = null

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

export function setAuthToken(token: string | null) {
  inMemoryToken = token
}

export function isAuthenticationFailure(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403)
}

async function getAuthToken(): Promise<string> {
  if (inMemoryToken) return inMemoryToken
  return (await loadAuthState()).token
}

function isAuthError(status: number, detail: string): boolean {
  if (status === 401) return true
  // FastAPI's OAuth2PasswordBearer returns 403 "Not authenticated" when no
  // Authorization header is sent at all (token missing from keyring).
  if (status === 403 && /not authenticated/i.test(detail)) return true
  return false
}

// ─── Case conversion ───
function toSnake(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toSnake)
  if (obj && typeof obj === 'object') {
    const out: any = {}
    for (const key of Object.keys(obj)) {
      const snake = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
      out[snake] = toSnake(obj[key])
    }
    return out
  }
  return obj
}

// The backend (SQLite) stores naive UTC datetimes and FastAPI serialises them
// without a timezone suffix (e.g. "2026-07-14T09:31:15.234932"). JavaScript's
// Date constructor treats such strings as local time, which makes every
// timestamp display offset by the user's timezone. Normalise by appending "Z"
// so the value is correctly interpreted as UTC.
const NAIVE_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/

function normalizeDatetime(value: string): string {
  if (typeof value === 'string' && NAIVE_DATETIME_RE.test(value)) {
    return value + 'Z'
  }
  return value
}

const DATETIME_KEYS = /^(created_at|updated_at|done_at|start_at|due|snapshot_at|generated_at)$/

function toCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamel)
  if (obj && typeof obj === 'object') {
    const out: any = {}
    for (const key of Object.keys(obj)) {
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      let value = toCamel(obj[key])
      // Server datetimes are naive UTC; tag them so the UI interprets correctly.
      if (DATETIME_KEYS.test(key) && typeof value === 'string') {
        value = normalizeDatetime(value)
      }
      out[camel] = value
    }
    return out
  }
  return obj
}

function formatApiError(err: any): string {
  const detail = err?.detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0]
    const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : ''
    const message = typeof first?.msg === 'string' ? first.msg : ''

    if (field === 'password' && message.includes('at least')) {
      const minLengthMatch = message.match(/at least (\d+)/)
      const minLength = minLengthMatch?.[1]
      return minLength ? `密码至少需要 ${minLength} 个字符` : '密码长度不符合要求'
    }

    if (field === 'username' && message.includes('at least')) {
      return '用户名至少需要 2 个字符'
    }

    return message || '请求参数不正确'
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  return err?.message || '请求失败'
}

// ─── HTTP helpers ───
async function request(method: string, path: string, body?: any, extraHeaders: Record<string, string> = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
  const token = await getAuthToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(buildApiUrl(API_BASE, path), {
      method,
      headers,
      body: body ? JSON.stringify(toSnake(body)) : undefined,
    })
  } catch (err) {
    // Log method + path so frontend.log identifies the failed API call.
    appLogger.warn('[api] network error', { method, path, err: err as Error })
    throw new Error(networkFailureMessage())
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const detail = typeof err?.detail === 'string' ? err.detail : ''
    // A 401 on the login/register endpoints is a wrong-credentials error, not
    // a session-expiry event -- don't trigger the auth-expired redirect.
    const isAuthEndpoint = path.startsWith('/api/auth/login') || path.startsWith('/api/auth/register')
    if (!isAuthEndpoint && isAuthError(res.status, detail) && authExpiredHandler) {
      authExpiredHandler()
    }
    // Keep non-auth API failures in frontend.log with the service detail.
    if (res.status !== 401) {
      appLogger.warn('[api] non-OK response', { method, path, status: res.status, detail })
    }
    throw new ApiRequestError(formatApiError(err) || res.statusText, res.status)
  }
  const data = await res.json()
  return toCamel(data)
}

async function attachmentRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  const token = await getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(buildApiUrl(API_BASE, path), { ...options, headers })
  } catch (err) {
    appLogger.warn('[api] attachment network error', { path, err: err as Error })
    throw new Error(networkFailureMessage())
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const detail = typeof error?.detail === 'string' ? error.detail : ''
    if (isAuthError(response.status, detail) && authExpiredHandler) {
      authExpiredHandler()
    }
    throw new ApiRequestError(formatApiError(error) || response.statusText, response.status)
  }
  return response
}

// ─── Auth API ───
export async function register(username: string, password: string) {
  return request('POST', '/api/auth/register', { username, password })
}

export async function login(username: string, password: string): Promise<{ accessToken: string }> {
  return request('POST', '/api/auth/login', { username, password })
}

export async function getMe(): Promise<{ id: number; username: string; createdAt: string }> {
  return request('GET', '/api/auth/me')
}

// ─── Task API ───
export async function listTasks(includeDeleted = false, includeSubtasks = true): Promise<Task[]> {
  const params = new URLSearchParams()
  if (includeDeleted) params.set('include_deleted', 'true')
  if (includeSubtasks) params.set('include_subtasks', 'true')
  const qs = params.toString()
  return request('GET', `/api/tasks${qs ? `?${qs}` : ''}`)
}

export async function createTask(task: Partial<Task> & { clientId: string }): Promise<Task> {
  return request('POST', '/api/tasks', task)
}

export async function getTask(taskId: number): Promise<Task> {
  return request('GET', `/api/tasks/${taskId}`)
}

export async function updateTask(taskId: number, updates: Partial<Task>): Promise<Task> {
  return request('PATCH', `/api/tasks/${taskId}`, updates)
}

export async function deleteTask(taskId: number): Promise<void> {
  await request('DELETE', `/api/tasks/${taskId}`)
}

// P6-3: transfer a task to a teammate. The task's user_id flips to the
// recipient, so it disappears from the sender's list and appears in the
// recipient's. previous_owner_id + transfer_note are recorded server-side.
export async function transferTask(taskId: number, toUserId: number, note: string = ''): Promise<void> {
  await request('POST', `/api/tasks/${taskId}/transfer`, { to_user_id: toUserId, note })
}

export async function reorderTasks(items: { clientId: string; sortOrder: number }[]): Promise<void> {
  return request('POST', '/api/tasks/reorder', { items })
}

export async function listTaskAttachments(taskId: number): Promise<TaskAttachment[]> {
  const response = await attachmentRequest(`/api/tasks/${taskId}/attachments`)
  return toCamel(await response.json())
}

export async function uploadTaskAttachment(taskId: number, file: File): Promise<TaskAttachment> {
  const body = new FormData()
  body.append('file', file)
  const response = await attachmentRequest(`/api/tasks/${taskId}/attachments`, {
    method: 'POST',
    body,
  })
  return toCamel(await response.json())
}

export async function downloadTaskAttachment(taskId: number, attachmentId: string): Promise<Blob> {
  const response = await attachmentRequest(`/api/tasks/${taskId}/attachments/${encodeURIComponent(attachmentId)}`)
  return response.blob()
}

export async function deleteTaskAttachment(taskId: number, attachmentId: string): Promise<void> {
  await attachmentRequest(`/api/tasks/${taskId}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
  })
}

// ─── Task comments （留言， P2-5) ───
export interface TaskComment {
  id: number
  taskId: number
  author: string
  content: string
  createdAt: string
  // P6-2: snapshot of the commenter's team role at post time ('' for
  // non-team members or legacy comments - frontend renders no badge).
  role?: string
}

export async function listTaskComments(taskId: number): Promise<TaskComment[]> {
  return request('GET', `/api/tasks/${taskId}/comments`)
}

export async function createTaskComment(taskId: number, content: string): Promise<TaskComment> {
  return request('POST', `/api/tasks/${taskId}/comments`, { content })
}

export async function deleteTaskComment(taskId: number, commentId: number): Promise<void> {
  return request('DELETE', `/api/tasks/${taskId}/comments/${commentId}`)
}

// ─── Requirements （需求池， P2-4) ───
export interface Requirement {
  id: number
  title: string
  content: string
  status: string
  priority: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  // P5-2: cached counts filled by the backend so the list view can render
  // bug / linked-task badges without extra queries.
  bugCount?: number
  linkedTaskCount?: number
}

export interface RequirementInput {
  title?: string
  content?: string
  status?: string
  priority?: string
}

export async function listRequirements(): Promise<Requirement[]> {
  return request('GET', '/api/requirements')
}

export async function createRequirement(input: RequirementInput): Promise<Requirement> {
  return request('POST', '/api/requirements', input)
}

export async function updateRequirement(id: number, input: RequirementInput): Promise<Requirement> {
  return request('PATCH', `/api/requirements/${id}`, input)
}

export async function deleteRequirement(id: number): Promise<void> {
  return request('DELETE', `/api/requirements/${id}`)
}

export async function listRequirementAttachments(requirementId: number): Promise<TaskAttachment[]> {
  const response = await attachmentRequest(`/api/requirements/${requirementId}/attachments`)
  return toCamel(await response.json())
}

export async function uploadRequirementAttachment(requirementId: number, file: File): Promise<TaskAttachment> {
  const body = new FormData()
  body.append('file', file)
  const response = await attachmentRequest(`/api/requirements/${requirementId}/attachments`, {
    method: 'POST',
    body,
  })
  return toCamel(await response.json())
}

export async function downloadRequirementAttachment(requirementId: number, attachmentId: string): Promise<Blob> {
  const response = await attachmentRequest(`/api/requirements/${requirementId}/attachments/${encodeURIComponent(attachmentId)}`)
  return response.blob()
}

export async function deleteRequirementAttachment(requirementId: number, attachmentId: string): Promise<void> {
  await attachmentRequest(`/api/requirements/${requirementId}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
  })
}

// ─── Task PRD attachments (P5-4) ───
// PRD documents live under /api/tasks/<id>/prd-attachments, physically separate
// from the task's generic "资料附件" so PRD semantics stay distinct.
export async function listTaskPrdAttachments(taskId: number): Promise<TaskAttachment[]> {
  const response = await attachmentRequest(`/api/tasks/${taskId}/prd-attachments`)
  return toCamel(await response.json())
}

export async function uploadTaskPrdAttachment(taskId: number, file: File): Promise<TaskAttachment> {
  const body = new FormData()
  body.append('file', file)
  const response = await attachmentRequest(`/api/tasks/${taskId}/prd-attachments`, {
    method: 'POST',
    body,
  })
  return toCamel(await response.json())
}

export async function downloadTaskPrdAttachment(taskId: number, attachmentId: string): Promise<Blob> {
  const response = await attachmentRequest(`/api/tasks/${taskId}/prd-attachments/${encodeURIComponent(attachmentId)}`)
  return response.blob()
}

export async function deleteTaskPrdAttachment(taskId: number, attachmentId: string): Promise<void> {
  await attachmentRequest(`/api/tasks/${taskId}/prd-attachments/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
  })
}

// ─── Requirement <-> Task link (P5-2) ───
// Reverse lookup: which tasks are linked to a given requirement (typically bugs).
export async function listRequirementTasks(requirementId: number): Promise<Task[]> {
  return request('GET', `/api/requirements/${requirementId}/tasks`)
}

// ─── Markdown export / report API ───
export interface MarkdownFile {
  taskId: number
  title: string
  status: string
  owner: string
  snapshotReason: string
  snapshotAt: string
  markdown: string
  exportPath: string
}

export interface MarkdownFilesResponse {
  period: string
  anchor: string
  label: string
  start: string
  end: string
  files: MarkdownFile[]
}

export interface TaskMarkdownExport {
  taskId: number
  title: string
  status: string
  owner: string
  updatedAt: string
  markdown: string
  exportPath: string
}

export interface ReportExportRequest {
  period: 'daily' | 'weekly' | 'monthly'
  anchor: string
  regenerate?: boolean
}

export interface ReportExportResponse {
  period: string
  anchor: string
  label: string
  reportFilename: string
  generatedAt: string
  taskCount: number
  reportText: string
  regenerated: boolean
}

export async function getTaskMarkdownExport(taskId: number): Promise<TaskMarkdownExport> {
  return request('GET', `/api/tasks/${taskId}/markdown-export`)
}

export async function getReportMarkdownFiles(
  period: 'daily' | 'weekly' | 'monthly',
  anchor?: string,
  offset = 0,
): Promise<MarkdownFilesResponse> {
  const params = new URLSearchParams({ period })
  if (anchor) params.set('anchor', anchor)
  if (offset) params.set('offset', String(offset))
  return request('GET', `/api/reports/markdown-files?${params.toString()}`)
}

export async function exportReport(req: ReportExportRequest): Promise<ReportExportResponse> {
  return request('POST', '/api/reports/markdown-export', req)
}

// ─── Team （团队协作， P6-1/2/3) ───
// Single global team (app-layer enforced server-side). Members are invited by
// username; each has one role: 开发 / 管理 / 测试.
export type TeamRole = '开发' | '管理' | '测试'

export interface TeamMember {
  userId: number
  username: string
  role: string
  joinedAt: string
}

export interface Team {
  id: number
  name: string
  creatorId: number
  createdAt: string
  members: TeamMember[]
}

export async function getTeam(): Promise<Team | null> {
  // 404 means no team yet - return null instead of throwing so the caller can
  // render a "create team" form.
  try {
    return await request('GET', '/api/teams')
  } catch (err: any) {
    if (err?.status === 404) return null
    throw err
  }
}

export async function createTeam(name: string): Promise<Team> {
  return request('POST', '/api/teams', { name })
}

export async function updateTeam(name: string): Promise<Team> {
  return request('PATCH', '/api/teams', { name })
}

export async function dissolveTeam(): Promise<void> {
  await request('DELETE', '/api/teams')
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  return request('GET', '/api/teams/members')
}

export async function inviteTeamMember(username: string, role: string): Promise<TeamMember> {
  return request('POST', '/api/teams/members', { username, role })
}

export async function updateTeamMemberRole(userId: number, role: string): Promise<void> {
  await request('PATCH', `/api/teams/members/${userId}`, { role })
}

export async function removeTeamMember(userId: number): Promise<void> {
  await request('DELETE', `/api/teams/members/${userId}`)
}

export interface MemberTasksFilters {
  quadrant?: number
  status?: string
  category?: string
  includeSubtasks?: boolean
}

// Read-only listing of a teammate's tasks. Non-teammates get 403 server-side.
export async function listMemberTasks(userId: number, filters: MemberTasksFilters = {}): Promise<Task[]> {
  const params = new URLSearchParams()
  if (filters.quadrant) params.set('quadrant', String(filters.quadrant))
  if (filters.status) params.set('status', filters.status)
  if (filters.category) params.set('category', filters.category)
  if (filters.includeSubtasks) params.set('include_subtasks', 'true')
  const qs = params.toString()
  return request('GET', `/api/teams/members/${userId}/tasks${qs ? `?${qs}` : ''}`)
}
