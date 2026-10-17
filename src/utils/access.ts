import type { UserInfo } from '../types/api.ts'
// T009 / REQ-002：认证只是必要条件；动作名称由服务端允许列表提供。
export function canAct(me: UserInfo | null, action: string): boolean {
  return me?.verification === 'verified' && me.allowed_actions.includes(action)
}
export function verificationLabel(me: UserInfo | null): string {
  if (!me) return '未登录'
  return { unverified: '未认证', pending: '审核中', rejected: '认证已驳回', verified: '已认证' }[
    me.verification
  ]
}
