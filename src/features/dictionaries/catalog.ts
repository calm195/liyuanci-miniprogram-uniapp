import { shallowRef } from 'vue'
export interface DictionaryItem {
  type: string
  code: string
  label: string
  sort_order: number
  enabled: boolean
}
export interface DictionarySnapshot {
  version: number
  items: DictionaryItem[]
}
const snapshot = shallowRef<DictionarySnapshot>({ version: 0, items: [] })
// 仅接受完整且无重复编码的快照，避免部分损坏的数据覆盖上次可用版本。
export function parseDictionaries(value: unknown): DictionarySnapshot {
  if (!value || typeof value !== 'object') throw new Error('字典资料格式无效')
  const data = value as Record<string, unknown>
  if (!Number.isSafeInteger(data.version) || Number(data.version) < 1 || !Array.isArray(data.items))
    throw new Error('字典资料格式无效')
  const keys = new Set<string>()
  const items = data.items.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('字典条目格式无效')
    const item = value as Record<string, unknown>
    if (
      typeof item.type !== 'string' ||
      !/^[a-z0-9_]+$/.test(item.type) ||
      typeof item.code !== 'string' ||
      !/^[a-z0-9_]+$/.test(item.code) ||
      typeof item.label !== 'string' ||
      !item.label.trim() ||
      Array.from(item.label).length > 80 ||
      !Number.isSafeInteger(item.sort_order) ||
      Number(item.sort_order) < 0 ||
      Number(item.sort_order) > 100000 ||
      typeof item.enabled !== 'boolean'
    )
      throw new Error('字典条目格式无效')
    const key = `${item.type}:${item.code}`
    if (keys.has(key)) throw new Error('字典编码重复')
    keys.add(key)
    return {
      type: item.type,
      code: item.code,
      label: item.label,
      sort_order: Number(item.sort_order),
      enabled: item.enabled,
    }
  })
  return { version: Number(data.version), items }
}
export function replaceDictionaries(value: DictionarySnapshot) {
  if (value.version >= snapshot.value.version) snapshot.value = value
}
export function dictionaryLabel(type: string, code: string, fallback = '名称暂不可用'): string {
  return (
    snapshot.value.items.find((item) => item.type === type && item.code === code)?.label ?? fallback
  )
}
export function dictionaryItems(type: string): DictionaryItem[] {
  return snapshot.value.items
    .filter((item) => item.type === type)
    .sort((a, b) => a.sort_order - b.sort_order)
}
