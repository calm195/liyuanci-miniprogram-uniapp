// 学生端使用的认证状态、本人资料与会话接口类型。
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

export interface StudentCardAsset {
  asset_id: string
  scan_status: 'pending' | 'approved' | 'rejected'
}
export interface VerificationInput {
  student_number: string
  name: string
  asset_id: string
  expected_version: number
}
