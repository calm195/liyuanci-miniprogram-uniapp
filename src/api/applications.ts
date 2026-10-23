import { request } from '@/utils/request'
import type {
  ApplicationPage,
  ApplicationStatus,
  MatchResult,
  WishApplication,
  ProfileContents,
} from '@/types/application'

function query(input: Record<string, string | number | undefined>) {
  const value = Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')
  return value ? `?${value}` : ''
}
export function listMyApplications(
  input: { status?: ApplicationStatus; cursor?: string; limit?: number } = {},
) {
  return request<ApplicationPage>({ url: `/me/applications${query(input)}` })
}
export function listWishApplications(id: string, cursor?: string) {
  return request<ApplicationPage>({
    url: `/wishes/${encodeURIComponent(id)}/applications${query({ cursor })}`,
  })
}
export function applyToWish(id: string, contentVersion: number, message: string, key: string) {
  return request<WishApplication>({
    url: `/wishes/${encodeURIComponent(id)}/applications`,
    method: 'POST',
    data: { message, wish_content_version: contentVersion },
    header: { 'Idempotency-Key': key },
  })
}
export function withdrawApplication(application: WishApplication, key: string) {
  return request<WishApplication>({
    url: `/applications/${encodeURIComponent(application.id)}/withdraw`,
    method: 'POST',
    data: { expected_version: application.version },
    header: { 'Idempotency-Key': key },
  })
}
export function acceptApplication(application: WishApplication, wishVersion: number, key: string) {
  return request<MatchResult>({
    url: `/applications/${encodeURIComponent(application.id)}/accept`,
    method: 'POST',
    data: { expected_version: application.version, wish_expected_version: wishVersion },
    header: { 'Idempotency-Key': key },
  })
}
export function getPublicProfile(id: string, cursor?: string) {
  return request<ProfileContents>({
    url: `/users/${encodeURIComponent(id)}/public-profile${query({ cursor })}`,
  })
}
