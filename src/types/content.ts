export type ContentSort = 'time' | 'hot' | 'support'
export type HotContentKind = 'wish' | 'whisper'

export interface ContentSearch {
  keyword?: string
  sort?: ContentSort
}
