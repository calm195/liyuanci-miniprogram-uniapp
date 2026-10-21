import type { Session, UserInfo, Verification } from '@/types/api'
import { request } from '@/utils/request'
export function login(code: string, clientRequestId: string) {
  return request<Session>({
    url: '/auth/wechat-sessions',
    method: 'POST',
    data: { code, client_request_id: clientRequestId },
    auth: false,
  })
}
export const getMe = () => request<UserInfo>({ url: '/me' })
export const getVerification = (silent = false) =>
  request<Verification>({ url: '/me/verification-request', silent })
export const revokeSession = (key: string) =>
  request<void>({ url: '/auth/session', method: 'DELETE', header: { 'Idempotency-Key': key } })
export function wechatCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (result) =>
        result.code ? resolve(result.code) : reject(new Error('微信未返回临时 code，请重试')),
      fail: () => reject(new Error('微信登录未完成，请重试')),
    })
  })
}
