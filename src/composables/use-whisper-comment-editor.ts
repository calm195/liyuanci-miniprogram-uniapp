import { computed, ref } from 'vue'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhispersStore } from '@/stores/whispers'
import { useUserStore } from '@/stores/user'
import { readCommentIdentityPreference } from '@/utils/whisper-comment-preference'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import { identityFor, whisperText, whisperStates } from '@/utils/whisper-content'
import type { WhisperTagsDraft } from '@/utils/whisper-content'
import type { IdentityInput, NicknameState, OwnerComment, PublicPost } from '@/types/whispers'

export function useWhisperCommentEditor() {
  const module = useWhispersStore()
  const user = useUserStore()
  const id = ref('')
  const postId = ref('')
  const rootId = ref('')
  const replyId = ref('')
  const record = ref<OwnerComment | null>(null)
  const post = ref<PublicPost | null>(null)
  const body = ref('')
  const mode = ref<IdentityInput['mode']>('anonymous')
  const tags = ref<WhisperTagsDraft>({ campus: '', gender: '', grade: '' })
  const nickname = ref<NicknameState | null>(null)
  const identityNotice = ref('')
  const identitySnapshot = ref<IdentityInput | null>(null)
  const expanded = ref(false)
  const anchor = ref('')
  function clear() {
    record.value = null
    post.value = null
    body.value = ''
    mode.value = 'anonymous'
    tags.value = { campus: '', gender: '', grade: '' }
    nickname.value = null
    identityNotice.value = ''
    identitySnapshot.value = null
    anchor.value = ''
  }
  const page = useWhisperPage(clear)
  const { busy, writing, error, notice, retryReady } = page
  const locked = computed(() => busy.value || writing.value || retryReady.value)
  const canSubmit = computed(
    () =>
      user.validated &&
      !!user.user &&
      !!module.config?.enabled &&
      !!post.value?.comments_open &&
      canWhisperAction('PublicPost', post.value, 'whisperCommentCreate') &&
      (id.value
        ? !!record.value &&
          record.value.post_id === post.value.id &&
          canWhisperAction('OwnerComment', record.value, 'whisperCommentUpdate')
        : true),
  )
  function accept(result: OwnerComment) {
    if ((id.value && result.id !== id.value) || result.post_id !== post.value?.id)
      throw new Error('返回的暖评目标不匹配，请刷新。')
    id.value = result.id
    record.value = result
    body.value = result.body ?? ''
    mode.value = result.identity_input?.mode ?? 'anonymous'
    if (result.identity_input?.mode === 'semi')
      tags.value = { campus: '', gender: '', grade: '', ...result.identity_input.tags }
    notice.value = `请求已受理：${whisperStates[result.status]}；是否公开以当前审核结果为准。`
  }
  async function load(preserveDraft = false) {
    const draft = preserveDraft
      ? {
          body: body.value,
          mode: mode.value,
          tags: { ...tags.value },
          version: record.value?.version,
        }
      : null
    await page.read(async (active) => {
      if (!session.getToken()) throw new Error('请登录后填写暖评，无需学生认证。')
      if (!user.validated || !user.user) throw new Error('账号资料尚未确认，请稍后重试。')
      await module.refresh(false)
      if (!active()) return
      if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
      if (id.value) {
        const own = await callWhisper('whisperOwnCommentGet', { path: { comment_id: id.value } })
        if (!active()) return
        if (own.id !== id.value) throw new Error('本人暖评目标不匹配。')
        record.value = own
        rootId.value = own.root_comment_id ?? ''
        replyId.value = own.reply_to_comment_id ?? ''
        // 已删父帖不采用路由里的替代ID；安全候选只能另选帖子重新填写新评论。
        if (!own.post_id) {
          post.value = null
          body.value = ''
          nickname.value = null
          return
        }
        postId.value = own.post_id
        body.value = own.body ?? ''
        mode.value = own.identity_input?.mode ?? 'anonymous'
        if (own.identity_input?.mode === 'semi')
          tags.value = { campus: '', gender: '', grade: '', ...own.identity_input.tags }
        if (
          draft &&
          own.body !== null &&
          canWhisperAction('OwnerComment', own, 'whisperCommentUpdate')
        ) {
          body.value = draft.body
          mode.value = draft.mode
          tags.value = draft.tags
          if (draft.version !== undefined) record.value = { ...own, version: draft.version }
        }
      }
      const parent = await callWhisper('whisperPostGet', { path: { post_id: postId.value } })
      if (!active()) return
      if (parent.id !== postId.value) throw new Error('父帖目标不匹配。')
      post.value = parent
      try {
        const result = await callWhisper('whisperNicknameGet', {})
        if (active()) nickname.value = result
      } catch {
        if (active()) nickname.value = null
      }
      if (!active()) return
      if (!id.value) {
        const saved = readCommentIdentityPreference(user.user?.id, module.config, nickname.value)
        mode.value = saved.identity.mode
        identitySnapshot.value = saved.identity
        tags.value = {
          campus: '',
          gender: '',
          grade: '',
          ...(saved.identity.mode === 'semi' ? saved.identity.tags : {}),
        }
        identityNotice.value = saved.notice
      } else {
        const original = record.value?.identity_input
        identityNotice.value =
          original?.mode === 'named' &&
          original.nickname_version !== nickname.value?.active?.nickname_version
            ? '原评论昵称已变化，暂不能修改；可以撤回后重新评论。'
            : original?.mode === 'semi' &&
                original.dictionary_version !== module.config?.grade_dictionary.version
              ? '原评论身份标签已变化，暂不能修改；可以撤回后重新评论。'
              : ''
      }
    })
  }
  async function submit() {
    if (locked.value || !canSubmit.value || !post.value) return
    try {
      const original = record.value ? record.value.identity_input : identitySnapshot.value
      // 修改旧评论继续使用原身份，昵称换版不能悄悄改为另一个名字。
      if (record.value && !original) throw new Error('原评论身份暂不可用，请刷新后重试。')
      if (!original) throw new Error('评论身份尚未读取，请刷新后重试。')
      if (
        original?.mode === 'named' &&
        original.nickname_version !== nickname.value?.active?.nickname_version
      )
        throw new Error(
          record.value
            ? '原评论昵称已变化，暂不能修改；可以撤回后重新评论。'
            : '评论身份已变化，请重新读取后再发送。',
        )
      if (
        original?.mode === 'semi' &&
        original.dictionary_version !== module.config?.grade_dictionary.version
      )
        throw new Error(
          record.value
            ? '原评论身份标签已变化，暂不能修改；可以撤回后重新评论。'
            : '评论身份已变化，请重新读取后再发送。',
        )
      const identity = original
        ? identityFor(
            original.mode,
            {
              campus: '',
              gender: '',
              grade: '',
              ...(original.mode === 'semi' ? original.tags : {}),
            },
            module.config,
            nickname.value,
          )
        : identityFor(mode.value, tags.value, module.config, nickname.value)
      const data = {
        body: whisperText(body.value),
        identity,
        expected_post_version: post.value.version,
        expected_comments_epoch: post.value.comments_epoch,
        ...(rootId.value
          ? { root_comment_id: rootId.value, reply_to_comment_id: replyId.value }
          : {}),
      }
      if (record.value)
        await page.write(
          'whisperCommentUpdate',
          {
            path: { comment_id: record.value.id },
            data: { ...data, expected_version: record.value.version },
            key: whisperKey(),
          },
          accept,
          load,
        )
      else
        await page.write(
          'whisperCommentCreate',
          {
            path: { post_id: post.value.id },
            data,
            key: whisperKey(),
          },
          accept,
          load,
        )
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '请核对暖评与身份选择。'
    }
  }

  async function open(target: { postId: string; id?: string; rootId?: string; replyId?: string }) {
    expanded.value = true
    if (locked.value) return
    const same =
      postId.value === target.postId &&
      id.value === (target.id ?? '') &&
      rootId.value === (target.rootId ?? '') &&
      replyId.value === (target.replyId ?? '')
    if (same && post.value) return
    if (body.value.trim() && body.value !== (record.value?.body ?? '')) {
      const confirmed = await new Promise<boolean>((resolve) =>
        uni.showModal({
          title: '保留当前回复？',
          content: '切换回复对象会放弃当前未发送内容。',
          confirmText: '放弃并切换',
          cancelText: '继续编辑',
          success: (result) => resolve(result.confirm),
          fail: () => resolve(false),
        }),
      )
      if (!confirmed || locked.value) return
    }
    page.reset()
    id.value = target.id ?? ''
    postId.value = target.postId
    rootId.value = target.rootId ?? ''
    replyId.value = target.replyId ?? ''
    await load()
  }
  function setAnchor(value: string) {
    anchor.value = value
  }
  function close() {
    expanded.value = false
  }
  page.onRefresh(() => (expanded.value ? load(true) : Promise.resolve()))
  return {
    module,
    id,
    postId,
    rootId,
    replyId,
    record,
    post,
    body,
    mode,
    tags,
    nickname,
    identityNotice,
    expanded,
    anchor,
    setAnchor,
    page,
    busy,
    writing,
    error,
    notice,
    retryReady,
    locked,
    canSubmit,
    open,
    close,
    load,
    submit,
  }
}
