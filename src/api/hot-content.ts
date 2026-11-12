import { RequestError, request } from '@/utils/request'
import { isPublicContent } from '@/utils/story'
import { matchesSchema } from '@/utils/whispers-schema'
import { whisperSchemas } from '@/utils/whispers-contract-extensions'
import type { HotContentKind } from '@/types/content'
import type { WishPublicContent } from '@/types/wish'
import type { PublicPost } from '@/types/whispers'

export interface HotContentEntry {
  id: string
  title: string
  url: string
}

function wishEntry(item: WishPublicContent): HotContentEntry {
  return {
    id: item.id,
    title: (typeof item.title === 'string' && item.title.trim()) || '未命名心愿',
    url: '/pages/wish-detail/index?id=' + encodeURIComponent(item.id),
  }
}
function whisperEntry(item: PublicPost): HotContentEntry {
  return {
    id: item.id,
    title: item.title?.trim() || '未命名悄悄话',
    url: '/pages/whispers/detail?id=' + encodeURIComponent(item.id),
  }
}

export async function listHotContent(kind: HotContentKind): Promise<HotContentEntry[]> {
  const result = await request<{ items: unknown[] }>({
    url: '/content/hot?kind=' + kind,
    silent: true,
  })
  const items = result?.items
  if (Array.isArray(items) && items.length <= 10) {
    if (kind === 'wish' && items.every((item) => isPublicContent(item as WishPublicContent))) {
      return (items as WishPublicContent[]).map(wishEntry)
    }
    if (
      kind === 'whisper' &&
      items.every((item) =>
        matchesSchema({ $ref: '#/components/schemas/PublicPost' }, item, whisperSchemas),
      )
    ) {
      return (items as PublicPost[]).map(whisperEntry)
    }
  }
  throw new RequestError('热点榜返回格式不符合约定，请刷新后重试', -3)
}
