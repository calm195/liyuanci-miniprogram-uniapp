<script setup lang="ts">
import WhisperIdentity from '@/components/WhisperIdentity.vue'
import { useUserStore } from '@/stores/user'
import { whisperStates } from '@/utils/whisper-content'
import type { useWhisperPostEditor } from '@/composables/use-whisper-post-editor'
const user = useUserStore()
const props = defineProps<{ editor: ReturnType<typeof useWhisperPostEditor> }>()
const {
  module,
  record,
  id,
  title,
  body,
  mode,
  tags,
  nickname,
  identityNotice,
  identityNeedsConfirmation,
  confirmIdentity,
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
  save,
  submit,
  withdraw,
  commentsSetting,
} = props.editor
async function saveDraft() {
  if (!changed.value || locked.value) return
  if (record.value?.status === 'published' && !identityNeedsConfirmation.value) {
    const confirmed = await new Promise<boolean>((resolve) =>
      uni.showModal({
        title: '保存为草稿？',
        content: '保存后，这条心事和原评论将暂时撤下。重新提交并通过审核后，心事会再次公开。',
        confirmText: '保存草稿',
        cancelText: '继续编辑',
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      }),
    )
    if (!confirmed) return
  }
  await save()
}
</script>
<template>
  <view class="post-editor">
    <text v-if="record" class="editor-status">当前状态 · {{ whisperStates[record.status] }}</text>
    <text v-if="record?.review_result?.decision === 'rejected'" class="ui-copy"
      >你发布的内容含有违规信息</text
    >

    <LoginLink v-if="!user.isLoggedIn" class="ui-link"
      >登录后{{ id ? '编辑心事' : '写心事' }}</LoginLink
    >
    <text v-else-if="!id && module.workspace?.verification !== 'verified'" class="ui-copy"
      >发帖需要有效学生认证。</text
    >
    <navigator
      v-if="user.isLoggedIn && !id && module.workspace?.verification !== 'verified'"
      class="ui-link"
      url="/pages/verification/index"
      >学生认证</navigator
    >
    <view v-if="canSave" class="editor-fields">
      <label for="whisper-title" class="editor-label">标题</label>
      <input
        id="whisper-title"
        v-model="title"
        class="ui-input"
        :maxlength="-1"
        :disabled="locked"
        placeholder="给心事起个名字"
        placeholder-class="field-placeholder"
      />
      <text class="editor-count">{{ Array.from(title).length }} / 40</text>
      <label for="whisper-body" class="editor-label">正文</label>
      <textarea
        id="whisper-body"
        v-model="body"
        class="ui-textarea"
        :maxlength="-1"
        :disabled="locked"
        placeholder="写下想说的话"
        placeholder-class="field-placeholder"
      />
      <text class="editor-count">{{ Array.from(body).length }} / 500</text>
    </view>
    <text v-else-if="record?.body" class="ui-copy whitespace-pre-wrap">{{ record.body }}</text>
    <WhisperIdentity
      v-if="canSave"
      v-model:mode="mode"
      v-model:tags="tags"
      v-model:nickname="nickname"
      :config="module.config"
      :disabled="locked"
      :original-nickname-unavailable="identityNeedsConfirmation && mode === 'named'"
      profile-defaults
    />
    <text v-if="identityNotice" class="editor-status">{{ identityNotice }}</text>
    <view v-if="canSave && identityNeedsConfirmation" class="editor-fields">
      <text class="editor-status"
        >原身份资料已更新。修改这条心事前，请确认当前选项或重新选择。</text
      >
      <button class="ui-button" :disabled="locked" @click="confirmIdentity">
        {{
          mode === 'named' && nickname?.active ? `采用「${nickname.active.label}」` : '确认当前身份'
        }}
      </button>
    </view>
    <button
      v-if="canSave"
      class="ui-button ui-button-primary"
      :disabled="locked || !changed || identityNeedsConfirmation"
      :loading="isPageActionPending('whisper-save-draft')"
      @click="runPageAction(saveDraft, 'whisper-save-draft')"
    >
      保存草稿
    </button>
    <text v-if="allowed('whisperPostSubmit')" class="editor-status">草稿通过审核后会公开。</text>
    <button
      v-if="allowed('whisperPostSubmit')"
      class="ui-button"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-editor-button-3')"
      @click="runPageAction(submit, 'pages-whispers-editor-button-3')"
    >
      提交审核
    </button>
    <button
      v-if="allowed('whisperPostWithdraw')"
      class="ui-button"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-editor-button-4')"
      @click="runPageAction(withdraw, 'pages-whispers-editor-button-4')"
    >
      撤回帖子
    </button>
    <button
      v-if="allowed('whisperCommentsSetting')"
      class="ui-button"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-editor-button-5')"
      @click="runPageAction(commentsSetting, 'pages-whispers-editor-button-5')"
    >
      {{ record?.comments_open ? '关闭评论' : '恢复评论' }}
    </button>
    <text v-if="allowed('whisperCommentsSetting')" class="editor-status">
      关闭评论后，已公开的暖评仍可阅读。
    </text>
    <button
      v-if="retryReady"
      class="ui-button ui-button-primary"
      :disabled="writing"
      :loading="isPageActionPending('pages-whispers-editor-button-6')"
      @click="runPageAction(page.retry, 'pages-whispers-editor-button-6')"
    >
      使用原请求重试
    </button>
    <text v-if="busy" class="ui-copy">加载中…</text
    ><AppNotice :message="notice" kind="info" /><AppNotice :message="error" kind="error" />
  </view>
</template>
<style scoped>
.post-editor,
.editor-fields {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 18rpx;
}
.editor-fields {
  gap: 12rpx;
  padding: 28rpx;
  border: 1px solid var(--theme-line);
  border-radius: 34rpx;
  background: var(--theme-surface);
}
.editor-label {
  color: var(--theme-ink);
  font-size: 29rpx;
  font-weight: 650;
}
.editor-fields input,
.editor-fields textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
}
.editor-fields textarea {
  min-height: 210rpx;
}
.editor-count,
.editor-status {
  margin: 0;
  color: var(--theme-muted);
  font-size: 25rpx;
  line-height: 1.5;
}
.editor-count {
  align-self: flex-end;
}
</style>
