import { describe, expect, it } from 'vitest'
import {
  LOCAL_SERVICE_API_BASE,
  buildApiUrl,
  networkFailureMessage,
  resolveApiBase,
} from './base'

describe('resolveApiBase', () => {
  it('always uses the local service and cannot be overridden by build environment', () => {
    expect(resolveApiBase()).toBe(LOCAL_SERVICE_API_BASE)
    expect(buildApiUrl(resolveApiBase(), '/api/auth/login'))
      .toBe('http://127.0.0.1:18765/api/auth/login')
  })
})

describe('networkFailureMessage', () => {
  it('points Windows users at the fixed local service', () => {
    const message = networkFailureMessage()

    expect(message).toContain('服务容器')
    expect(message).toContain('127.0.0.1:18765')
  })
})
