import type { ResourceFeedbackKind, ResourcePage } from '../types/resource.ts'
import type { UserInfo } from '../types/api.ts'
export const resourceFeedbackChoices: { kind: ResourceFeedbackKind; label: string }[] = [
  { kind: 'valid', label: '有效' },
  { kind: 'link_invalid', label: '链接失效' },
  { kind: 'outdated', label: '年代久远' },
  { kind: 'incomplete', label: '不全' },
]
// 本人接口没有独立处罚枚举；本地认证只作前置条件，当前资料读权仍由资料 API 决定。
export function resourceGate(
  user: UserInfo | null,
  validated: boolean,
  token: string,
  mock: boolean,
): string {
  if (mock) return '资料广场需连接真实服务，合成模式不可读取资料。'
  if (!token || !user) return '登录后完成学生认证，即可查看资料。'
  if (!validated) return '当前资格尚未校验，请刷新重试。'
  return {
    unverified: '请先完成学生认证。',
    pending: '学生认证审核中，通过后即可查看资料。',
    rejected: '学生认证未通过，请查看原因并重新提交。',
    verified: '',
  }[user.verification]
}
export function mergeResourcePage<T extends { id: string }>(
  old: T[],
  page: ResourcePage<T>,
  previous: string | undefined,
  seen: Set<string>,
): T[] {
  if (page.next_cursor && (page.next_cursor === previous || seen.has(page.next_cursor)))
    throw new Error('分页状态异常，请重新查询。')
  if (page.next_cursor && !page.items.length) throw new Error('分页状态异常，请重新查询。')
  if (page.next_cursor) seen.add(page.next_cursor)
  const result = [...old]
  for (const item of page.items) {
    const index = result.findIndex((row) => row.id === item.id)
    if (index < 0) result.push(item)
    else result[index] = item
  }
  return result
}
export function resourceCommandKey(): string {
  // 幂等键用于区分命令，不承担认证或密码用途。
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16)
    return (c === 'x' ? n : (n & 3) | 8).toString(16)
  })
}
