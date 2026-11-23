import { ref, watch } from 'vue'
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
  let guideGeneration = 0
  let pendingAck: { epoch: number; owner: string; version: number; key: string } | null = null
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
  function clearGuide() {
    guideGeneration++
    checked = ''
    pendingAck = null
    guide.value = null
    guideVisible.value = false
    busy.value = false
    error.value = ''
  }
  function clear() {
    cancelLogin()
    clearGuide()
  }
  // 登录会更换会话，但不能取消等待登录完成的页面续接动作。
  watch(() => session.getEpoch(), clearGuide, { flush: 'sync' })
  async function showGuide(force = false) {
    const user = useUserStore()
    const owner = user.user?.id
    const epoch = session.getEpoch()
    if (!owner || !user.validated || busy.value) return
    const key = `${epoch}:${owner}`
    if (!force && (checked === key || user.user?.verification !== 'verified')) return
    const generation = guideGeneration
    const active = () =>
      generation === guideGeneration && epoch === session.getEpoch() && owner === user.user?.id
    busy.value = true
    error.value = ''
    try {
      const result = await getModuleGuide()
      if (!active()) return
      if (
        pendingAck?.epoch === epoch &&
        pendingAck.owner === owner &&
        result.acknowledged_version >= pendingAck.version
      )
        pendingAck = null
      checked = key
      guide.value = result
      guideVisible.value =
        result.version > 0 && (force || result.acknowledged_version < result.version)
      if (force && !result.version)
        uni.$emit?.('app:notice', { message: '使用说明正在准备中', kind: 'info' })
    } catch {
      if (force && active()) {
        error.value = '使用说明读取失败，请稍后重试。'
        uni.$emit?.('app:notice', { message: error.value, kind: 'error' })
      }
    } finally {
      if (generation === guideGeneration) busy.value = false
    }
  }
  async function confirmGuide() {
    if (!guide.value || busy.value) return
    const epoch = session.getEpoch()
    const owner = useUserStore().user?.id
    if (!owner) return
    const generation = guideGeneration
    const active = () =>
      generation === guideGeneration &&
      epoch === session.getEpoch() &&
      owner === useUserStore().user?.id
    // 结果未知时保留原版本和幂等键，直到确认回执或收到明确拒绝。
    if (!pendingAck || pendingAck.epoch !== epoch || pendingAck.owner !== owner)
      pendingAck = {
        epoch,
        owner,
        version: guide.value.version,
        key: `guide-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }
    const command = pendingAck
    busy.value = true
    error.value = ''
    let reload = false
    try {
      const result = await acknowledgeGuide(command.version, command.key)
      if (!active()) return
      if (pendingAck === command) pendingAck = null
      guide.value = result
      guideVisible.value = result.acknowledged_version < result.version
    } catch (failure) {
      if (active()) {
        reload = failure instanceof RequestError && failure.statusCode === 409
        const rejected =
          failure instanceof RequestError &&
          failure.statusCode >= 400 &&
          failure.statusCode < 500 &&
          failure.statusCode !== 408 &&
          failure.statusCode !== 429
        if (rejected && pendingAck === command) pendingAck = null
        error.value = reload
          ? '使用说明已更新，请阅读后重新确认。'
          : rejected
            ? '确认未完成，请重试。'
            : '确认结果尚未确认，请使用原请求重试。'
      }
    } finally {
      if (generation === guideGeneration) busy.value = false
    }
    if (reload && active()) await showGuide(true)
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
