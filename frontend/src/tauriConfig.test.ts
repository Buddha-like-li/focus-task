import { describe, expect, it } from 'vitest'
import tauriConfig from '../src-tauri/tauri.conf.json'

describe('Tauri development endpoint', () => {
  it('uses the same IPv4 loopback host as Vite and permits its HMR socket', () => {
    expect(tauriConfig.build.devUrl).toBe('http://127.0.0.1:1420')
    expect(tauriConfig.app.security.csp).toContain('http://127.0.0.1:1420')
    expect(tauriConfig.app.security.csp).toContain('ws://127.0.0.1:1420')
    expect(tauriConfig.app.security.csp).not.toContain('localhost:1420')
  })
})
