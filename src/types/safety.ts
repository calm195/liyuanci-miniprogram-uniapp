export type ReportKind = 'wish' | 'story' | 'application' | 'message'
export interface ReportInput {
  target_kind: ReportKind
  id: string
  type_code: string
  description?: string
}
export interface SafetyPage<T> {
  items: T[]
  next_cursor: string | null
}
export interface ReportType {
  code: string
  label: string
}
export interface SafetyAccepted {
  id: string
  version: number
  status: 'pending'
}
export interface AppealInput {
  penalty_id: string
  body: string
}
export interface Appeal {
  id: string
  version: number
  status: string
  reason?: string | null
}
export interface Warning {
  id: string
  version: number
  notice: string
  first_displayed_at: string | null
  confirmable_at: string | null
  server_now: string
  remaining_seconds: number
  acknowledged_at?: string | null
}
