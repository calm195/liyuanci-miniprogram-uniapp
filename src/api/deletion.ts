import { request } from '@/utils/request'
import type { DeletionInput, DeletionAccepted, DeletionStatus } from '@/types/deletion'

export const requestDeletion = (input: DeletionInput, key: string) =>
  request<DeletionAccepted>({
    url: '/me/deletion-requests',
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
// 回执本身是查询凭证，查询不附带任何账号令牌。
export const getDeletionStatus = (receipt: string) =>
  request<DeletionStatus>({ url: `/deletion-receipts/${encodeURIComponent(receipt)}`, auth: false })
