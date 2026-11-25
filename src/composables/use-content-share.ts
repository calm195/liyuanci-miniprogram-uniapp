import { computed } from 'vue'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import type { ShareKind } from '@/types/story'
import type { WishPublicContent } from '@/types/wish'
import {
  brandFriendShare,
  brandTimelineShare,
  nativeShareQuery,
  shareCover,
  sharePage,
  shareTitle,
} from '@/utils/share'

export function useContentShare(kind: ShareKind, content: () => WishPublicContent | null) {
  const user = useUserStore()
  function currentTarget() {
    return !config.useMock && user.validated && user.user?.verification === 'verified'
      ? content()
      : null
  }
  function friendShare() {
    const item = currentTarget()
    return item
      ? {
          title: shareTitle(kind, item),
          imageUrl: shareCover,
          path: `${sharePage(kind)}?${nativeShareQuery(item.id)}`,
        }
      : brandFriendShare()
  }
  function timelineShare() {
    const item = currentTarget()
    return item
      ? { title: shareTitle(kind, item), imageUrl: shareCover, query: nativeShareQuery(item.id) }
      : brandTimelineShare()
  }
  return { target: computed(currentTarget), friendShare, timelineShare }
}
