import type {
  IdentityInput,
  ModuleConfig,
  NicknameState,
  OwnerPost,
  OwnerComment,
  Tags,
} from '../types/whispers.ts'
import { whisperSchemas } from './whispers-contract.ts'
import { matchesSchema } from './whispers-schema.ts'

export type WhisperTagsDraft = {
  campus: Tags['campus'] | ''
  gender: Tags['gender'] | ''
  grade: string
}

export const whisperStates: Record<OwnerPost['status'] | OwnerComment['status'], string> = {
  draft: '草稿，尚未提交',
  scanning: '安全扫描中',
  review_pending: '等待人工审核',
  published: '已公开',
  rejected: '未通过审核',
  withdrawn: '已撤回，需再次显式提交',
  cancelled: '本次提交已取消',
  restricted: '当前内容受限',
  isolated: '内容已安全隔离',
  privacy_hold: '隐私处理中，正文不可读取',
  context_changed: '原帖上下文已变化，请重新读取原帖',
}
export function whisperText(value: string, min = 1, max = 500) {
  const points = Array.from(value)
  if (
    !value.trim() ||
    points.length < min ||
    points.length > max ||
    points.some((p) => p.length === 1 && p.charCodeAt(0) >= 0xd800 && p.charCodeAt(0) <= 0xdfff)
  )
    throw new Error(`请填写${min}至${max}个Unicode码点的非空白文字。`)
  return value
}
export function semiReady(config: ModuleConfig | null): boolean {
  return !!(
    config?.semi_available &&
    config.grade_dictionary.version &&
    config.grade_dictionary.items.length
  )
}
export function identityFor(
  mode: IdentityInput['mode'],
  tags: WhisperTagsDraft,
  config: ModuleConfig | null,
  nickname: NicknameState | null,
): IdentityInput {
  if (!config?.enabled) throw new Error('树洞尚未开放。')
  if (mode === 'anonymous') return { mode }
  if (mode === 'named') {
    if (!nickname?.active) throw new Error('请先设置并等待树洞昵称审核通过。')
    return { mode, nickname_version: nickname.active.nickname_version }
  }
  if (!semiReady(config) || !config.grade_dictionary.items.some((item) => item.code === tags.grade))
    throw new Error('受控年级资料不可用，请选择可用的匿名方式。')
  const input = {
    mode: 'semi',
    tags: { ...tags },
    dictionary_version: config.grade_dictionary.version!,
  }
  if (!matchesSchema(whisperSchemas.IdentityInput!, input, whisperSchemas))
    throw new Error('请从受控选项选择身份标签。')
  return input as IdentityInput
}
export function mergeWhisperPage<T extends { id: string }>(
  old: T[],
  page: { items: T[]; next_cursor: string | null },
  previous: string | undefined,
  seen: Set<string>,
) {
  const next = page.next_cursor
  if (next !== null && (next === previous || seen.has(next)))
    throw new Error('分页游标重复，请刷新重新读取。')
  if (previous) seen.add(previous)
  const merged = new Map(old.map((item) => [item.id, item]))
  for (const item of page.items) merged.set(item.id, item)
  return { items: [...merged.values()], cursor: next }
}
