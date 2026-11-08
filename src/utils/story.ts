import type { UserInfo } from '../types/api.ts'
import type { WishResult, WishPublicContent } from '../types/wish.ts'
import { campuses, categories } from '../types/wish.ts'
import type { ShareTarget } from '../types/story.ts'
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
// 分享标题只取公开标题和标签，不把正文带入微信卡片。
export function shareCard(share: ShareTarget) {
  const { target } = share
  const title = target.title?.trim() || (share.target_kind === 'story' ? '还愿故事' : '公开心愿')
  const tags = [
    campuses.find((item) => item.value === target.campus)?.label,
    share.grade_label?.trim(),
    categories.find((item) => item.value === target.category)?.label,
  ].filter((tag): tag is string => !!tag)
  return { title, tags }
}
