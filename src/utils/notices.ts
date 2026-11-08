import type { InjectionKey } from 'vue'

export type NoticeKind = 'success' | 'error' | 'info' | 'warning' | 'uncertain' | 'progress'
export interface NoticeItem {
  id: number
  message: string
  kind: NoticeKind
}
export interface NoticeController {
  show(message: string, kind?: NoticeKind, previous?: number): number
  dismiss(id: number): void
}
export const noticeContext: InjectionKey<NoticeController> = Symbol('page-notices')
export const noticeEvent = 'app:notice'

// 计时器只控制展示，不修改业务错误、重试参数或操作回执。
export function createNoticeQueue(
  update: (items: NoticeItem[]) => void,
  schedule: (callback: () => void, delay: number) => unknown = setTimeout,
  cancel: (handle: unknown) => void = (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
) {
  let nextId = 0
  let generation = 0
  let items: NoticeItem[] = []
  const timers = new Map<number, { handle: unknown; generation: number }>()
  function dismiss(id: number) {
    const timer = timers.get(id)
    if (timer) cancel(timer.handle)
    timers.delete(id)
    items = items.filter((item) => item.id !== id)
    update([...items])
  }
  function show(message: string, kind: NoticeKind = 'info', previous?: number) {
    if (!message.trim()) return 0
    const existing =
      items.find((item) => item.id === previous) ??
      items.find((item) => item.message === message && item.kind === kind)
    const id = existing?.id ?? ++nextId
    const timer = timers.get(id)
    if (timer) cancel(timer.handle)
    items = [...items.filter((item) => item.id !== id), { id, message, kind }]
    while (items.length > 3) dismiss(items[0]!.id)
    const current = ++generation
    if (kind !== 'progress')
      timers.set(id, {
        generation: current,
        handle: schedule(() => {
          if (timers.get(id)?.generation === current) dismiss(id)
        }, { success: 3000, warning: 5000, error: 6000, uncertain: 8000, info: 4000 }[kind]),
      })
    update([...items])
    return id
  }
  function clear() {
    for (const timer of timers.values()) cancel(timer.handle)
    timers.clear()
    items = []
    update([])
  }
  return { show, dismiss, clear }
}

// 结果未知独立于失败，提示关闭不会丢失原请求的重试状态。
export function resultNoticeKind(message: string, kind: NoticeKind): NoticeKind {
  if (/尚未确认|结果不明|未能确认|结果未知/.test(message)) return 'uncertain'
  return kind
}
