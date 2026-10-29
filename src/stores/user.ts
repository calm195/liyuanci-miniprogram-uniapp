import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as auth from '@/api/auth'
import { config } from '@/config'
import type { UserInfo, Verification, VerificationState } from '@/types/api'
import { session } from '@/utils/session'
import { verificationLabel } from '@/utils/access'
export const useUserStore = defineStore('user', () => {
  const user = ref<UserInfo | null>(null)
  const verification = ref<Verification | null>(null)
  const busy = ref(false)
  const validated = ref(false)
  const expired = ref(false)
  let generation = 0
  let refreshGeneration = 0
  const isLoggedIn = computed(() => !!user.value)
  const label = computed(() => verificationLabel(user.value))
  function clear() {
    generation++
    session.clear()
    user.value = null
    verification.value = null
    validated.value = false
  }
  async function refresh(includeVerification = true, silent = false) {
    if (!session.getToken() || config.useMock) return
    const current = generation
    const request = ++refreshGeneration
    const epoch = session.getEpoch()
    const active = () =>
      current === generation && request === refreshGeneration && epoch === session.getEpoch()
    if (!silent) validated.value = false
    if (!silent || includeVerification) verification.value = null
    try {
      const me = await auth.getMe()
      // 页面显示和应用恢复可能并发刷新，只接受最新一轮资格与审核资料。
      if (!active()) return
      user.value = me
      validated.value = true
      if (
        includeVerification &&
        (me.verification === 'pending' || me.verification === 'rejected')
      ) {
        const result = await auth.getVerification()
        if (active()) verification.value = result
      }
    } catch (failure) {
      if (active()) {
        validated.value = false
        throw failure
      }
    }
  }

  async function login() {
    if (busy.value) return
    busy.value = true
    const current = generation
    try {
      const code = await auth.wechatCode()
      if (current !== generation) return
      // 每次重新登录成对获取凭据；同次网络重发必须复用这两个值，不单独更换请求标识。
      const clientRequestId = `wx-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const result = await auth.login(code, clientRequestId)
      if (current !== generation) return
      session.setToken(result.token)
      user.value = result.me
      expired.value = false
      await refresh()
    } finally {
      busy.value = false
    }
  }
  async function logout() {
    if (busy.value) return
    busy.value = true
    try {
      if (session.getToken() && !config.useMock) await auth.revokeSession(`logout-${Date.now()}`)
    } finally {
      clear()
      busy.value = false
    }
  }
  function simulate(state: VerificationState) {
    if (!config.useMock) return
    clear()
    user.value = { id: 'synthetic-user', version: 1, verification: state, allowed_actions: [] }
    verification.value =
      state === 'rejected'
        ? {
            request_id: 'synthetic-request',
            version: 1,
            status: 'rejected',
            reason: '合成原因：资料无法确认',
            revision_suggestion: '合成建议：重新提交清晰资料',
          }
        : null
    validated.value = true
  }
  uni.$on('auth:expired', () => {
    clear()
    expired.value = true
  })
  return {
    user,
    verification,
    busy,
    validated,
    expired,
    isLoggedIn,
    label,
    login,
    logout,
    refresh,
    simulate,
    clearSession: clear,
  }
})
