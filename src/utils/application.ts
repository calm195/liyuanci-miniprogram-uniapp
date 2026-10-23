import type { UserInfo } from '../types/api.ts'
import type { WishResult } from '../types/wish.ts'
import type { WishApplication } from '../types/application.ts'
import { canWishAction } from './actions.ts'

const validVersion = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0
export function applicationMessageError(message: string): string {
  // 空留言仍走审核；长度按 Unicode 码点计算，不截断或擅自增加必填条件。
  return Array.from(message).length > 100 ? '申请留言不能超过 100 个字' : ''
}
export function canApplyToWish(me: UserInfo | null, validated: boolean, wish: WishResult | null) {
  return (
    !!wish &&
    wish.current_state === 'published' &&
    !wish.own_content &&
    wish.public?.author?.id !== me?.id &&
    validVersion(wish.content_version) &&
    !!wish.public &&
    wish.public.id === wish.id &&
    wish.public.content_version === wish.content_version &&
    canWishAction(me, validated, wish, wish.id, 'postWishesIdApplications')
  )
}
// 申请列表没有动作提示字段；只使用当前本人/许愿人端点返回的精确对象，最终授权由服务端复核。
export function canManageApplications(
  me: UserInfo | null,
  validated: boolean,
  wish: WishResult | null,
) {
  return (
    !!me &&
    validated &&
    me.verification === 'verified' &&
    !!wish?.own_content &&
    wish.current_state === 'published' &&
    !wish.privacy_review_required &&
    validVersion(wish.version)
  )
}
export function canAcceptApplication(
  me: UserInfo | null,
  validated: boolean,
  wish: WishResult | null,
  application: WishApplication,
) {
  return (
    canManageApplications(me, validated, wish) &&
    application.wish_id === wish?.id &&
    application.status === 'active' &&
    validVersion(application.version)
  )
}
export function canWithdrawApplication(
  me: UserInfo | null,
  validated: boolean,
  application: WishApplication,
) {
  return (
    !!me &&
    validated &&
    me.verification === 'verified' &&
    validVersion(application.version) &&
    ['pending_scan', 'pending_review', 'active'].includes(application.status)
  )
}
