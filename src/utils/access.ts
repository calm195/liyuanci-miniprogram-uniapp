import { canMeAction } from './actions.ts'
import type { UserInfo } from '../types/api.ts'
// 学生认证只是必要条件；具体动作还须由服务端允许列表授权。
export function canAct(me: UserInfo | null, action: string): boolean {
  return me?.verification === 'verified' && canMeAction(me, me.id, action, true)
}
export function verificationLabel(me: UserInfo | null): string {
  if (!me) return '未登录'
  return { unverified: '未认证', pending: '审核中', rejected: '认证已驳回', verified: '已认证' }[
    me.verification
  ]
}
