export type ContentSort = 'time' | 'hot'
export type HotContentKind = 'wish' | 'whisper'

export interface ContentSearch {
  keyword?: string
  sort?: ContentSort
}
