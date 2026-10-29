import { ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { useUserStore } from '@/stores/user'
import { resourceGate } from '@/utils/resources'
export function resourceFailure(failure: unknown): string {
  if (!(failure instanceof RequestError))
    return failure instanceof Error ? failure.message : '操作未完成，请重试。'
  if (failure.statusCode === 401) return '登录已过期，请重新登录。'
  if (failure.error_code === 'VERIFICATION_REQUIRED') return '请先完成有效学生认证。'
  if (failure.statusCode === 403)
    return '账号当前受限，暂时无法访问或操作资料，可前往警告与申诉查看。'
  if (failure.statusCode === 404) return '资料已下架或当前不可访问。'
  if (failure.statusCode === 409) return '资料或反馈已变化，请核对刷新后的内容再操作。'
  if (failure.statusCode === 429) return '操作较频繁，请稍后重试。'
  if (failure.statusCode === 400 || failure.statusCode === 413 || failure.statusCode === 415)
    return '请求参数不符合要求，请重新操作。'
  if (failure.code === -2 || failure.code === -3) return '接口资料不符合约定，已停止本次操作。'
  return '请求未完成，请检查网络后重试。'
}
export function useResourcePage(clear: () => void) {
  const user = useUserStore()
  const ready = ref(false)
  const busy = ref(false)
  const error = ref('')
  const gate = ref('')
  const notice = ref('')
  let visible = false
  let generation = 0
  function ticket() {
    const g = generation,
      epoch = session.getEpoch(),
      owner = user.user?.id
    return () =>
      visible && generation === g && epoch === session.getEpoch() && owner === user.user?.id
  }
  function reset() {
    generation++
    ready.value = false
    busy.value = false
    error.value = ''
    notice.value = ''
    gate.value = ''
    clear()
  }
  async function enter(load: (active: () => boolean) => Promise<void>) {
    if (!visible) return
    reset()
    const g = generation,
      epoch = session.getEpoch()
    // 首次刷新可将 user 从 null 更新为当前主体，刷新期间只绑定会话与页面。
    const current = () => visible && g === generation && epoch === session.getEpoch()
    busy.value = true
    try {
      if (session.getToken() && !config.useMock) await user.refresh()
      if (!current()) return
      gate.value = resourceGate(user.user, user.validated, session.getToken(), config.useMock)
      if (gate.value) return
      await load(ticket())
      if (current()) ready.value = true
    } catch (failure) {
      if (current()) {
        clear()
        error.value = resourceFailure(failure)
      }
    } finally {
      if (current()) busy.value = false
    }
  }
  function fail(failure: unknown) {
    error.value = resourceFailure(failure)
    if (failure instanceof RequestError && [401, 403, 404].includes(failure.statusCode)) {
      generation++
      clear()
      ready.value = false
      busy.value = false
    }
  }
  onShow(() => {
    visible = true
    reset()
  })
  const leave = () => {
    visible = false
    reset()
  }
  onHide(leave)
  onUnload(leave)
  watch(() => session.getEpoch(), reset, { flush: 'sync' })
  watch(
    () => user.user?.id,
    (next, old) => {
      if (old && next !== old) reset()
    },
    { flush: 'sync' },
  )
  watch(
    () => user.user?.verification,
    (next, old) => {
      if (old === 'verified' && next !== old) reset()
    },
    { flush: 'sync' },
  )
  return { user, ready, busy, error, gate, notice, ticket, enter, fail }
}
