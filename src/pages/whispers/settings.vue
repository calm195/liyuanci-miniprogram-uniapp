<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import WhisperIdentity from '@/components/WhisperIdentity.vue'
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import {
  readCommentIdentityPreference,
  saveCommentIdentityPreference,
} from '@/utils/whisper-comment-preference'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import {
  whisperText,
  mergeWhisperPage,
  whisperStates,
  whisperTagsDraft,
} from '@/utils/whisper-content'
import type { IdentityInput, NicknameState, OwnerComment } from '@/types/whispers'
const module = useWhispersStore()
const user = useUserStore()
const identityMode = ref<IdentityInput['mode']>('anonymous')
const identityTags = ref(whisperTagsDraft())
const identityNotice = ref('')
const tab = ref<'nickname' | 'comments'>('nickname')
const state = ref<NicknameState | null>(null)
const label = ref('')
const comments = ref<OwnerComment[]>([])
const cursor = ref<string | null>(null)
const ready = ref(false)
const seen = new Set<string>()
const page = useWhisperPage(() => {
  state.value = null
  label.value = ''
  comments.value = []
  cursor.value = null
  ready.value = false
  seen.clear()
  identityMode.value = 'anonymous'
  identityTags.value = whisperTagsDraft()
  identityNotice.value = ''
})
const { busy, writing, error, notice, retryReady } = page
const locked = computed(() => busy.value || writing.value || retryReady.value)
const canSave = computed(
  () =>
    !!module.config?.enabled &&
    canWhisperAction('NicknameState', state.value, 'whisperNicknameSet'),
)
const candidateLabels = {
  scanning: '安全检查中',
  review_pending: '等待审核',
  approved: '已通过',
  rejected: '未通过',
  restricted: '已限制',
  isolated: '安全处理中',
}
async function load(more = false) {
  if (more && !cursor.value) return
  const previous = more ? cursor.value! : undefined
  const selected = tab.value
  await page.read(async (active) => {
    if (!session.getToken()) return
    if (!more) await module.refresh()
    if (!active()) return
    if (!module.config?.enabled) throw new Error('悄悄话尚未开放或当前不可用。')
    if (selected === 'nickname') {
      const result = await callWhisper('whisperNicknameGet', {})
      if (active()) {
        state.value = result
        const saved = readCommentIdentityPreference(
          user.validated ? user.user?.id : undefined,
          module.config,
          result,
        )
        identityMode.value = saved.identity.mode
        identityTags.value = whisperTagsDraft(saved.identity)
        identityNotice.value = saved.notice
      }
    } else {
      const result = await callWhisper('whisperOwnCommentsList', {
        query: { limit: 20, ...(previous ? { cursor: previous } : {}) },
      })
      if (!active()) return
      if (!more) seen.clear()
      const merged = mergeWhisperPage(more ? comments.value : [], result, previous, seen)
      comments.value = merged.items
      cursor.value = merged.cursor
    }
    ready.value = true
  }, more)
}
function saveIdentity() {
  if (locked.value || !user.validated || !session.getToken() || !state.value) return
  try {
    saveCommentIdentityPreference(
      user.user?.id,
      identityMode.value,
      identityTags.value,
      module.config,
      state.value,
    )
    identityNotice.value = ''
    notice.value = '评论身份已保存到本机。'
    error.value = ''
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '评论身份未保存，请重试。'
  }
}
async function switchTab(value: 'nickname' | 'comments') {
  if (locked.value || tab.value === value) return
  tab.value = value
  comments.value = []
  cursor.value = null
  ready.value = false
  await load()
}
async function save() {
  if (!canSave.value || !state.value || locked.value) return
  try {
    await page.write(
      'whisperNicknameSet',
      {
        data: { label: whisperText(label.value, 2, 20), expected_version: state.value.version },
        key: whisperKey(),
      },
      (result) => {
        state.value = result
        label.value = ''
        notice.value = '昵称已提交审核，通过后可以使用。'
      },
      () => load(),
    )
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请核对昵称。'
  }
}
async function openComment(comment: OwnerComment) {
  if (locked.value || !comments.value.includes(comment)) return
  if (!comment.post_id) {
    notice.value = '原帖已关闭或当前不可查看。'
    return
  }
  await page.read(async (active) => {
    try {
      const post = await callWhisper('whisperPostGet', { path: { post_id: comment.post_id! } })
      if (!active()) return
      if (post.id !== comment.post_id) throw new Error('原帖已关闭或当前不可查看。')
      if (!post.comments_open) {
        notice.value = '原帖评论已关闭，当前仅供阅读。'
      }
      uni.navigateTo({ url: `/pages/whispers/detail?id=${encodeURIComponent(post.id)}` })
    } catch {
      if (active()) notice.value = '原帖已关闭、违规或当前不可查看。'
    }
  }, true)
}
async function withdraw(comment: OwnerComment) {
  if (
    !comments.value.includes(comment) ||
    !canWhisperAction('OwnerComment', comment, 'whisperCommentWithdraw')
  )
    return
  await page.write(
    'whisperCommentWithdraw',
    {
      path: { comment_id: comment.id },
      data: { expected_version: comment.version },
      key: whisperKey(),
    },
    (result) => {
      if (result.id !== comment.id) throw new Error('返回的评论目标不匹配，请下拉重试。')
      comments.value = comments.value.map((item) => (item.id === result.id ? result : item))
      notice.value = '评论已撤回。'
    },
    () => load(),
  )
}
page.onRefresh(() => load())
onShow(() => {
  void load()
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading title="悄悄话设置" />
    <LoginLink v-if="!user.isLoggedIn" class="ui-link">登录后设置评论身份</LoginLink>
    <view v-else class="settings-tabs">
      <button
        class="ui-button"
        :class="{ selected: tab === 'nickname' }"
        :disabled="locked"
        :loading="isPageActionPending('whisper-settings-tab-nickname')"
        @click="runPageAction(() => switchTab('nickname'), 'whisper-settings-tab-nickname')"
      >
        身份与昵称
      </button>
      <button
        class="ui-button"
        :class="{ selected: tab === 'comments' }"
        :disabled="locked"
        :loading="isPageActionPending('whisper-settings-tab-comments')"
        @click="runPageAction(() => switchTab('comments'), 'whisper-settings-tab-comments')"
      >
        我的评论
      </button>
    </view>
    <view v-if="tab === 'nickname' && state" class="identity-settings">
      <text class="identity-settings-title" role="heading">评论身份</text>
      <text class="identity-settings-caption">用于这台设备上你之后发送的暖评。</text>
      <WhisperIdentity
        v-model:mode="identityMode"
        v-model:tags="identityTags"
        v-model:nickname="state"
        :config="module.config"
        :disabled="locked || !user.validated"
        profile-defaults
        comment
      />
      <AppNotice :message="identityNotice" kind="info" />
      <button
        class="ui-button ui-button-primary"
        :disabled="locked || !user.validated"
        :loading="isPageActionPending('whisper-settings-identity')"
        @click="runPageAction(saveIdentity, 'whisper-settings-identity')"
      >
        保存评论身份
      </button>
    </view>
    <view v-if="tab === 'nickname' && state" class="ui-section ce-group">
      <text class="ui-copy field-label">当前昵称</text>
      <text class="ui-copy current-nickname">{{ state.active?.label || '暂未设置' }}</text>
      <view v-if="state.candidate" class="notice"
        ><text class="ui-copy"
          >{{ state.candidate.label }} · {{ candidateLabels[state.candidate.status] }}</text
        ><text v-if="state.candidate.review_result?.reason" class="ui-copy">{{
          state.candidate.review_result.reason
        }}</text></view
      >
      <input
        v-if="canSave"
        v-model="label"
        class="ui-input"
        :maxlength="-1"
        :disabled="locked"
        placeholder="输入新昵称，2至20个字"
        placeholder-class="field-placeholder"
      />
      <button
        v-if="canSave"
        class="ui-button ui-button-primary"
        :disabled="locked"
        :loading="isPageActionPending('whisper-settings-nickname')"
        @click="runPageAction(save, 'whisper-settings-nickname')"
      >
        提交新昵称
      </button>
      <text class="ui-meta notice">新昵称审核通过后使用，旧心事中的昵称保持原样。</text>
    </view>
    <view v-if="tab === 'comments'">
      <view v-for="comment in comments" :key="comment.id" class="ui-section ce-group">
        <text class="ui-meta comment-state">{{ whisperStates[comment.status] }}</text>
        <text
          v-if="comment.body"
          class="ui-copy whitespace-pre-wrap"
          @click="runPageAction(() => openComment(comment), 'whisper-settings-open:' + comment.id)"
          >{{ comment.body }}</text
        >
        <text v-if="comment.review_result?.reason" class="ui-meta notice">{{
          comment.review_result.reason
        }}</text>
        <text v-if="comment.review_result?.revision_suggestion" class="ui-meta">{{
          comment.review_result.revision_suggestion
        }}</text>
        <text v-if="!comment.post_id" class="ui-meta notice">原帖已关闭或当前不可查看。</text>
        <view class="comment-actions"
          ><navigator
            v-if="
              comment.post_id && canWhisperAction('OwnerComment', comment, 'whisperCommentUpdate')
            "
            :url="`/pages/whispers/detail?id=${encodeURIComponent(comment.post_id)}&compose=1&commentId=${encodeURIComponent(comment.id)}`"
            class="ui-button"
            >编辑暖评</navigator
          >
          <button
            class="ui-button"
            :disabled="locked"
            :loading="isPageActionPending('whisper-settings-open:' + comment.id)"
            @click="
              runPageAction(() => openComment(comment), 'whisper-settings-open:' + comment.id)
            "
          >
            查看原帖
          </button>
          <button
            v-if="canWhisperAction('OwnerComment', comment, 'whisperCommentWithdraw')"
            class="ui-button"
            :disabled="locked"
            :loading="isPageActionPending('whisper-settings-withdraw:' + comment.id)"
            @click="
              runPageAction(() => withdraw(comment), 'whisper-settings-withdraw:' + comment.id)
            "
          >
            撤回评论
          </button>
        </view>
      </view>
      <text v-if="ready && !comments.length && !busy && !error" class="ui-copy"
        >还没有评论记录。</text
      >
      <button
        v-if="cursor"
        class="ui-button"
        :disabled="locked"
        :loading="isPageActionPending('whisper-settings-more')"
        @click="runPageAction(() => load(true), 'whisper-settings-more')"
      >
        加载下一页
      </button>
    </view>
    <button
      v-if="retryReady"
      class="ui-button ui-button-primary"
      :disabled="writing"
      :loading="isPageActionPending('whisper-settings-retry')"
      @click="runPageAction(page.retry, 'whisper-settings-retry')"
    >
      使用原请求重试
    </button>
    <AppNotice :message="notice" kind="info" /><AppNotice :message="error" kind="error" />
  </AppPage>
</template>
<style scoped>
.identity-settings {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin: 28rpx 0;
}
.identity-settings-title,
.identity-settings-caption {
  margin: 0;
}
.identity-settings-title {
  color: var(--theme-ink);
  font-size: 36rpx;
  font-weight: 680;
}
.identity-settings-caption {
  color: var(--theme-muted);
  font-size: 25rpx;
}
.ui-section.ce-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  min-width: 0;
}

.settings-tabs,
.comment-actions {
  display: flex;
  gap: 20rpx;
}
.settings-tabs button,
.comment-actions button {
  flex: 1;
}
.selected {
  color: var(--theme-teal);
  font-weight: 600;
}
.field-label,
.current-nickname,
.comment-state {
  display: block;
  margin-bottom: 20rpx;
}
.current-nickname {
  font-size: 36rpx;
  font-weight: 600;
}
.comment-actions {
  margin-top: 24rpx;
}
.comment-actions button {
  font-size: 24rpx;
}
</style>
