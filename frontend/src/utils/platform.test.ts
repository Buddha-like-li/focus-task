import { afterEach, describe, expect, it } from 'vitest'
import { isTauriRuntime } from './platform'

const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'isTauri')

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(globalThis, 'isTauri', originalDescriptor)
  } else {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri
  }
})

describe('桌面端运行时识别', () => {
  it('识别 Tauri 官方注入的 isTauri 标记', () => {
    Object.defineProperty(globalThis, 'isTauri', {
      configurable: true,
      value: true,
    })

    expect(isTauriRuntime()).toBe(true)
  })

  it('在浏览器开发环境中返回 false', () => {
    Object.defineProperty(globalThis, 'isTauri', {
      configurable: true,
      value: false,
    })

    expect(isTauriRuntime()).toBe(false)
  })
})
