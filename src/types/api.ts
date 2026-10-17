// T009 / REQ-002、018；共享契约 0.1.0 的最小学生端投影。
export type VerificationState = 'unverified' | 'pending' | 'verified' | 'rejected'
export interface UserInfo {
  id: string
  version: number
  nickname?: string
  verification: VerificationState
  hide_identity_tags?: boolean
  allowed_actions: string[]
  penalty_notice?: string
}
export interface Session {
  token: string
  me: UserInfo
}
export interface Verification {
  request_id: string
  version: number
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
  revision_suggestion?: string
}
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  request_id: string
  error_code?: string
}
