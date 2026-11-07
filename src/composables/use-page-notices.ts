import { computed, getCurrentInstance, onUnmounted, provide, ref, watch } from 'vue'
import { onHide, onUnload } from '@dcloudio/uni-app'
import { createNoticeQueue, noticeContext, noticeEvent } from '@/utils/notices'
import type { NoticeItem, NoticeKind } from '@/utils/notices'

// tab 页面可同时存活，只有当前可见页面接收全局操作提示。
export function usePageNotices() {
  const instance = getCurrentInstance()
  const visible = computed(() => instance?.proxy?.isPageVisible === true)
  const items = ref<NoticeItem[]>([])
  const queue = createNoticeQueue((value) => {
    items.value = value
  })
  const controller = {
    show(message: string, kind?: NoticeKind, previous?: number) {
      return visible.value ? queue.show(message, kind, previous) : 0
    },
    dismiss: queue.dismiss,
  }
  provide(noticeContext, controller)
  function receive(value: unknown) {
    if (!visible.value || !value || typeof value !== 'object') return
    const input = value as { message?: unknown; kind?: unknown }
    if (typeof input.message !== 'string' || !input.message.trim()) return
    const kind = input.kind === 'success' || input.kind === 'error' ? input.kind : 'info'
    controller.show(input.message, kind)
  }
  uni.$on(noticeEvent, receive)
  watch(
    visible,
    (value) => {
      if (!value) queue.clear()
    },
    { flush: 'sync' },
  )
  onHide(queue.clear)
  onUnload(queue.clear)
  onUnmounted(() => {
    uni.$off(noticeEvent, receive)
    queue.clear()
  })
  return { items, dismiss: queue.dismiss }
}
