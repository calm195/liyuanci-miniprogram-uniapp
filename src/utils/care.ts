import type { CareCard } from '../types/care.ts'
import type { AppNotification, NotificationPage } from '../types/chat.ts'

export function careTarget(item: AppNotification): string | null {
  return item.kind === 'crisis_care' &&
    typeof item.target_ref === 'string' &&
    item.target_ref.trim()
    ? item.target_ref
    : null
}
export function mergeCareNotifications(previous: AppNotification[], page: NotificationPage) {
  if (
    !page ||
    !Array.isArray(page.items) ||
    (page.next_cursor !== null && (typeof page.next_cursor !== 'string' || !page.next_cursor))
  )
    throw new Error('关怀通知列表格式异常')
  const items = new Map(previous.map((item) => [item.id, item]))
  for (const item of page.items) {
    if (!item || typeof item.id !== 'string' || !item.id) throw new Error('关怀通知格式异常')
    if (careTarget(item)) items.set(item.id, item)
  }
  return [...items.values()]
}
export function projectCareCard(value: CareCard, id: string): CareCard {
  if (!value || value.id !== id || !value.resources) throw new Error('关怀卡片不匹配')
  const fields = [
    'version',
    'source',
    'verified_at',
    'hotline_24_hours',
    'appointment',
    'notice',
  ] as const
  for (const field of fields) {
    const text = value.resources[field]
    if (typeof text !== 'string' || !text.trim()) throw new Error('关怀资料不完整')
  }
  const date = value.resources.verified_at
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error('关怀资料核验日期异常')
  // 显式投影允许展示的字段，忽略意外返回的身份、正文或案件字段。
  const { version, source, verified_at, hotline_24_hours, appointment, notice } = value.resources
  return { id, resources: { version, source, verified_at, hotline_24_hours, appointment, notice } }
}
