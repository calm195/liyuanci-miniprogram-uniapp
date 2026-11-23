import { onUnmounted } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import { useEntryStore } from '@/stores/entry'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'

export function useLogin() {
  const entry = useEntryStore()
  const user = useUserStore()
  let visible = true
  let generation = 0
  onShow(() => {
    visible = true
  })
  function leave() {
    visible = false
    generation++
  }
  onHide(leave)
  onUnload(leave)
  onUnmounted(leave)
  function requestLogin(after?: () => void | Promise<void>) {
    const current = generation
    if (!visible) return
    if (user.validated && user.user && session.getToken()) {
      const epoch = session.getEpoch()
      const owner = user.user.id
      // 即使已经登录，续接动作也可能在微任务执行前失去页面或会话归属。
      const active = () =>
        visible &&
        current === generation &&
        epoch === session.getEpoch() &&
        user.validated &&
        user.user?.id === owner
      void Promise.resolve()
        .then(() => {
          if (active()) return after?.()
        })
        .catch((failure: unknown) => {
          if (!active()) return
          uni.$emit?.('app:notice', {
            message: failure instanceof Error ? failure.message : '无法继续操作，请重试。',
            kind: 'error',
          })
        })
      return
    }
    entry.openLogin(after, () => visible && current === generation)
  }
  return { requestLogin }
}

export function useLoginRefresh(refresh: () => void | Promise<unknown>) {
  let visible = true
  onShow(() => {
    visible = true
  })
  onHide(() => {
    visible = false
  })
  onUnload(() => {
    visible = false
  })
  const ready = () => {
    if (visible) void refresh()
  }
  uni.$on('auth:ready', ready)
  onUnmounted(() => uni.$off('auth:ready', ready))
}
