export interface ProfileUpdate {
  nickname: string
  hide_identity_tags: boolean
  expected_version: number
}
export interface BlockEntry {
  target_user_id: string
  version: number
}
export interface BlockPage {
  items: BlockEntry[]
  next_cursor: string | null
}
