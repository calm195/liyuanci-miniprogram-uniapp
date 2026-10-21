import { request } from '@/utils/request'
import type { StudentCardAsset, Verification, VerificationInput } from '@/types/api'

export function uploadStudentCard(filePath: string, key: string) {
  return request<StudentCardAsset>({
    url: '/me/student-card-assets',
    method: 'POST',
    filePath,
    header: { 'Idempotency-Key': key },
  })
}
// 只提供单次读取能力；查询节奏与页面恢复方案确认后再接线。
export function getStudentCardAsset(id: string) {
  return request<StudentCardAsset>({
    url: `/me/student-card-assets/${encodeURIComponent(id)}`,
    method: 'GET',
  })
}
// 首次省略版本；重提由调用方读取当前审核记录版本，不默认或替换版本。
export function submitVerification(input: VerificationInput, key: string) {
  return request<Verification>({
    url: '/me/verification-requests',
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
}
