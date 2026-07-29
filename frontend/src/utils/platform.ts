/**
 * Platform detection helpers.
 *
 * The Windows client runs in a Tauri webview and talks directly to the local
 * Focus Task service. Browser mode exists only for development and has
 * no native shell, keyring, notification, or folder-opening commands.
 */
import { isTauri } from '@tauri-apps/api/core'

/** True when running inside the Tauri desktop webview. */
export function isTauriRuntime(): boolean {
  return isTauri()
}
