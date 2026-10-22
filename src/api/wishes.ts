import { request } from '@/utils/request'
import type { WishFilters, WishInput, WishPage, WishResult } from '@/types/wish'
function query(filters: WishFilters) {
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')
}
export function listWishes(own: boolean, filters: WishFilters) {
  const search = query(
    own
      ? { state: filters.state, cursor: filters.cursor, limit: filters.limit }
      : {
          category: filters.category,
          campus: filters.campus,
          cursor: filters.cursor,
          limit: filters.limit,
        },
  )
  return request<WishPage>({
    url: `${own ? '/me/wishes' : '/wishes'}${search ? '?' + search : ''}`,
  })
}
export function createWish(input: WishInput, key: string) {
  return request<WishResult>({
    url: '/wishes',
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
}
export function updateWish(
  wish: WishResult,
  input: WishInput,
  refreshExpiry: boolean,
  key: string,
) {
  return request<WishResult>({
    url: `/wishes/${encodeURIComponent(wish.id)}/content`,
    method: 'PUT',
    data: { ...input, refresh_expiry: refreshExpiry, expected_version: wish.version },
    header: { 'Idempotency-Key': key },
  })
}
export function submitWishReview(wish: WishResult, key: string) {
  return request<WishResult>({
    url: `/wishes/${encodeURIComponent(wish.id)}/submit-review`,
    method: 'POST',
    data: { expected_version: wish.version, content_version: wish.content_version },
    header: { 'Idempotency-Key': key },
  })
}
export function publishWish(wish: WishResult, key: string) {
  return request<WishResult>({
    url: `/wishes/${encodeURIComponent(wish.id)}/publish`,
    method: 'POST',
    data: { expected_version: wish.version },
    header: { 'Idempotency-Key': key },
  })
}
export function deleteWishDraft(wish: WishResult, key: string) {
  return request<void>({
    url: `/wishes/${encodeURIComponent(wish.id)}/draft`,
    method: 'DELETE',
    data: { expected_version: wish.version },
    header: { 'Idempotency-Key': key },
  })
}
