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
        <div class="form-item">
          <label>用户名</label>
          <input v-model="form.username" type="text" placeholder="输入用户名" class="form-input" />
        </div>
        <div class="form-item">
          <label>密码</label>
          <input v-model="form.password" type="password" placeholder="输入密码" class="form-input" />
        </div>
        <label class="remember-row">
          <input v-model="rememberUsername" type="checkbox" class="remember-checkbox" />
          <span>记住用户名</span>
        </label>
        <button type="submit" class="form-btn" :disabled="loading">
          {{ loading ? '处理中…' : isRegister ? '注册' : '登录' }}
        </button>
        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        <p class="switch-mode" @click="isRegister = !isRegister">
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { clearRememberedUsername, loadRememberedUsername, saveRememberedUsername } from '@/utils/secureStorage'

const router = useRouter()
const auth = useAuthStore()
const loginPageEl = ref<HTMLElement | null>(null)

const isRegister = ref(false)
const loading = ref(false)
const errorMsg = ref('')
const rememberUsername = ref(true)
const form = reactive({ username: '', password: '' })

async function handleSubmit() {
  errorMsg.value = ''
  if (!form.username || !form.password) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  if (form.username.trim().length < 2) {
    errorMsg.value = '用户名至少需要 2 个字符'
    return
  }
  if (isRegister.value && form.password.length < 8) {
    errorMsg.value = '密码至少需要 8 个字符'
    return
  }
  loading.value = true
  try {
    if (isRegister.value) {
      await auth.register(form.username, form.password)
    } else {
      await auth.login(form.username, form.password)
    }
    if (rememberUsername.value) {
      saveRememberedUsername(form.username.trim())
    } else {
      clearRememberedUsername()
    }
    router.push('/')
  } catch (e: any) {
    errorMsg.value = e?.message || '操作失败'
  } finally {
    loading.value = false
  }
}

// ─── Window Dragging for Login Page ───
let loginAppWindow: any = null

onMounted(async () => {
  const rememberedUsername = loadRememberedUsername()
  if (rememberedUsername) {
    form.username = rememberedUsername
    rememberUsername.value = true
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    loginAppWindow = getCurrentWindow()
  } catch {
    loginAppWindow = null
  }

  const page = loginPageEl.value
  if (!page || !loginAppWindow) return

  page.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.buttons !== 1) return
    const t = e.target as HTMLElement
    if (t.closest('.login-card')) return
    loginAppWindow.startDragging()
  })
})

onUnmounted(() => {})
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
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
.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 14px;
  font-size: 13px;
  color: oklch(44% 0.014 240);
  user-select: none;
}
.remember-checkbox {
  width: 15px;
  height: 15px;
  accent-color: oklch(56% 0.12 205);
}
.error-msg {
  color: oklch(55% 0.15 25);
  font-size: 13px;
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
