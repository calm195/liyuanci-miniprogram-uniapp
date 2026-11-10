import { dictionaryLabel } from '../features/dictionaries/catalog.ts'
import { categories, campuses, rewards, genders } from '../types/wish.ts'
import type { WishInput, WishResult, WishState } from '../types/wish.ts'

export function emptyWish(): WishInput {
  return {
    title: '',
    category: 'help',
    body: '',
    campus: 'any',
    reward_method: 'sincere_thanks',
    duration_days: 7,
  }
}
export function validateWish(input: WishInput): string {
  if (!input.title.trim()) return '请填写心愿标题'
  if (Array.from(input.title).length > 40) return '心愿标题不能超过 40 个字'
  if (input.reward_method === 'custom' && !input.reward_text?.trim()) return '请填写报答方式'
  if (input.reward_method !== 'custom' && input.reward_text) return '请选择自己填写后输入报答方式'
  if (Array.from(input.reward_text || '').length > 100) return '报答方式不能超过 100 个字'
  if (!input.body.trim()) return '请填写心愿正文'
  if (Array.from(input.body).length > 500) return '心愿正文不能超过 500 个字'
  if (!Number.isInteger(input.duration_days) || input.duration_days < 1 || input.duration_days > 30)
    return '有效期须为 1 至 30 天的整数'
  if (!categories.some((item) => item.value === input.category)) return '请选择有效分类'
  if (!campuses.some((item) => item.value === input.campus)) return '请选择有效校区'
  if (!rewards.some((item) => item.value === input.reward_method)) return '请选择有效报答方式'
  const tags = input.identity_tags
  if (tags) {
    if (tags.gender !== undefined && !genders.some((item) => item.value === tags.gender))
      return '请选择有效性别'
    if (tags.grade !== undefined && (typeof tags.grade !== 'string' || tags.grade.length === 0))
      return '在读年级不能为空'
    if (tags.campus !== undefined && !campuses.some((item) => item.value === tags.campus))
      return '请选择有效校区'
  }
  return ''
}
// 固定协议状态保持完整，显示名称按当前字典快照响应式读取。
export const wishStateLabels: Record<WishState, string> = {
  get draft() {
    return dictionaryLabel('wish_state', 'draft')
  },
  get pending_review() {
    return dictionaryLabel('wish_state', 'pending_review')
  },
  get ready() {
    return dictionaryLabel('wish_state', 'ready')
  },
  get published() {
    return dictionaryLabel('wish_state', 'published')
  },
  get matching() {
    return dictionaryLabel('wish_state', 'matching')
  },
  get realized() {
    return dictionaryLabel('wish_state', 'realized')
  },
  get fulfilled() {
    return dictionaryLabel('wish_state', 'fulfilled')
  },
  get withdrawn() {
    return dictionaryLabel('wish_state', 'withdrawn')
  },
  get expired() {
    return dictionaryLabel('wish_state', 'expired')
  },
  get rejected() {
    return dictionaryLabel('wish_state', 'rejected')
  },
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
