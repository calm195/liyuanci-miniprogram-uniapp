export interface ProfileUpdate {
  enrollment_year?: number
  education_level?: 'undergraduate' | 'master' | 'doctor' | ''
  grade_override?: string
  identity_tags?: import('./wish').IdentityTags
  mbti?: string
  nickname: string
  hide_identity_tags: boolean
  expected_version: number
}
export type { BlockEntry, BlockEntryPage as BlockPage } from './whispers'
