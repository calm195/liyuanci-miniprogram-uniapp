import { callWhisper } from '@/api/whispers'
import type { SourceRef } from '@/types/whispers'
import { request } from '@/utils/request'
import type { UserInfo } from '@/types/api'
import type { ProfileUpdate, BlockEntry } from '@/types/settings'
export const updateProfile = (input: ProfileUpdate, key: string) =>
  request<UserInfo>({
    url: '/me/profile',
    method: 'PUT',
    data: input,
    header: { 'Idempotency-Key': key },
  })
// 全来源黑名单使用不透明条目，禁止回退到公开账号映射接口。
export const listBlocks = (cursor?: string) =>
  callWhisper('interactionBlocksList', { query: { limit: 20, ...(cursor ? { cursor } : {}) } })
export const blockUser = (source: SourceRef, key: string) =>
  callWhisper('interactionBlockCreate', { data: { source }, key })
export const unblockUser = (entry: BlockEntry, key: string) =>
  callWhisper('interactionBlockDelete', {
    path: { block_id: entry.block_id },
    data: { expected_version: entry.version },
    key,
  })
export const getBlockWorkspace = () => callWhisper('whisperWorkspaceGet', {})
