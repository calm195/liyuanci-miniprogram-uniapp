import { computed, getCurrentInstance, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { onHide, onUnload } from '@dcloudio/uni-app'
import { createNoticeQueue, noticeContext, noticeEvent } from '@/utils/notices'
import type { NoticeItem, NoticeKind } from '@/utils/notices'

// tab 页面可同时存活，只有当前可见页面接收全局操作提示。
export function usePageNotices() {
  const instance = getCurrentInstance()
  const mounted = ref(false)
  // 页面交互 mixin 在 setup 之后初始化，挂载后才读取其响应式状态。
  onMounted(() => {
    mounted.value = true
  })
  const visible = computed(() => mounted.value && instance?.proxy?.isPageVisible === true)
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
  const operations = new Map<string, number>()
  function receive(value: unknown) {
    if (!visible.value || !value || typeof value !== 'object') return
    const input = value as { message?: unknown; kind?: unknown; key?: unknown }
    if (typeof input.message !== 'string') return
    const key = typeof input.key === 'string' ? input.key : ''
    if (!input.message.trim()) {
      const id = operations.get(key)
      if (id) controller.dismiss(id)
      operations.delete(key)
      return
    }
    const kind = ['success', 'error', 'warning', 'uncertain', 'progress'].includes(
      String(input.kind),
    )
      ? (input.kind as NoticeKind)
      : 'info'
    const id = controller.show(input.message, kind, operations.get(key))
    if (key) operations.set(key, id)
  }
  uni.$on(noticeEvent, receive)
  watch(
    visible,
    (value) => {
      if (!value) queue.clear()
    },
    { flush: 'sync' },
  )
  onHide(() => {
    queue.clear()
    operations.clear()
  })
  onUnload(queue.clear)
  onUnmounted(() => {
    uni.$off(noticeEvent, receive)
    queue.clear()
  })
  return { items, dismiss: queue.dismiss }
}
