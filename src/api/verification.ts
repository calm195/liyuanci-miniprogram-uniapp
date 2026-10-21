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
// 版本由调用方在契约冻结后传入，适配层不猜测所属聚合。
export function submitVerification(input: VerificationInput, key: string) {
  return request<Verification>({
    url: '/me/verification-requests',
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
}
