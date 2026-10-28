import type { Capsule, CapsuleSummary } from '../types/whispers.ts'

export const capsuleStates: Record<Capsule['status'], string> = {
  scanning: '安全扫描中',
  review_pending: '等待人工审核',
  locked: '尚未解锁',
  unlocked: '已解锁',
  rejected: '未通过审核',
  isolated: '安全隔离中',
  cancelled: '已取消',
  deleted: '已删除',
}
// 固定使用北京时间，不随设备时区改变；输入和协议均精确到秒。
export function beijingTime(utc: string): string {
  const instant = Date.parse(utc)
  if (!Number.isFinite(instant)) throw new Error('服务端时间不可用，请刷新。')
  return new Date(instant + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
}
export function capsuleUnlockAt(local: string, serverNow: number): string {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(local))
    throw new Error('请选择完整的北京时间，秒数为00至59。')
  const instant = Date.parse(local.replace(' ', 'T') + '+08:00')
  if (!Number.isFinite(instant) || beijingTime(new Date(instant).toISOString()) !== local)
    throw new Error('预约日期或时间无效。')
  const delay = instant / 1000 - Math.floor(serverNow / 1000)
  if (!Number.isFinite(delay) || delay < 60 || delay > 31536000)
    throw new Error('预约须在服务端当前时间60秒至365天内，最终以服务端校验为准。')
  return new Date(instant).toISOString().replace('.000Z', 'Z')
}
export function capsuleStatus(item: Capsule | CapsuleSummary): string {
  if (
    ['scanning', 'review_pending', 'locked'].includes(item.status) &&
    Date.parse(item.server_now) >= Date.parse(item.unlock_at)
  )
    return '已到时间，等待安全处理，请刷新当前状态'
  return capsuleStates[item.status]
}
