export const categories = [
  { value: 'help', label: '求助' },
  { value: 'team', label: '组队' },
  { value: 'items', label: '物品' },
  { value: 'dating', label: '脱单' },
  { value: 'skill_exchange', label: '技能交换' },
  { value: 'other', label: '其他' },
] as const
export const campuses = [
  { value: 'wushan', label: '五山' },
  { value: 'university_town', label: '大学城' },
  { value: 'international', label: '国际校区' },
  { value: 'any', label: '不限' },
] as const
export const rewards = [
  { value: 'milk_tea', label: '请奶茶' },
  { value: 'meal', label: '请饭' },
  { value: 'reciprocal_gift', label: '同款回礼' },
  { value: 'skill_exchange', label: '技能互换' },
  { value: 'sincere_thanks', label: '一句真诚感谢' },
] as const
export type WishState =
  | 'draft'
  | 'pending_review'
  | 'ready'
  | 'published'
  | 'matching'
  | 'realized'
  | 'fulfilled'
  | 'withdrawn'
  | 'expired'
  | 'rejected'
export const genders = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'undisclosed', label: '保密' },
] as const
export interface IdentityTags {
  campus?: (typeof campuses)[number]['value']
  // 在读年级字典尚未交付，不从年份推断或编造选项。
  grade?: string
  // 省略表示未填写，与主动选择保密不同。
  gender?: (typeof genders)[number]['value']
}
export interface WishInput {
  identity_tags?: IdentityTags
  category: (typeof categories)[number]['value']
  body: string
  campus: (typeof campuses)[number]['value']
  reward_method: (typeof rewards)[number]['value']
  duration_days: number
}
export interface WishResult {
  id: string
  version: number
  content_version?: number
  current_state: WishState
  allowed_actions: string[]
  privacy_review_required?: boolean
  story_review_result?: {
    decision: 'pending' | 'approved' | 'rejected'
    content_version: number
    reason?: string
    revision_suggestion?: string
  }
  expires_at?: string | null
  participant?: WishPublicContent
  own_content?: Omit<WishInput, 'reward_method' | 'duration_days'> &
    Partial<Pick<WishInput, 'reward_method' | 'duration_days'>>
  public?: WishPublicContent
  review_result?: {
    decision: 'pending' | 'approved' | 'rejected'
    content_version: number
    reason?: string
    revision_suggestion?: string
  }
}
export interface WishPublicContent {
  author?: { id: string; nickname: string; identity_tags?: IdentityTags }
  id: string
  body: string
  content_version: number
  school_related: boolean
  notice_codes: string[]
  notice_text: string
  category?: WishInput['category']
  campus?: WishInput['campus']
  reward_method?: WishInput['reward_method']
  expires_at?: string
}
export interface WishPage {
  items: WishResult[]
  next_cursor: string | null
}
export interface WishFilters {
  category?: WishInput['category']
  campus?: WishInput['campus']
  state?: WishState
  cursor?: string
  limit?: number
}
