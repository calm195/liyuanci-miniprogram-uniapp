import { request } from '@/utils/request'
import type { WishFilters, WishInput, WishPage, WishPublicContent, WishResult } from '@/types/wish'
export const getWish = (id: string) =>
  request<WishResult>({ url: `/wishes/${encodeURIComponent(id)}` })

export type WishLifecycleAction = 'withdraw' | 'rollback' | 'complete' | 'exception-exit'
export function changeWishState(
  wish: WishResult,
  action: WishLifecycleAction,
  key: string,
  rollback?: { target: 'matching' | 'published'; refresh_expiry: boolean },
) {
  if (action === 'rollback' && !rollback) throw new Error('请选择回退目标')
  return request<WishResult>({
    url: `/wishes/${encodeURIComponent(wish.id)}/${action}`,
    method: 'POST',
    data: { expected_version: wish.version, ...(action === 'rollback' ? rollback : {}) },
    header: { 'Idempotency-Key': key },
  })
}

function query(filters: WishFilters) {
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')
}
export async function listWishes(own: boolean, filters: WishFilters) {
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
  if (own) return request<WishPage>({ url: `/me/wishes${search ? '?' + search : ''}` })
  const page = await request<{ items: WishPublicContent[]; next_cursor: string | null }>({
    url: `/wishes${search ? '?' + search : ''}`,
  })
  // 公开接口返回正文投影；转换仅供卡片展示，不赋予任何本人写入动作。
  return {
    ...page,
    items: page.items.map((content): WishResult => ({
      id: content.id,
      version: 0,
      current_state: 'published',
      allowed_actions: [],
      public: content,
    })),
  }
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
