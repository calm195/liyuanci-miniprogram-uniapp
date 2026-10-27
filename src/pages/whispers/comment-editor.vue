<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import WhisperIdentity from '@/components/WhisperIdentity.vue'
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import { identityFor, whisperText, whisperStates } from '@/utils/whisper-content'
import type { WhisperTagsDraft } from '@/utils/whisper-content'
import type { IdentityInput, NicknameState, OwnerComment, PublicPost } from '@/types/whispers'
const module = useWhispersStore()
const id = ref('')
const postId = ref('')
const record = ref<OwnerComment | null>(null)
const post = ref<PublicPost | null>(null)
const body = ref('')
const mode = ref<IdentityInput['mode']>('anonymous')
const tags = ref<WhisperTagsDraft>({ campus: '', gender: '', grade: '' })
const nickname = ref<NicknameState | null>(null)
const identityNotice = ref('')
function clear() {
  record.value = null
  post.value = null
  body.value = ''
  mode.value = 'anonymous'
  tags.value = { campus: '', gender: '', grade: '' }
  nickname.value = null
  identityNotice.value = ''
}
const page = useWhisperPage(clear)
const { busy, writing, error, notice, retryReady } = page
const locked = computed(() => busy.value || writing.value || retryReady.value)
const canSubmit = computed(
  () =>
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
  if (result.identity_input?.mode === 'semi') tags.value = { ...result.identity_input.tags }
  notice.value = `请求已受理：${whisperStates[result.status]}；是否公开以当前审核结果为准。`
}
async function load() {
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后填写暖评，无需学生认证。')
    await module.refresh(false)
    if (!active()) return
    if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
    if (id.value) {
      const own = await callWhisper('whisperOwnCommentGet', { path: { comment_id: id.value } })
      if (!active()) return
      if (own.id !== id.value) throw new Error('本人暖评目标不匹配。')
      record.value = own
      // 已删父帖不采用路由里的替代ID；安全候选只能另选帖子重新填写新评论。
      if (!own.post_id) return
      postId.value = own.post_id
      body.value = own.body ?? ''
      mode.value = own.identity_input?.mode ?? 'anonymous'
      if (own.identity_input?.mode === 'semi') tags.value = { ...own.identity_input.tags }
    }
    const parent = await callWhisper('whisperPostGet', { path: { post_id: postId.value } })
    if (!active()) return
    if (parent.id !== postId.value) throw new Error('父帖目标不匹配。')
    post.value = parent
    try {
      const result = await callWhisper('whisperNicknameGet', {})
      if (active()) nickname.value = result
    } catch {
      if (active()) identityNotice.value = '昵称资料暂不可读取，可选择其他可用匿名方式。'
    }
  })
}
async function submit() {
  if (locked.value || !canSubmit.value || !post.value) return
  try {
    const data = {
      body: whisperText(body.value),
      identity: identityFor(mode.value, tags.value, module.config, nickname.value),
      expected_post_version: post.value.version,
      expected_comments_epoch: post.value.comments_epoch,
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
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
  postId.value = typeof query?.postId === 'string' ? query.postId : ''
})
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">{{ id ? '修改我的暖评' : '写一条暖评' }}</text>
    <navigator url="/pages/whispers/help">解忧与公共援助（离开会清空未提交文字）</navigator>
    <navigator url="/pages/whispers/mine">我的记录</navigator>
    <button :disabled="locked" @click="runPageAction(load)">刷新上下文（清空未提交修改）</button>
    <view v-if="post" class="card"><text>当前父帖</text><WhisperContent :content="post" /></view>
    <text v-if="record">{{ whisperStates[record.status] }}</text>
    <text v-if="record?.review_result?.reason">原因：{{ record.review_result.reason }}</text>
    <text v-if="record?.review_result?.revision_suggestion"
      >建议：{{ record.review_result.revision_suggestion }}</text
    >
    <text v-if="record && post && record.parent_content_version !== post.content_version"
      >父帖正文已变化，请阅读当前内容后自行改写并显式重提；旧暖评不会自动挂到新文下。</text
    >
    <view v-if="record && !record.post_id">
      <text>原帖已不可用，不能修改旧暖评或恢复旧串。</text>
      <view v-if="record.recovery_body"
        ><text>受控脱敏后的安全候选：</text
        ><text class="whitespace-pre-wrap">{{ record.recovery_body }}</text></view
      >
      <navigator url="/pages/whispers/index">另选当前公开帖子，重新填写新暖评</navigator>
    </view>
    <text v-else-if="post && !post.comments_open"
      >评论已关闭，只能阅读已公开合规暖评；恢复后不会自动补发已取消项。</text
    >
    <view v-if="canSubmit">
      <textarea
        v-model="body"
        :maxlength="-1"
        :disabled="locked"
        placeholder="单层暖评，不支持回复树或@，最多500个Unicode码点"
        placeholder-class="field-placeholder"
      />
      <text>{{ Array.from(body).length }} / 500</text>
      <WhisperIdentity
        v-model:mode="mode"
        v-model:tags="tags"
        :config="module.config"
        :nickname="nickname"
        :disabled="locked"
      />
      <text
        >文字仅在本页内存保留，不自动保存；提交即进入审核，审核合格后自动公开。修改会先隐藏旧暖评并重新审核。</text
      >
      <button :disabled="locked" @click="runPageAction(submit)">
        {{ id ? '修改并重新送审' : '提交暖评审核' }}
      </button>
    </view>
    <text v-if="identityNotice">{{ identityNotice }}</text>
    <button v-if="retryReady" :disabled="writing" @click="runPageAction(page.retry)">
      使用原请求重试
    </button>
    <text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
