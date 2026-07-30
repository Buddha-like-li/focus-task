<template>
  <div class="login-page" ref="loginPageEl">
    <div class="login-orbit orbit-a"></div>
    <div class="login-orbit orbit-b"></div>
    <div class="login-grid"></div>
    <div class="login-card">
      <div class="login-mark">
        <span class="mark-cell q1"></span>
        <span class="mark-cell q2"></span>
        <span class="mark-cell q3"></span>
        <span class="mark-cell q4"></span>
      </div>
      <h1 class="login-title">Focus Task</h1>
      <p class="login-subtitle">把重要的事放回桌面中央</p>
      <form class="login-form" @submit.prevent="handleSubmit">
        <div class="form-item account-field" ref="accountFieldEl">
          <label for="login-username">用户名</label>
          <input
            id="login-username"
            ref="usernameInputEl"
            v-model="form.username"
            type="text"
            autocomplete="username"
            placeholder="输入用户名"
            class="form-input"
            :aria-expanded="showAccountMenu"
            aria-controls="remembered-account-list"
            @focus="openAccountMenu"
            @input="openAccountMenu"
            @keydown.esc="showAccountMenu = false"
          />
          <div
            v-if="showAccountMenu && filteredAccounts.length"
            id="remembered-account-list"
            class="account-menu"
            role="listbox"
            aria-label="已记住的账号"
          >
            <p class="account-menu-title">已记住的账号</p>
            <button
              v-for="account in filteredAccounts"
              :key="account.username"
              type="button"
              class="account-option"
              :disabled="loading"
              role="option"
              :aria-selected="form.username.trim() === account.username"
              @mousedown.prevent
              @click="selectAccount(account)"
            >
              <span class="account-option-name">{{ account.username }}</span>
              <span class="account-option-status">{{ account.hasSession ? '可直接登录' : '需要重新输入密码' }}</span>
            </button>
          </div>
        </div>
        <div class="form-item">
          <label for="login-password">密码</label>
          <input
            id="login-password"
            ref="passwordInputEl"
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            placeholder="输入密码"
            class="form-input"
          />
        </div>
        <button type="submit" class="form-btn" :disabled="loading">
          {{ loading ? '处理中…' : isRegister ? '注册' : '登录' }}
        </button>
        <p v-if="displayedError" class="error-msg" role="alert">{{ displayedError }}</p>
        <p v-else-if="auth.sessionWarning" class="session-warning" role="status">{{ auth.sessionWarning }}</p>
        <p class="switch-mode" @click="toggleMode">
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import type { AuthAccount } from '@/utils/secureStorage'

const router = useRouter()
const auth = useAuthStore()
const loginPageEl = ref<HTMLElement | null>(null)
const accountFieldEl = ref<HTMLElement | null>(null)
const usernameInputEl = ref<HTMLInputElement | null>(null)
const passwordInputEl = ref<HTMLInputElement | null>(null)

const isRegister = ref(false)
const loading = ref(false)
const errorMsg = ref('')
const showAccountMenu = ref(false)
const form = reactive({ username: '', password: '' })
const displayedError = computed(() => errorMsg.value || auth.restoreError)
const filteredAccounts = computed(() => {
  const query = form.username.trim().toLocaleLowerCase()
  return auth.rememberedAccounts.filter(account => (
    !query || account.username.toLocaleLowerCase().includes(query)
  ))
})

function openAccountMenu() {
  showAccountMenu.value = true
}

function toggleMode() {
  isRegister.value = !isRegister.value
  errorMsg.value = ''
  showAccountMenu.value = false
}

