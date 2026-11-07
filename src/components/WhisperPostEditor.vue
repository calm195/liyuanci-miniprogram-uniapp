<script setup lang="ts">
import WhisperIdentity from '@/components/WhisperIdentity.vue'
import type { useWhisperPostEditor } from '@/composables/use-whisper-post-editor'
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
  page,
  busy,
  writing,
  error,
  notice,
  retryReady,
  locked,
  canSave,
  allowed,
  save,
  submit,
  withdraw,
  commentsSetting,
} = props.editor
import { whisperStates } from '@/utils/whisper-content'
</script>
<template>
  <view class="post-editor">
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
      <text class="field-label">标题</text>
      <input
        v-model="title"
        :maxlength="-1"
        :disabled="locked"
        placeholder="烦恼和心事都可以说一说"
        placeholder-class="field-placeholder"
      />
      <text class="input-hint">给心事起个名字，最多40个字</text>
      <text class="field-label">详情</text>
      <textarea
        v-model="body"
        :maxlength="-1"
        :disabled="locked"
        placeholder="写下你的心事，最多500个字"
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
    <button
      v-if="canSave"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-editor-button-2')"
      @click="runPageAction(save, 'pages-whispers-editor-button-2')"
    >
      保存草稿（不会提交）
    </button>
    <text v-if="allowed('whisperPostSubmit')">提交即授权：当前版本审核合格后自动公开。</text>
    <button
      v-if="allowed('whisperPostSubmit')"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-editor-button-3')"
      @click="runPageAction(submit, 'pages-whispers-editor-button-3')"
    >
      提交审核
    </button>
    <button
      v-if="allowed('whisperPostWithdraw')"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-editor-button-4')"
      @click="runPageAction(withdraw, 'pages-whispers-editor-button-4')"
    >
      撤回帖子
    </button>
    <button
      v-if="allowed('whisperCommentsSetting')"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-editor-button-5')"
      @click="runPageAction(commentsSetting, 'pages-whispers-editor-button-5')"
    >
      {{ record?.comments_open ? '关闭评论' : '恢复评论' }}
    </button>
    <text v-if="record">关闭评论保留已公开合规评论只读，恢复不会补发已取消评论。</text>
    <button
      v-if="retryReady"
      :disabled="(locked && !retryReady) || writing"
      :loading="isPageActionPending('pages-whispers-editor-button-6')"
      @click="runPageAction(page.retry, 'pages-whispers-editor-button-6')"
    >
      使用原请求重试
    </button>
    <text v-if="busy">加载中…</text><text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </view>
</template>
<style scoped>
.field-label {
  display: block;
  font-weight: 600;
  margin: 16rpx 0;
}
.input-hint {
  display: block;
  font-size: 24rpx;
  color: var(--theme-muted);
  margin: 12rpx 0 24rpx;
}
</style>
