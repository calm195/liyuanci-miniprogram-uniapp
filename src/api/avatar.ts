import { request } from '@/utils/request'
import type { UserInfo } from '@/types/api'

export const maxAvatarBytes = 2 * 1024 * 1024

export function uploadAvatar(filePath: string, version: number, key: string) {
  return request<UserInfo>({
    url: '/me/avatar',
    method: 'POST',
    timeout: 30_000,
    filePath,
    uploadFormData: { expected_version: String(version) },
    header: { 'Idempotency-Key': key },
    silent: true,
  })
}

export function deleteAvatar(version: number, key: string) {
  return request<UserInfo>({
    url: '/me/avatar',
    method: 'DELETE',
    data: { expected_version: version },
    header: { 'Idempotency-Key': key },
    silent: true,
  })
}
