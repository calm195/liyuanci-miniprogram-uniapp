import type { WishPublicContent } from './wish'
export type ShareKind = 'wish' | 'story'
export interface StoryAccepted {
  id: string
  version: number
  content_version: number
  status: 'pending_review'
  wish_state: 'fulfilled'
}
export interface StoryPage {
  items: WishPublicContent[]
  next_cursor: string | null
}
export interface ShareLink {
  ref: string
  miniapp_route: string
}
export interface ShareTarget {
  target_kind: ShareKind
  target: WishPublicContent
}
