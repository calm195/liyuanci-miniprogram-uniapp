import { request } from '@/utils/request'
import type { UserInfo } from '@/types/api'
import type { ProfileUpdate, BlockEntry, BlockPage } from '@/types/settings'
export const updateProfile = (input: ProfileUpdate, key: string) =>
  request<UserInfo>({
    url: '/me/profile',
    method: 'PUT',
    data: input,
    header: { 'Idempotency-Key': key },
  })
// 列表按已实现的后端投影接入；解除操作使用记录版本，不能使用本人版本。
export const listBlocks = (cursor?: string) =>
  request<BlockPage>({
    url: `/me/blocks?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  })
export const blockUser = (target: string, key: string) =>
  request<{ target_user_id: string; blocked: true }>({
    url: '/me/blocks',
    method: 'POST',
    data: { target_user_id: target },
    header: { 'Idempotency-Key': key },
  })
export const unblockUser = (entry: BlockEntry, key: string) =>
  request<void>({
    url: `/me/blocks/${encodeURIComponent(entry.target_user_id)}`,
    method: 'DELETE',
    data: { expected_version: entry.version },
    header: { 'Idempotency-Key': key },
  })
