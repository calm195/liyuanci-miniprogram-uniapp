import type { IdentityTags, WishPublicContent } from './wish'

export interface PublicProfile {
  id: string
  nickname: string
  identity_tags?: IdentityTags
}
export const applicationStatusLabels = {
  pending_scan: '留言扫描中',
  pending_review: '留言审核中',
  active: '等待许愿人确定',
  accepted: '已确定应愿',
  withdrawn: '已撤销',
  rejected: '已驳回',
  invalidated: '已失效',
} as const
export type ApplicationStatus = keyof typeof applicationStatusLabels
export interface WishApplication {
  id: string
  version: number
  wish_id: string
  status: ApplicationStatus
  applicant?: PublicProfile
  message?: string
  review_result?: {
    decision: 'pending' | 'approved' | 'rejected'
    content_version: number
    reason?: string
    revision_suggestion?: string
  }
}
export interface ApplicationPage {
  items: WishApplication[]
  next_cursor: string | null
}
export interface MatchResult {
  match_id: string
  conversation_id: string
  wish_id: string
  version: number
}
export interface ProfileContents {
  profile: PublicProfile
  items: { kind: 'wish' | 'story'; content: WishPublicContent }[]
  next_cursor: string | null
}
