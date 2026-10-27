<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import WhisperIdentity from '@/components/WhisperIdentity.vue'
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { session } from '@/utils/session'
import { callWhisper } from '@/api/whispers'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import type { WhisperTagsDraft } from '@/utils/whisper-content'
import { identityFor, whisperText, whisperStates } from '@/utils/whisper-content'
import type { IdentityInput, NicknameState, OwnerPost } from '@/types/whispers'
const module = useWhispersStore()
const id = ref('')
const record = ref<OwnerPost | null>(null)
const body = ref('')
const mode = ref<IdentityInput['mode']>('anonymous')
const tags = ref<WhisperTagsDraft>({ campus: '', gender: '', grade: '' })
const nickname = ref<NicknameState | null>(null)
const identityNotice = ref('')
function clear() {
  record.value = null
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
    if (record.value.body !== body.value || !saved || saved.mode !== current.mode) return true
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
  body.value = result.body ?? ''
  const identity = result.identity_input
  mode.value = identity?.mode ?? 'anonymous'
  if (identity?.mode === 'semi') tags.value = { ...identity.tags }
  notice.value = whisperStates[result.status]
}
async function load() {
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
      if (active()) accept(result)
    }
  })
}
async function save() {
  if (!canSave.value || locked.value) return
  try {
    const data = {
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
    error.value = '请先保存当前正文与身份选择，再单独提交审核。'
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
      data: { expected_version: record.value.version, comments_open: !record.value.comments_open },
      key: whisperKey(),
    },
    accept,
    load,
  )
}
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
})
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">{{ id ? '管理我的树洞' : '写一篇树洞' }}</text>
    <navigator url="/pages/whispers/help">解忧与公共援助（离开会清空未保存正文）</navigator>
    <navigator url="/pages/whispers/mine">我的记录</navigator>
    <button :disabled="locked" @click="runPageAction(load)">刷新状态（清空未保存修改）</button>
    <text v-if="record">{{ whisperStates[record.status] }}</text>
    <text v-if="record?.review_result?.reason">审核原因：{{ record.review_result.reason }}</text>
    <text v-if="record?.review_result?.revision_suggestion"
      >修改建议：{{ record.review_result.revision_suggestion }}</text
    >
    <text v-if="!id && module.workspace?.verification !== 'verified'">发帖需要有效学生认证。</text>
    <navigator
      v-if="!id && module.workspace?.verification !== 'verified'"
      url="/pages/verification/index"
      >学生认证</navigator
    >
    <view v-if="canSave" class="card">
      <textarea
        v-model="body"
        :maxlength="-1"
        :disabled="locked"
        placeholder="写下你的心事，最多500个Unicode码点"
        placeholder-class="field-placeholder"
      />
      <text>{{ Array.from(body).length }} / 500</text>
      <text
        >不自动保存到本地；保存草稿不会公开。公开后改稿会立即撤下整帖与评论读取，需重新提交审核。</text
      >
    </view>
    <text v-else-if="record?.body" class="whitespace-pre-wrap">{{ record.body }}</text>
    <WhisperIdentity
      v-if="canSave"
      v-model:mode="mode"
      v-model:tags="tags"
      :config="module.config"
      :nickname="nickname"
      :disabled="locked"
    />
    <text v-if="identityNotice">{{ identityNotice }}</text>
    <button v-if="canSave" :disabled="locked" @click="runPageAction(save)">
      保存草稿（不会提交）
    </button>
    <text v-if="allowed('whisperPostSubmit')">提交即授权：当前版本审核合格后自动公开。</text>
    <button v-if="allowed('whisperPostSubmit')" :disabled="locked" @click="runPageAction(submit)">
      显式提交审核
    </button>
    <button
      v-if="allowed('whisperPostWithdraw')"
      :disabled="locked"
      @click="runPageAction(withdraw)"
    >
      撤回帖子
    </button>
    <button
      v-if="allowed('whisperCommentsSetting')"
      :disabled="locked"
      @click="runPageAction(commentsSetting)"
    >
      {{ record?.comments_open ? '关闭评论' : '恢复评论' }}
    </button>
    <text v-if="record">关闭评论保留已公开合规评论只读，恢复不会补发已取消评论。</text>
    <button
      v-if="retryReady"
      :disabled="(locked && !retryReady) || writing"
      @click="runPageAction(page.retry)"
    >
      使用原请求重试
    </button>
    <text v-if="busy">加载中…</text><text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
