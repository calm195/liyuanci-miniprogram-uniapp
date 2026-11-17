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
      void Promise.resolve()
        .then(() => after?.())
        .catch((failure: unknown) => {
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
