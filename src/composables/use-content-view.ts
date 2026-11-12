import { interactionKey, recordContentView } from '@/api/interactions'
import type { ContentKind } from '@/types/interactions'

// 一个页面实例只使用一个事件键；重读、回前台及网络重试不会新增浏览。
export function useContentView(kind: ContentKind) {
  const event = interactionKey()
  let completed = false
  let running = false
  return async (id: string) => {
    if (completed || running || !id) return
    running = true
    try {
      await recordContentView(kind, id, event)
      completed = true
    } catch {
      /* 统计失败与阅读解耦，后续读取可用同一事件键重试。 */
    } finally {
      running = false
    }
  }
}
