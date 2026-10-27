import { ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { RequestError } from '@/utils/request'
import { createWhisperScope } from '@/utils/whispers'
import type { WhisperInputs, WhisperOperation, WhisperOutputs } from '@/types/whispers'

export function whisperFailure(failure: unknown): string {
  if (!(failure instanceof RequestError))
    return failure instanceof Error ? failure.message : '操作未完成，请重试。'
  if (failure.statusCode === 401) return '登录已过期，请重新登录。'
  if (failure.error_code === 'VERIFICATION_REQUIRED') return '发帖需要有效学生认证，请先认证。'
  if (failure.statusCode === 403) return '当前无法执行此操作，请核对账号与内容状态。'
  if (failure.statusCode === 404) return '内容不存在或当前不可访问。'
  if (failure.error_code === 'CLIENT_UPGRADE_REQUIRED') return '请更新客户端后再操作。'
  if (['DICTIONARY_CHANGED', 'NICKNAME_NOT_READY', 'MODE_UNAVAILABLE'].includes(failure.error_code))
    return '匿名资料已变化，请刷新并重新选择展示方式。'
  if (failure.statusCode === 409) return '内容版本或状态已变化，请刷新后核对。'
  if (failure.statusCode === 429) return '操作较频繁，请稍后重试。'
  if (failure.statusCode === 503) return '服务或所需资料尚不可用，请稍后刷新。'
  if (failure.code === -2 || failure.code === -3) return '接口资料不符合约定，已停止本次操作。'
  return '操作结果尚未确认，请核对或使用原请求重试。'
}

// 页面保留在导航栈中时也必须清稿，异步结果只回填当前可见页面和当前会话。
export function useWhisperPage(clear: () => void) {
  const user = useUserStore()
  const busy = ref(false)
  const writing = ref(false)
  const error = ref('')
  const notice = ref('')
  const retryReady = ref(false)
  let visible = false
  let generation = 0
  let scope: ReturnType<typeof createWhisperScope> | null = null
  let acceptRetry: ((result: unknown) => void | Promise<void>) | null = null
  let reloadRetry: (() => Promise<void>) | undefined
  const ticket = () => {
    const current = generation
    const epoch = session.getEpoch()
    return () => visible && current === generation && epoch === session.getEpoch()
  }
  function reset() {
    generation++
    scope?.close()
    scope = null
    acceptRetry = null
    reloadRetry = undefined
    clear()
    busy.value = false
    writing.value = false
    retryReady.value = false
    error.value = ''
    notice.value = ''
  }
  async function read(task: (active: () => boolean) => Promise<void>, more = false) {
    if (!visible || busy.value || writing.value || retryReady.value) return
    generation++
    const active = ticket()
    if (!more) clear()
    error.value = ''
    busy.value = true
    try {
      if (config.useMock) throw new Error('树洞需连接真实服务，合成模式不加载业务资料。')
      await task(active)
    } catch (failure) {
      if (active()) {
        clear()
        error.value = whisperFailure(failure)
      }
    } finally {
      if (active()) busy.value = false
    }
  }
  async function execute(
    task: () => Promise<unknown>,
    accept: (result: unknown) => void | Promise<void>,
    reload?: () => Promise<void>,
  ) {
    const active = ticket()
    let refresh = false
    writing.value = true
    error.value = ''
    notice.value = ''
    try {
      const result = await task()
      if (active()) {
        await accept(result)
        acceptRetry = null
        reloadRetry = undefined
      }
    } catch (failure) {
      if (active()) {
        retryReady.value = !!scope?.pending.value
        error.value = whisperFailure(failure)
        if (!retryReady.value) {
          acceptRetry = null
          reloadRetry = undefined
        }
        refresh = failure instanceof RequestError && [403, 404, 409].includes(failure.statusCode)
        if (refresh) clear()
      }
    } finally {
      if (active()) {
        writing.value = false
        retryReady.value = !!scope?.pending.value
        if (refresh && reload) {
          const loading = reload()
          const refreshed = ticket()
          await loading
          if (refreshed()) notice.value = '状态已变化，请核对最新读取结果后再操作。'
        }
      }
    }
  }
  async function write<K extends WhisperOperation>(
    operation: K,
    input: WhisperInputs[K],
    accept: (result: WhisperOutputs[K]) => void | Promise<void>,
    reload?: () => Promise<void>,
  ) {
    if (
      !visible ||
      busy.value ||
      writing.value ||
      retryReady.value ||
      config.useMock ||
      !session.getToken()
    )
      return
    if (!scope) scope = createWhisperScope()
    acceptRetry = (result) => accept(result as WhisperOutputs[K])
    reloadRetry = reload
    await execute(() => scope!.send(operation, input), acceptRetry, reload)
  }
  async function retry() {
    if (!visible || busy.value || writing.value || !scope || !retryReady.value || !acceptRetry)
      return
    await execute(() => scope!.retry(), acceptRetry, reloadRetry)
  }
  onShow(() => {
    reset()
    visible = true
    scope = createWhisperScope()
  })
  const leave = () => {
    visible = false
    reset()
  }
  onHide(leave)
  onUnload(leave)
  watch([() => session.getEpoch(), () => user.user?.id], reset, { flush: 'sync' })
  return { busy, writing, error, notice, retryReady, read, write, retry, reset }
}
