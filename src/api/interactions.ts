import { request } from '@/utils/request'
import type {
  ContentKind,
  FavoritePage,
  WishComment,
  CommentPage,
  WishCommentInput,
} from '@/types/interactions'

export function interactionKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (value) => {
    const number = Math.floor(Math.random() * 16)
    return (value === 'x' ? number : (number & 3) | 8).toString(16)
  })
}
export function setFavorite(kind: ContentKind, id: string, active: boolean, key: string) {
  return request<{ favorited: boolean }>({
    url: `/me/favorites/${kind}/${encodeURIComponent(id)}`,
    method: active ? 'PUT' : 'DELETE',
    header: { 'Idempotency-Key': key },
    silent: true,
  })
}
export function listFavorites(kind: ContentKind, cursor?: string) {
  return request<FavoritePage>({
    url: `/me/favorites?kind=${kind}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    silent: true,
  })
}
export function recordContentView(kind: ContentKind, id: string, eventId: string) {
  return request<{ view_count: number }>({
    url: `/content/${kind}/${encodeURIComponent(id)}/views`,
    method: 'POST',
    data: { event_id: eventId },
    header: { 'Idempotency-Key': eventId },
    silent: true,
  })
}
export function notificationSummary() {
  return request<{ unread_count: number }>({ url: '/me/notifications/summary', silent: true })
}
export function listWishComments(
  id: string,
  options: {
    kind?: 'comment' | 'author_supplement'
    root_comment_id?: string
    cursor?: string
  } = {},
) {
  const query = Object.entries(options)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
    .join('&')
  return request<CommentPage>({
    url: `/wishes/${encodeURIComponent(id)}/comments${query ? '?' + query : ''}`,
    silent: true,
  })
}
export function createWishComment(id: string, input: WishCommentInput, key: string) {
  return request<WishComment>({
    url: `/wishes/${encodeURIComponent(id)}/comments`,
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
    silent: true,
  })
}
export function updateWishComment(
  id: string,
  input: WishCommentInput & { expected_version: number },
  key: string,
) {
  return request<WishComment>({
    url: `/me/wish-comments/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: input,
    header: { 'Idempotency-Key': key },
    silent: true,
  })
}
export function withdrawWishComment(comment: WishComment, key: string) {
  return request<WishComment>({
    url: `/me/wish-comments/${encodeURIComponent(comment.id)}/withdraw`,
    method: 'POST',
    data: { expected_version: comment.version },
    header: { 'Idempotency-Key': key },
    silent: true,
  })
}
export function setWishComments(id: string, version: number, commentsOpen: boolean, key: string) {
  return request<{ version: number; comments_open: boolean; comments_epoch: number }>({
    url: `/me/wishes/${encodeURIComponent(id)}/comments-setting`,
    method: 'PUT',
    data: { expected_version: version, comments_open: commentsOpen },
    header: { 'Idempotency-Key': key },
    silent: true,
  })
}
export function listOwnWishComments(wishId: string, cursor?: string) {
  return request<CommentPage>({
    url: `/me/wish-comments?wish_id=${encodeURIComponent(wishId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    silent: true,
  })
}
