import { request } from '@/utils/request'
import type { WishResult, WishPublicContent } from '@/types/wish'
import type { StoryAccepted, StoryPage, ShareKind, ShareLink, ShareTarget } from '@/types/story'
import { contentSearchParams } from '@/utils/content-search'
import type { ContentSearch } from '@/types/content'

export function listStories(cursor?: string, search: ContentSearch = {}) {
  const params = contentSearchParams(search)
  return request<StoryPage>({
    url: `/stories?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${params ? '&' + params : ''}`,
  })
}
export const getStory = (id: string, auth = true) =>
  request<WishPublicContent>({ url: `/stories/${encodeURIComponent(id)}`, auth })
export function writeStory(wish: WishResult, body: string, update: boolean, key: string) {
  return request<StoryAccepted>({
    url: `/wishes/${encodeURIComponent(wish.id)}/${update ? 'story' : 'stories'}`,
    method: update ? 'PUT' : 'POST',
    // 两类写入都使用心愿聚合版本，不使用审核结果中的故事内容版本。
    data: update
      ? { body, expected_version: wish.version }
      : { body, wish_expected_version: wish.version },
    header: { 'Idempotency-Key': key },
  })
}
export const withdrawStory = (wish: WishResult, key: string) =>
  request<WishResult>({
    url: `/wishes/${encodeURIComponent(wish.id)}/story/withdraw`,
    method: 'POST',
    data: { expected_version: wish.version },
    header: { 'Idempotency-Key': key },
  })
export const createShare = (kind: ShareKind, id: string, key: string) =>
  request<ShareLink>({
    url: '/share-links',
    method: 'POST',
    data: { target_kind: kind, id },
    header: { 'Idempotency-Key': key },
  })
export const resolveShare = (reference: string) =>
  request<ShareTarget>({ url: `/share-links/${encodeURIComponent(reference)}`, auth: false })

export const getShareCode = (reference: string, version: 'develop' | 'trial' | 'release') =>
  request<{ image_base64: string }>({
    url: `/share-links/${encodeURIComponent(reference)}/code?env_version=${version}`,
  })
