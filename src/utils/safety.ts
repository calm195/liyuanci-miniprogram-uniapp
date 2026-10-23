import type { SafetyPage, Warning, SafetyAccepted } from '../types/safety.ts'

// 游标是不透明值；按当前主体逐页核验，拒绝重复游标和畸形投影。
export async function findSafetyItem<T>(
  read: (cursor?: string) => Promise<SafetyPage<T>>,
  match: (item: T) => boolean,
  current: () => boolean,
): Promise<T | null> {
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    if (!current()) return null
    const page = await read(cursor)
    if (!current()) return null
    checkSafetyPage(page)
    const item = page.items.find(match)
    if (item) return item
    if (!page.next_cursor) return null
    if (seen.has(page.next_cursor)) throw new Error('列表游标异常，请重新读取')
    seen.add(page.next_cursor)
    cursor = page.next_cursor
  } while (cursor)
  return null
}
export function checkSafetyPage<T>(page: SafetyPage<T>) {
  if (
    !page ||
    !Array.isArray(page.items) ||
    !(
      page.next_cursor === null ||
      (typeof page.next_cursor === 'string' && page.next_cursor.length > 0)
    )
  )
    throw new Error('列表数据异常，请重新读取')
}
export function validWarning(w: Warning): boolean {
  return (
    !!w &&
    typeof w.id === 'string' &&
    !!w.id &&
    Number.isSafeInteger(w.version) &&
    w.version > 0 &&
    typeof w.notice === 'string' &&
    Number.isFinite(Date.parse(w.server_now)) &&
    Number.isInteger(w.remaining_seconds) &&
    w.remaining_seconds >= 0 &&
    w.remaining_seconds <= 30 &&
    ((w.first_displayed_at === null && w.confirmable_at === null && w.remaining_seconds === 30) ||
      (typeof w.first_displayed_at === 'string' &&
        typeof w.confirmable_at === 'string' &&
        Number.isFinite(Date.parse(w.first_displayed_at)) &&
        Number.isFinite(Date.parse(w.confirmable_at)) &&
        Date.parse(w.confirmable_at) - Date.parse(w.first_displayed_at) >= 30000 &&
        (w.remaining_seconds !== 0 || Date.parse(w.server_now) >= Date.parse(w.confirmable_at))))
  )
}
export function warningConfirmable(w: Warning): boolean {
  // 本地倒数只辅助展示；允许确认必须来自服务端已到时的投影。
  return (
    validWarning(w) &&
    !!w.first_displayed_at &&
    !!w.confirmable_at &&
    w.remaining_seconds === 0 &&
    !w.acknowledged_at
  )
}
export function acceptedSafety(value: SafetyAccepted): boolean {
  return (
    !!value &&
    typeof value.id === 'string' &&
    !!value.id &&
    Number.isSafeInteger(value.version) &&
    value.version > 0 &&
    value.status === 'pending'
  )
}
