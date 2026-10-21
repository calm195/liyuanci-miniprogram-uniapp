import { categories, campuses, rewards } from '../types/wish.ts'
import type { WishInput, WishResult, WishState } from '../types/wish.ts'

export function emptyWish(): WishInput {
  return {
    category: 'help',
    body: '',
    campus: 'any',
    reward_method: 'sincere_thanks',
    duration_days: 7,
  }
}
export function validateWish(input: WishInput): string {
  if (!input.body.trim()) return '请填写心愿正文'
  if (Array.from(input.body).length > 500) return '心愿正文不能超过 500 个字'
  if (!Number.isInteger(input.duration_days) || input.duration_days < 1 || input.duration_days > 30)
    return '有效期须为 1 至 30 天的整数'
  if (!categories.some((item) => item.value === input.category)) return '请选择有效分类'
  if (!campuses.some((item) => item.value === input.campus)) return '请选择有效校区'
  if (!rewards.some((item) => item.value === input.reward_method)) return '请选择有效报答方式'
  return ''
}
export const wishStateLabels: Record<WishState, string> = {
  draft: '草稿',
  pending_review: '审核中',
  ready: '审核通过，待上架',
  published: '已上架',
  matching: '匹配中',
  realized: '已实现',
  fulfilled: '已还愿',
  withdrawn: '已撤回',
  expired: '已过期',
  rejected: '已驳回',
}
// 公开列表只取公开投影；屏障、待审或非上架状态不借本人正文补位。
export function publicWishBody(wish: WishResult): string {
  return !wish.privacy_review_required && wish.current_state === 'published'
    ? wish.public?.body || ''
    : ''
}
export function ownWishBody(wish: WishResult): string {
  return wish.privacy_review_required ? '' : wish.own_content?.body || wish.public?.body || ''
}
