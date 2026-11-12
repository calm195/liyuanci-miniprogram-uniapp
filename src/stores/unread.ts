import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { notificationSummary } from '@/api/interactions'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { createVisiblePoller } from '@/utils/visible-poller'
import { config } from '@/config'

// 总量来自权威汇总，不能用已加载的某一页通知计算底栏角标。
export const useUnreadStore = defineStore('notification-unread', () => {
  const user = useUserStore()
  const count = ref(0)
  let visible = false
  let generation = 0
  let loading = false
  let refreshQueued = false
  const label = computed(() =>
    count.value > 99 ? '99+' : count.value > 0 ? String(count.value) : '',
  )
  async function refresh() {
    if (!visible || config.useMock || !session.getToken()) return
    if (loading) {
      refreshQueued = true
      return
    }
    const epoch = session.getEpoch()
    const current = generation
    loading = true
    try {
      const summary = await notificationSummary()
      if (
        !refreshQueued &&
        visible &&
        epoch === session.getEpoch() &&
        current === generation &&
        Number.isSafeInteger(summary.unread_count)
      )
        count.value = Math.max(0, summary.unread_count)
    } catch {
      /* 后台更新失败保留已确认的数字，下一轮恢复，不显示成功提示。 */
    } finally {
      loading = false
      if (refreshQueued) {
        refreshQueued = false
        // 标已读或换号可能发生在旧汇总请求中，完成后立即读取新总量。
        await refresh()
      }
    }
  }
  const poller = createVisiblePoller(refresh, undefined, 30000)
  function start() {
    visible = true
    poller.start()
  }
  function stop() {
    visible = false
    generation++
    refreshQueued = false
    poller.stop()
  }
  function clear() {
    generation++
    count.value = 0
    if (visible) void refresh()
  }
  watch(() => [user.user?.id, session.getEpoch()], clear, { flush: 'sync' })
  uni.$on('auth:expired', clear)
  return { count, label, refresh, start, stop, clear }
})
