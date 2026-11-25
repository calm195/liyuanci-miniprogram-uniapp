import { config } from '@/config'
import { identityFor, whisperTagsDraft } from '@/utils/whisper-content'
import type { WhisperTagsDraft } from '@/utils/whisper-content'
import { matchesSchema } from '@/utils/whispers-schema'
import { whisperSchemas } from '@/utils/whispers-contract-extensions'
import type { IdentityInput, ModuleConfig, NicknameState } from '@/types/whispers'

function preferenceKey(owner: string) {
  return `liyuanci:comment-identity:${encodeURIComponent(config.apiBaseUrl)}:${encodeURIComponent(owner)}`
}
export function readCommentIdentityPreference(
  owner: string | undefined,
  module: ModuleConfig | null,
  nickname: NicknameState | null,
): { identity: IdentityInput; notice: string } {
  const anonymous = { identity: { mode: 'anonymous' } as IdentityInput, notice: '' }
  if (!owner) return anonymous
  try {
    const raw: unknown = uni.getStorageSync(preferenceKey(owner))
    if (raw === '' || raw === undefined || raw === null) return anonymous
    if (typeof raw !== 'string') throw new Error('身份设置格式无效')
    const saved = JSON.parse(raw) as { version?: unknown; identity?: IdentityInput }
    if (
      saved.version !== 1 ||
      !matchesSchema(whisperSchemas.IdentityInput!, saved.identity, whisperSchemas)
    )
      throw new Error('身份设置格式无效')
    const identity = saved.identity!
    // 字典或昵称变更须回设置页重新确认，不能静默换成另一组公开资料。
    if (
      (identity.mode === 'named' &&
        identity.nickname_version !== nickname?.active?.nickname_version) ||
      (identity.mode === 'semi' && identity.dictionary_version !== module?.grade_dictionary.version)
    )
      throw new Error('身份设置已变化')
    return {
      identity: identityFor(identity.mode, whisperTagsDraft(identity), module, nickname),
      notice: '',
    }
  } catch {
    return {
      ...anonymous,
      notice: '已保存的评论身份暂不可用，本次使用完全匿名。请到悄悄话设置重新确认。',
    }
  }
}

export function saveCommentIdentityPreference(
  owner: string | undefined,
  mode: IdentityInput['mode'],
  tags: WhisperTagsDraft,
  module: ModuleConfig | null,
  nickname: NicknameState | null,
) {
  if (!owner) throw new Error('请登录后保存评论身份。')
  const identity = identityFor(mode, tags, module, nickname)
  try {
    uni.setStorageSync(preferenceKey(owner), JSON.stringify({ version: 1, identity }))
  } catch {
    throw new Error('评论身份未能保存到本机，请重试。')
  }
  return identity
}
