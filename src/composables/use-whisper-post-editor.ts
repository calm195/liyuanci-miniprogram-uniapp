import { ref, computed } from 'vue'
import { session } from '@/utils/session'
import { callWhisper } from '@/api/whispers'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import type { WhisperTagsDraft } from '@/utils/whisper-content'
import { identityFor, whisperText, whisperStates } from '@/utils/whisper-content'
import type { IdentityInput, NicknameState, OwnerPost } from '@/types/whispers'

export function useWhisperPostEditor() {
  const module = useWhispersStore()
  const id = ref('')
  const record = ref<OwnerPost | null>(null)
  const title = ref('')
  const body = ref('')
  const mode = ref<IdentityInput['mode']>('anonymous')
  const tags = ref<WhisperTagsDraft>({ campus: '', gender: '', grade: '' })
  const nickname = ref<NicknameState | null>(null)
  const identityNotice = ref('')
  function clear() {
    record.value = null
    title.value = ''
    body.value = ''
    mode.value = 'anonymous'
    tags.value = { campus: '', gender: '', grade: '' }
    nickname.value = null
    identityNotice.value = ''
  }
  const page = useWhisperPage(clear)
  const { busy, writing, error, notice, retryReady } = page
  const locked = computed(() => busy.value || writing.value || retryReady.value)
  const canSave = computed(
    () =>
      !!module.config?.enabled &&
      (id.value
        ? canWhisperAction('OwnerPost', record.value, 'whisperPostUpdate')
        : canWhisperAction('Workspace', module.workspace, 'whisperPostCreate')),
  )
  const changed = computed(() => {
    if (!record.value) return true
    try {
      const saved = record.value.identity_input
      const current = identityFor(mode.value, tags.value, module.config, nickname.value)
      if (
        record.value.title !== title.value ||
        record.value.body !== body.value ||
        !saved ||
        saved.mode !== current.mode
      )
        return true
      if (saved.mode === 'named' && current.mode === 'named')
        return saved.nickname_version !== current.nickname_version
      if (saved.mode === 'semi' && current.mode === 'semi')
        return (
          saved.dictionary_version !== current.dictionary_version ||
          saved.tags.campus !== current.tags.campus ||
          saved.tags.gender !== current.tags.gender ||
          saved.tags.grade !== current.tags.grade
        )
      return false
    } catch {
      return true
    }
  })
  function allowed(action: string) {
    return !!module.config?.enabled && canWhisperAction('OwnerPost', record.value, action)
  }
  function accept(result: OwnerPost) {
    if (id.value && result.id !== id.value) throw new Error('返回的帖子目标不匹配，请刷新。')
    id.value = result.id
    record.value = result
    title.value = result.title ?? ''
    body.value = result.body ?? ''
    const identity = result.identity_input
    mode.value = identity?.mode ?? 'anonymous'
    if (identity?.mode === 'semi') tags.value = { ...identity.tags }
    notice.value = whisperStates[result.status]
  }
  async function load(preserveDraft = false) {
    const draft =
      preserveDraft && changed.value
        ? {
            title: title.value,
            body: body.value,
            mode: mode.value,
            tags: { ...tags.value },
            version: record.value?.version,
          }
        : null
    await page.read(async (active) => {
      if (!session.getToken()) throw new Error('请登录后编辑自己的帖子。')
      await module.refresh()
      if (!active()) return
      if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
      try {
        const result = await callWhisper('whisperNicknameGet', {})
        if (active()) nickname.value = result
      } catch {
        if (active()) identityNotice.value = '昵称资料暂不可读取，仍可选择可用的匿名方式。'
      }
      if (!active()) return
      if (id.value) {
        const result = await callWhisper('whisperOwnPostGet', { path: { post_id: id.value } })
        if (active()) {
          accept(result)
          if (
            draft &&
            result.body !== null &&
            canWhisperAction('OwnerPost', result, 'whisperPostUpdate')
          ) {
            title.value = draft.title
            body.value = draft.body
            mode.value = draft.mode
            tags.value = draft.tags
            if (draft.version !== undefined && draft.version !== result.version) {
              record.value = { ...result, version: draft.version }
              notice.value = '帖子已有更新，已保留你的输入。保存时将核对原版本。'
            }
          }
        }
      }
    })
  }
  async function save() {
    if (!canSave.value || locked.value) return
    try {
      const data = {
        title: whisperText(title.value, 1, 40),
        body: whisperText(body.value),
        identity: identityFor(mode.value, tags.value, module.config, nickname.value),
      }
      if (record.value)
        await page.write(
          'whisperPostUpdate',
          {
            path: { post_id: record.value.id },
            data: { ...data, expected_version: record.value.version },
            key: whisperKey(),
          },
          accept,
          load,
        )
      else await page.write('whisperPostCreate', { data, key: whisperKey() }, accept, load)
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '请核对输入。'
    }
  }
  async function submit() {
    if (!record.value || !allowed('whisperPostSubmit') || locked.value) return
    if (changed.value) {
      error.value = '请先保存当前标题、正文与身份选择，再单独提交审核。'
      return
    }
    await page.write(
      'whisperPostSubmit',
      {
        path: { post_id: record.value.id },
        data: { expected_version: record.value.version },
        key: whisperKey(),
      },
      accept,
      load,
    )
  }
  async function withdraw() {
    if (!record.value || !allowed('whisperPostWithdraw') || locked.value) return
    await page.write(
      'whisperPostWithdraw',
      {
        path: { post_id: record.value.id },
        data: { expected_version: record.value.version },
        key: whisperKey(),
      },
      accept,
      load,
    )
  }
  async function commentsSetting() {
    if (!record.value || !allowed('whisperCommentsSetting') || locked.value) return
    await page.write(
      'whisperCommentsSetting',
      {
        path: { post_id: record.value.id },
        data: {
          expected_version: record.value.version,
          comments_open: !record.value.comments_open,
        },
        key: whisperKey(),
      },
      accept,
      load,
    )
  }

  return {
    module,
    id,
    record,
    title,
    body,
    mode,
    tags,
    nickname,
    identityNotice,
    page,
    busy,
    writing,
    error,
    notice,
    retryReady,
    locked,
    canSave,
    changed,
    allowed,
    load,
    save,
    submit,
    withdraw,
    commentsSetting,
  }
}
