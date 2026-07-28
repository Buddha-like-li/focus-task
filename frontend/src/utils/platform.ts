/**
 * Platform detection helpers.
 *
 * The Windows client runs in a Tauri webview and talks directly to the local
 * Focus Task service. Browser mode exists only for development and has
 * no native shell, keyring, notification, or folder-opening commands.
 */

function hasWindow(name: string): boolean {
  return typeof window !== 'undefined' && name in window
}

/** True when running inside the Tauri desktop webview. */
export function isTauriRuntime(): boolean {
  return hasWindow('__TAURI_INTERNALS__') || hasWindow('__TAURI__')
}
