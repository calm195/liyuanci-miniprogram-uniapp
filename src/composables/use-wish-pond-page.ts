import { onHide, onLoad, onPullDownRefresh, onShow, onUnload } from '@dcloudio/uni-app'
import { ref, watch } from 'vue'
import { takeMainQuery } from '@/utils/navigation'
import type WishPond from '@/components/WishPond.vue'

export function useWishPondPage(mainTab = false) {
  const pond = ref<InstanceType<typeof WishPond> | null>(null)
  let visible = false
  let query: Record<string, string | undefined> | undefined
  onLoad((options) => {
    query = options
  })
  function show() {
    if (!visible || !pond.value) return
    const nextQuery = (mainTab ? takeMainQuery() : null) ?? query
    query = undefined
    void pond.value.show(nextQuery)
  }
  onShow(() => {
    visible = true
    show()
  })
  // 微信首次 onShow 可能早于组件模板引用建立。
  watch(pond, show)
  function leave() {
    visible = false
    pond.value?.leave()
  }
  onHide(leave)
  onUnload(leave)
  onPullDownRefresh(() => pond.value?.refresh() ?? uni.stopPullDownRefresh())
  return pond
}