async function handleSubmit() {
  errorMsg.value = ''
  auth.clearRestoreError()
  const normalizedUsername = form.username.trim()
  if (!normalizedUsername || !form.password) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  if (normalizedUsername.length < 2) {
    errorMsg.value = '用户名至少需要 2 个字符'
    return
  }
  if (isRegister.value && form.password.length < 8) {
    errorMsg.value = '密码至少需要 8 个字符'
    return
  }

  loading.value = true
  try {
    form.username = normalizedUsername
    if (isRegister.value) {
      await auth.register(normalizedUsername, form.password)
    } else {
      await auth.login(normalizedUsername, form.password)
    }
    // Passwords are only used for this request and never need to remain in
    // reactive form state after an authenticated session has been established.
    form.password = ''
    await router.replace('/')
  } catch (error: unknown) {
    errorMsg.value = error instanceof Error ? error.message : '操作失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function selectAccount(account: AuthAccount) {
  form.username = account.username
  form.password = ''
  errorMsg.value = ''
  auth.clearRestoreError()
  showAccountMenu.value = false

  if (!account.hasSession) {
    errorMsg.value = '此账号需要重新输入密码。'
    await nextTick()
    passwordInputEl.value?.focus()
    return
  }

  loading.value = true
  try {
    const restored = await auth.restoreAccount(account.username)
    if (restored) {
      await router.replace('/')
      return
    }

    // A 401 removes only this account's saved session in authStore. Keep its
    // username in place so the person only has to type the password again.
    form.username = auth.loginUsernameHint || account.username
    errorMsg.value = '登录状态已失效，请输入密码重新登录。'
    await nextTick()
    passwordInputEl.value?.focus()
  } catch (error: unknown) {
    errorMsg.value = error instanceof Error ? error.message : '恢复账号失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (accountFieldEl.value?.contains(event.target as Node)) return
  showAccountMenu.value = false
}

// ─── Window Dragging for Login Page ───
let loginAppWindow: { startDragging: () => void } | null = null

onMounted(async () => {
  form.username = auth.loginUsernameHint
  await auth.refreshRememberedAccounts().catch(() => undefined)

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    loginAppWindow = getCurrentWindow()
  } catch {
    loginAppWindow = null
  }

  const page = loginPageEl.value
  if (page && loginAppWindow) {
    page.addEventListener('mousedown', (event: MouseEvent) => {
      if (event.buttons !== 1) return
      const target = event.target as HTMLElement
      if (target.closest('.login-card')) return
      loginAppWindow?.startDragging()
    })
  }
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  position: relative;
  /* 小窗口下登录卡会超过可视高度：横向裁掉装饰，纵向允许滚动。 */
  overflow: hidden auto;
  padding: 16px 0;
  background:
    radial-gradient(circle at 12% 18%, oklch(96% 0.025 25) 0, transparent 24%),
    radial-gradient(circle at 84% 16%, oklch(96% 0.03 145) 0, transparent 28%),
    radial-gradient(circle at 80% 82%, oklch(96% 0.024 240) 0, transparent 24%),
    linear-gradient(180deg, oklch(98.8% 0.004 240), oklch(96.8% 0.006 240));
  -webkit-user-select: none;
  user-select: none;
}
.login-orbit {
  position: absolute;
  border-radius: 999px;
  filter: blur(20px);
  opacity: 0.45;
  pointer-events: none;
}
.orbit-a {
  width: 280px;
  height: 280px;
  top: -80px;
  right: -40px;
  background: oklch(86% 0.05 145 / 0.55);
}
.orbit-b {
  width: 220px;
  height: 220px;
  left: -40px;
  bottom: -50px;
  background: oklch(88% 0.05 240 / 0.5);
}
.login-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, oklch(88% 0.006 240 / 0.4) 1px, transparent 1px),
    linear-gradient(to bottom, oklch(88% 0.006 240 / 0.4) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: linear-gradient(180deg, transparent, black 20%, black 80%, transparent);
  pointer-events: none;
}
.login-card {
  width: 390px;
  /* margin:auto 在 flex 容器中双向居中，内容超高时自然可滚动。 */
  margin: auto;
  padding: 36px 34px 32px;
  background: oklch(100% 0 0 / 0.84);
  border-radius: 18px;
  border: 1px solid oklch(88% 0.008 240 / 0.9);
  box-shadow: 0 28px 60px oklch(0 0 0 / 0.08);
  backdrop-filter: blur(18px);
  -webkit-user-select: auto;
  user-select: auto;
  position: relative;
  z-index: 1;
}
.login-mark {
  width: 38px;
  height: 38px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  margin-bottom: 18px;
}
.mark-cell {
  border-radius: 7px;
  display: block;
}
.mark-cell.q1 { background: oklch(62% 0.14 4); }
.mark-cell.q2 { background: oklch(54% 0.13 138); }
.mark-cell.q3 { background: oklch(56% 0.12 205); }
.mark-cell.q4 { background: oklch(70% 0.02 240); }
.login-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 18px;
  box-shadow: inset 0 1px 0 oklch(100% 0 0 / 0.9);
  pointer-events: none;
}
.login-title {
  font-family: 'DM Serif Display', serif;
  font-size: 32px;
  text-align: left;
  color: oklch(18% 0.01 240);
  letter-spacing: -0.5px;
}
.login-subtitle {
  text-align: left;
  color: oklch(46% 0.012 240);
  font-size: 13px;
  margin: 8px 0 24px;
  line-height: 1.5;
}
.form-item {
  margin-bottom: 16px;
}
.form-item label {
  display: block;
  font-size: 13px;
  color: oklch(46% 0.015 240);
  margin-bottom: 6px;
}
.account-field {
  position: relative;
  z-index: 3;
}
.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid oklch(85% 0.01 240);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.form-input:focus {
  border-color: oklch(56% 0.12 205);
}
.account-menu {
  position: absolute;
  z-index: 5;
  top: calc(100% - 10px);
  left: 0;
  right: 0;
  max-height: 190px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid oklch(85% 0.01 240);
  border-radius: 8px;
  background: oklch(100% 0 0 / 0.98);
  box-shadow: 0 12px 28px oklch(0 0 0 / 0.12);
}
.account-menu-title {
  margin: 4px 7px 6px;
  color: oklch(46% 0.015 240);
  font-size: 12px;
}
.account-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: oklch(22% 0.012 240);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.account-option:hover:not(:disabled),
.account-option:focus-visible {
  background: oklch(95% 0.015 240);
  outline: none;
}
.account-option:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.account-option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-option-status {
  flex: 0 0 auto;
  color: oklch(50% 0.025 240);
  font-size: 11px;
}
.form-btn {
  width: 100%;
  padding: 11px;
  background: linear-gradient(135deg, oklch(56% 0.12 205), oklch(52% 0.12 240));
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
.form-btn:hover { opacity: 0.9; }
.form-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.error-msg {
  color: oklch(55% 0.15 25);
  font-size: 13px;
  text-align: center;
  margin-top: 8px;
}
.session-warning {
  color: oklch(50% 0.11 70);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  margin-top: 8px;
}
.switch-mode {
  text-align: center;
  font-size: 13px;
  color: oklch(46% 0.015 240);
  cursor: pointer;
  margin-top: 12px;
}
.switch-mode:hover { text-decoration: underline; }
</style>
