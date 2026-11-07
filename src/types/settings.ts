export interface ProfileUpdate {
  identity_tags?: import('./wish').IdentityTags
  nickname: string
  hide_identity_tags: boolean
  expected_version: number
}
export type { BlockEntry, BlockEntryPage as BlockPage } from './whispers'
