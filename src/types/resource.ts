export type ResourceFeedbackKind = 'valid' | 'link_invalid' | 'outdated' | 'incomplete'
export interface ResourceCategory {
  id: string
  name: string
}
export interface ResourceFeedback {
  resource_id: string
  content_version: number
  kind: ResourceFeedbackKind
  version: number
  updated_at: string
}
export interface ResourceSummary {
  id: string
  title: string
  category: ResourceCategory
  version: number
  created_at: string
  updated_at: string
  published_at: string
  description_excerpt: string
}
export interface ResourceDetail extends Omit<ResourceSummary, 'description_excerpt'> {
  description: string
  download_url: string
  extraction_code: string | null
  content_version: number
  my_feedback: ResourceFeedback | null
  allowed_actions: ('copy_download' | 'submit_feedback')[]
}
export interface ResourceDownload {
  resource_id: string
  version: number
  download_url: string
  extraction_code: string | null
  copy_text: string
}
export interface ResourcePage<T> {
  items: T[]
  next_cursor: string | null
}
export interface ResourceQuery {
  category_id?: string
  q?: string
  cursor?: string
  limit?: number
}
export interface ResourceFeedbackInput {
  kind: ResourceFeedbackKind
  expected_content_version: number
  expected_feedback_version: number
}
