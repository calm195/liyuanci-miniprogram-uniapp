// 服务端统一返回带时区标记的 UTC 时间字符串，展示前必须换算成北京时间。
// 本模块区分两类函数：beijingTime 用于计算与校验，出错即抛；display* 用于展示，永不抛异常。
const BEIJING_OFFSET_MS = 8 * 3600000
const DAY_MS = 86400000
// 字段缺失或格式异常时展示的占位符，避免页面出现空白或报错。
const PLACEHOLDER = '—'

type TimeInput = string | null | undefined

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

// 解析失败返回 null，由调用方决定是抛错还是降级展示。
function toInstant(value: TimeInput): number | null {
  if (!value) return null
  const instant = Date.parse(value)
  return Number.isFinite(instant) ? instant : null
}

// 统一按东八区取值，不依赖设备时区，保证不同设备显示一致。
function beijingParts(instant: number) {
  const shifted = new Date(instant + BEIJING_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  }
}

// 北京时间当天零点的时刻，用于判断「今天」「昨天」跨日边界。
function beijingDayStart(instant: number): number {
  const parts = beijingParts(instant)
  return Date.UTC(parts.year, parts.month - 1, parts.day) - BEIJING_OFFSET_MS
}

function clock(parts: ReturnType<typeof beijingParts>): string {
  return `${pad(parts.hour)}:${pad(parts.minute)}`
}

// 严格版：时间不可用时抛错，供需要中断流程的校验场景使用。
export function beijingTime(utc: string): string {
  const instant = toInstant(utc)
  if (instant === null) throw new Error('服务端时间不可用，请刷新。')
  const parts = beijingParts(instant)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${clock(parts)}:${pad(parts.second)}`
}

// 展示版：完整日期与时分，字段缺失时显示占位符。
export function displayTime(value: TimeInput): string {
  const instant = toInstant(value)
  if (instant === null) return PLACEHOLDER
  const parts = beijingParts(instant)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${clock(parts)}`
}

// 展示版：只保留日期，供核验日期、更新日期等只要年月日的字段使用。
export function displayDate(value: TimeInput): string {
  const instant = toInstant(value)
  if (instant === null) return PLACEHOLDER
  const parts = beijingParts(instant)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

// 展示版：按与当前时间的距离选择说法，消息列表等高频阅读场景使用。
// now 可注入，便于测试跨日与跨年边界。
export function displayFriendly(value: TimeInput, now: number = Date.now()): string {
  const instant = toInstant(value)
  if (instant === null) return PLACEHOLDER
  const parts = beijingParts(instant)
  const dayDiff = Math.round((beijingDayStart(now) - beijingDayStart(instant)) / DAY_MS)
  // 当天与前一天给相对说法，更远的日期直接给绝对日期。
  if (dayDiff === 0) return clock(parts)
  if (dayDiff === 1) return `昨天 ${clock(parts)}`
  if (parts.year === beijingParts(now).year) return `${parts.month}月${parts.day}日 ${clock(parts)}`
  return `${parts.year}年${parts.month}月${parts.day}日 ${clock(parts)}`
}
