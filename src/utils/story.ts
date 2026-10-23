import type { UserInfo } from '../types/api.ts'
import type { WishResult, WishPublicContent } from '../types/wish.ts'
import type { ShareLink } from '../types/story.ts'
import { canWishAction } from './actions.ts'
export type StoryAction = 'submit' | 'update' | 'withdraw'
const actions = {
  submit: 'postWishesIdStories',
  update: 'putWishesIdStory',
  withdraw: 'postWishesIdStoryWithdraw',
} as const
export function canStoryAction(
  me: UserInfo | null,
  validated: boolean,
  wish: WishResult | null,
  id: string,
  action: StoryAction,
) {
  return (
    !!wish?.own_content &&
    canWishAction(me, validated, wish, id, actions[action]) &&
    (action === 'submit' ? wish.current_state === 'realized' : wish.current_state === 'fulfilled')
  )
}
export function isPublicContent(value: WishPublicContent): boolean {
  return (
    !!value &&
    typeof value.id === 'string' &&
    !!value.id &&
    typeof value.body === 'string' &&
    !!value.body.trim() &&
    Number.isSafeInteger(value.content_version) &&
    value.content_version > 0 &&
    typeof value.school_related === 'boolean'
  )
}
// 分享卡只携带引用与固定标题，既不携带正文，也不执行服务端返回的任意路由。
export function sharePath(link: ShareLink): string {
  if (!link || typeof link.ref !== 'string' || !link.ref) throw new Error('分享引用无效')
  const path = `/pages/share/index?ref=${encodeURIComponent(link.ref)}`
  if (link.miniapp_route !== path) throw new Error('分享路由不匹配')
  return path
}
