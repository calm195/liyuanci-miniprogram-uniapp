import { computed, watch } from 'vue'
import { onShareAppMessage, onShareTimeline, onShow, onHide } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import type { ShareKind } from '@/types/story'
import type { WishPublicContent } from '@/types/wish'
import { nativeShareQuery, sharePage, shareTitle } from '@/utils/share'

const imageUrl = '/static/share-cover.png'
const fallbackTitle = '鲤愿池 · 心愿与还愿故事'

export function useContentShare(kind: ShareKind, content: () => WishPublicContent | null) {
  const user = useUserStore()
  const target = computed(() =>
    !config.useMock && user.validated && user.user?.verification === 'verified' ? content() : null,
  )
  let visible = false
  function syncMenu() {
    if (!visible) return
    if (target.value) uni.showShareMenu?.({ menus: ['shareAppMessage', 'shareTimeline'] })
    else uni.hideShareMenu?.({ hideShareItems: ['shareAppMessage', 'shareTimeline'] })
  }
  watch(target, syncMenu)
  onShow(() => {
    visible = true
    syncMenu()
  })
  onHide(() => {
    visible = false
  })
  onShareAppMessage(() => {
    const item = target.value
    return item
      ? {
          title: shareTitle(kind, item),
          imageUrl,
          path: `${sharePage(kind)}?${nativeShareQuery(item.id)}`,
        }
      : { title: fallbackTitle, imageUrl, path: '/pages/index/index' }
  })
  onShareTimeline(() => {
    const item = target.value
    return item
      ? { title: shareTitle(kind, item), imageUrl, query: nativeShareQuery(item.id) }
      : { title: fallbackTitle, imageUrl, query: '' }
  })
  return target
}
