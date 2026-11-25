import { ref, computed } from 'vue'
import { session } from '@/utils/session'
import { callWhisper } from '@/api/whispers'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import { identityFor, whisperTagsDraft, whisperText, whisperStates } from '@/utils/whisper-content'
import type { IdentityInput, NicknameState, OwnerPost } from '@/types/whispers'

export function useWhisperPostEditor() {
  const module = useWhispersStore()
  const id = ref('')
  const record = ref<OwnerPost | null>(null)
  const title = ref('')
  const body = ref('')
  const mode = ref<IdentityInput['mode']>('anonymous')
  const tags = ref(whisperTagsDraft())
  const nickname = ref<NicknameState | null>(null)
  const identityNotice = ref('')
  const identityConfirmed = ref(false)
  function clear() {
    record.value = null
    title.value = ''
    body.value = ''
    mode.value = 'anonymous'
    tags.value = whisperTagsDraft()
    nickname.value = null
    identityNotice.value = ''
    identityConfirmed.value = false
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
  const identityChanged = computed(() => {
    const saved = record.value?.identity_input
    if (!saved || saved.mode !== mode.value) return true
    if (saved.mode !== 'semi') return false
    const original = whisperTagsDraft(saved)
    return Object.keys(original).some((key) => {
      const field = key as keyof typeof original
      return original[field] !== tags.value[field]
    })
  })
  const identityNeedsConfirmation = computed(() => {
    const saved = record.value?.identity_input
    if (!saved || identityChanged.value || identityConfirmed.value) return false
    if (saved.mode === 'named')
      return saved.nickname_version !== nickname.value?.active?.nickname_version
    if (saved.mode === 'semi')
      return saved.dictionary_version !== module.config?.grade_dictionary.version
    return false
  })
  const changed = computed(
    () =>
      !record.value ||
      (record.value.title ?? '') !== title.value ||
      (record.value.body ?? '') !== body.value ||
      identityChanged.value ||
      identityConfirmed.value,
  )
  function allowed(action: string) {
    return !!module.config?.enabled && canWhisperAction('OwnerPost', record.value, action)
  }
  function applyRecord(result: OwnerPost) {
    if (id.value && result.id !== id.value) throw new Error('返回的帖子目标不匹配，请刷新。')
    id.value = result.id
    record.value = result
    title.value = result.title ?? ''
    body.value = result.body ?? ''
    const identity = result.identity_input
    mode.value = identity?.mode ?? 'anonymous'
    tags.value = whisperTagsDraft(identity)
    identityConfirmed.value = false
  }
  function accept(result: OwnerPost) {
    applyRecord(result)
    notice.value = whisperStates[result.status]
  }
  function confirmIdentity() {
    if (locked.value || !canSave.value || !identityNeedsConfirmation.value) return
    try {
      identityFor(mode.value, tags.value, module.config, nickname.value)
      identityConfirmed.value = true
      error.value = ''
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '请重新选择身份。'
    }
  }
  function draftFields() {
    return {
      title: title.value,
      body: body.value,
      mode: mode.value,
      tags: { ...tags.value },
      identityConfirmed: identityConfirmed.value,
    }
  }
  function restoreDraft(draft: ReturnType<typeof draftFields>) {
    title.value = draft.title
    body.value = draft.body
    mode.value = draft.mode
    tags.value = draft.tags
    identityConfirmed.value = draft.identityConfirmed
  }
  async function load(preserveDraft = false) {
    if (!session.getToken()) return
    const draft =
      preserveDraft && changed.value ? { ...draftFields(), version: record.value?.version } : null
    await page.read(async (active) => {
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
          applyRecord(result)
          if (
            draft &&
            result.body !== null &&
            canWhisperAction('OwnerPost', result, 'whisperPostUpdate')
          ) {
            restoreDraft({ ...draft, identityConfirmed: false })
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
    if (!canSave.value || locked.value || !changed.value) return
    try {
      if (identityNeedsConfirmation.value) throw new Error('请确认当前身份或重新选择。')
      const data = {
        title: whisperText(title.value, 1, 40),
        body: whisperText(body.value),
        identity: identityFor(mode.value, tags.value, module.config, nickname.value),
      }
      if (record.value) {
        const target = record.value.id
        const epoch = session.getEpoch()
        const draft = draftFields()
        await page.write(
          'whisperPostUpdate',
          {
            path: { post_id: record.value.id },
            data: { ...data, expected_version: record.value.version },
            key: whisperKey(),
          },
          accept,
          async () => {
            await load()
            if (
              session.getEpoch() === epoch &&
              !error.value &&
              record.value?.id === target &&
              record.value.body !== null &&
              canSave.value
            ) {
              // 版本冲突后先读取权威状态，仍有权限时保留输入，由本人再次确认保存。
              restoreDraft({ ...draft, identityConfirmed: false })
            }
          },
        )
      } else await page.write('whisperPostCreate', { data, key: whisperKey() }, accept, load)
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
    identityNeedsConfirmation,
    confirmIdentity,
    changed,
    allowed,
    load,
    save,
    submit,
    withdraw,
    commentsSetting,
  }
}
