import { computed, getCurrentInstance, ref, watch } from 'vue'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'

type WishActionGate = 'login' | 'verification'
export type WishActionReady = { owner: string; epoch: number }

const readyEvent = 'wishActionReady'

export function openWishActionGate(
  gate: WishActionGate,
  onReady: (result: WishActionReady | null) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.navigateTo({
      url: `/pages/${gate}/index?returnToWish=1`,
      events: { [readyEvent]: onReady },
      success: () => resolve(),
      fail: () => reject(new Error('无法打开所需页面，请重试。')),
    })
  })
}

export function useWishActionReturn(gate: WishActionGate) {
  const user = useUserStore()
  const instance = getCurrentInstance()
  const active = ref(false)
  const visible = ref(false)
  const returning = ref(false)
  let channel: UniApp.EventChannel | undefined

  const ready = computed(
    () =>
      !user.busy &&
      user.validated &&
      !!user.user?.id &&
      (gate === 'login' || user.user.verification === 'verified'),
  )

  onLoad((query) => {
    const pages = getCurrentPages()
    if (query?.returnToWish !== '1' || pages[pages.length - 2]?.route !== 'pages/wish-detail/index')
      return
    // 微信页面的事件通道仅连到本次导航的发起页，不保存跨页面的操作意图。
    const proxy = instance?.proxy as { getOpenerEventChannel?: () => UniApp.EventChannel } | null
    channel = proxy?.getOpenerEventChannel?.()
    active.value = !!channel
  })
  onShow(() => {
    visible.value = true
  })
  onHide(() => {
    visible.value = false
  })
  onUnload(() => {
    visible.value = false
  })

  function returnToWish() {
    if (!active.value || !visible.value || returning.value || user.busy) return
    returning.value = true
    const owner = user.user?.id
    const result = ready.value && owner ? { owner, epoch: session.getEpoch() } : null
    // 先把成功回执交给发起页，发起页只在再次显示且会话一致时继续。
    if (result) channel?.emit(readyEvent, result)
    uni.navigateBack({
      fail: () => {
        if (result) channel?.emit(readyEvent, null)
        returning.value = false
        uni.$emit?.('app:notice', { message: '无法返回心愿详情，请重试。', kind: 'error' })
      },
    })
  }

  watch([active, visible, ready], ([inWishFlow, shown, passed]) => {
    if (inWishFlow && shown && passed) returnToWish()
  })

  return { active, returning, returnToWish }
}
