export type ContentKind = 'wish' | 'whisper_post' | 'resource'
export interface FavoriteItem {
  kind: ContentKind
  target_id: string
  created_at: string
  available: boolean
  content?: { title: string; excerpt: string } | null
}
export interface FavoritePage {
  items: FavoriteItem[]
  next_cursor: string | null
}
export interface WishComment {
  id: string
  wish_id: string
  version: number
  content_version: number
  parent_content_version: number
  kind: 'comment' | 'author_supplement'
  body: string | null
  status: string
  review_result?: { decision: string; reason?: string; revision_suggestion?: string }
  published_at?: string | null
  root_comment_id?: string | null
  reply_to_comment_id?: string | null
  reply_to_label?: string
  reply_count?: number
  viewer_is_author?: boolean
  author?: { nickname?: string; display_id?: string; avatar_url?: string; is_author?: boolean }
  identity?: { label: string; is_author: boolean }
  allowed_actions: string[]
}
export interface CommentPage {
  items: WishComment[]
  next_cursor: string | null
}
export interface WishCommentInput {
  body: string
  kind: 'comment' | 'author_supplement'
  expected_post_version: number
  expected_comments_epoch: number
  root_comment_id?: string
  reply_to_comment_id?: string
}
