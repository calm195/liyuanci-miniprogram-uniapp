import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getModuleGuide, acknowledgeGuide } from '@/api/module-guide'
import type { ModuleGuide } from '@/api/module-guide'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { useUserStore } from '@/stores/user'
export const useEntryStore = defineStore('entry', () => {
  const loginVisible = ref(false)
  const guideVisible = ref(false)
  const guide = ref<ModuleGuide | null>(null)
  const busy = ref(false)
  const error = ref('')
  let checked = ''
  let continuation: {
    run: () => void | Promise<void>
    active: () => boolean
    owner?: string
  } | null = null
  function openLogin(run?: () => void | Promise<void>, active: () => boolean = () => true) {
    continuation = run ? { run, active, owner: useUserStore().user?.id } : null
    loginVisible.value = true
    error.value = ''
  }
  function cancelLogin() {
    continuation = null
    loginVisible.value = false
  }
  async function completeLogin() {
    const user = useUserStore()
    if (!user.validated || !user.user) return false
    const next = continuation
    continuation = null
    loginVisible.value = false
    // 续接动作自行读取目标资格，完成后再刷新页面，避免两次读取竞争同一 busy 门禁。
    if (next && next.active() && (!next.owner || next.owner === user.user.id)) {
      try {
        await next.run()
      } finally {
        uni.$emit?.('auth:ready')
      }
      return true
    }
    uni.$emit?.('auth:ready')
    return false
  }
  function clear() {
    cancelLogin()
    checked = ''
    guide.value = null
    guideVisible.value = false
    loginVisible.value = false
    error.value = ''
  }
  async function showGuide(force = false) {
    const user = useUserStore()
    const owner = user.user?.id
    const epoch = session.getEpoch()
    if (!owner || !user.validated || busy.value) return
    const key = `${epoch}:${owner}`
    if (!force && (checked === key || user.user?.verification !== 'verified')) return
    busy.value = true
    error.value = ''
    try {
      const result = await getModuleGuide()
      if (epoch !== session.getEpoch() || owner !== user.user?.id) return
      checked = key
      guide.value = result
      guideVisible.value =
        result.version > 0 && (force || result.acknowledged_version < result.version)
      if (force && !result.version)
        uni.$emit?.('app:notice', { message: '使用说明正在准备中', kind: 'info' })
    } catch {
      if (force && epoch === session.getEpoch()) {
        error.value = '使用说明读取失败，请稍后重试。'
        uni.$emit?.('app:notice', { message: error.value, kind: 'error' })
      }
    } finally {
      busy.value = false
    }
  }
  async function confirmGuide() {
    if (!guide.value || busy.value) return
    const epoch = session.getEpoch()
    busy.value = true
    let reload = false
    try {
      const result = await acknowledgeGuide(guide.value.version)
      if (epoch !== session.getEpoch()) return
      guide.value = result
      guideVisible.value = result.acknowledged_version < result.version
    } catch (failure) {
      if (epoch === session.getEpoch()) {
        reload = failure instanceof RequestError && failure.statusCode === 409
        error.value = reload ? '使用说明已更新，请阅读后重新确认。' : '确认未完成，请重试。'
      }
    } finally {
      busy.value = false
    }
    if (reload && epoch === session.getEpoch()) await showGuide(true)
  }
  return {
    loginVisible,
    guideVisible,
    guide,
    busy,
    error,
    openLogin,
    cancelLogin,
    completeLogin,
    showGuide,
    confirmGuide,
    clear,
  }
})
