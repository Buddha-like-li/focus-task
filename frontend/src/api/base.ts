export const LOCAL_SERVICE_API_BASE = 'http://127.0.0.1:18765'

/**
 * The Windows client always calls the local service. Endpoint callers own the
 * /api prefix, so this module only exposes the fixed service origin.
 */
export function resolveApiBase(): string {
  return LOCAL_SERVICE_API_BASE
}

export function buildApiUrl(apiBase: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBase}${normalizedPath}`
}

export function networkFailureMessage(): string {
  return `无法连接 Focus Task 本地服务（${LOCAL_SERVICE_API_BASE}）。请确认 Focus Task 服务容器正在运行后重试。`
}
