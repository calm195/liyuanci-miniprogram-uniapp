import type { UserInfo } from '../types/api.ts'
import type { DeletionAccepted, DeletionStatus } from '../types/deletion.ts'

export function canDeleteAccount(me: UserInfo | null, validated: boolean): boolean {
  return (
    !!me &&
    validated &&
    Number.isSafeInteger(me.version) &&
    me.version > 0 &&
    Array.isArray(me.allowed_actions) &&
    me.allowed_actions.includes('postMeDeletionRequests')
  )
}
// 不解析句柄内部身份或作业结构，仅限制为单个安全路径片段。
export function validDeletionReceipt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 2048 &&
    /^[A-Za-z0-9._~-]+$/.test(value) &&
    value !== '.' &&
    value !== '..'
  )
}
export function deletionAccepted(value: DeletionAccepted): string {
  if (!value || value.status !== 'processing' || !validDeletionReceipt(value.deletion_receipt))
    throw new Error('注销受理回执格式异常')
  return value.deletion_receipt
}
export function deletionStatus(value: DeletionStatus): DeletionStatus {
  if (
    !value ||
    !['processing', 'completed'].includes(value.status) ||
    (value.retryable_error !== undefined && typeof value.retryable_error !== 'string')
  )
    throw new Error('注销进度格式异常')
  return {
    status: value.status,
    ...(value.retryable_error ? { retryable_error: 'retry_pending' } : {}),
  }
}
