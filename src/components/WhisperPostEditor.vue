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
    <text v-if="record" class="ui-copy">{{ whisperStates[record.status] }}</text>
    <text v-if="record?.review_result?.reason" class="ui-copy"
      >审核原因：{{ record.review_result.reason }}</text
    >
    <text v-if="record?.review_result?.revision_suggestion" class="ui-copy"
      >修改建议：{{ record.review_result.revision_suggestion }}</text
    >
    <text v-if="!id && module.workspace?.verification !== 'verified'" class="ui-copy"
      >发帖需要有效学生认证。</text
    >
    <navigator
      v-if="!id && module.workspace?.verification !== 'verified'"
      class="ui-link"
      url="/pages/verification/index"
      >学生认证</navigator
    >
    <view v-if="canSave" class="ui-section ce-group">
      <text class="ui-label">标题</text>
      <input
        v-model="title"
        class="ui-input"
        :maxlength="-1"
        :disabled="locked"
        placeholder="烦恼和心事都可以说一说"
        placeholder-class="field-placeholder"
      />
      <text class="ui-meta input-hint">给心事起个名字，最多40个字</text>
      <text class="ui-label">详情</text>
      <textarea
        v-model="body"
        class="ui-textarea"
        :maxlength="-1"
        :disabled="locked"
        placeholder="写下你的心事，最多500个字"
        placeholder-class="field-placeholder"
      />
      <text class="ui-copy">{{ Array.from(body).length }} / 500</text>
      <text class="ui-copy"
        >不自动保存到本地；保存草稿不会公开。公开后改稿会立即撤下整帖与评论读取，需重新提交审核。</text
      >
    </view>
    <text v-else-if="record?.body" class="ui-copy whitespace-pre-wrap">{{ record.body }}</text>
    <WhisperIdentity
      v-if="canSave"
      v-model:mode="mode"
      v-model:tags="tags"
      :config="module.config"
      :nickname="nickname"
      :disabled="locked"
    />
    <text v-if="identityNotice" class="ui-copy">{{ identityNotice }}</text>
    <button
      v-if="canSave"
      class="ui-button"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-editor-button-2')"
      @click="runPageAction(save, 'pages-whispers-editor-button-2')"
    >
      保存草稿（不会提交）
    </button>
    <text v-if="allowed('whisperPostSubmit')" class="ui-copy"
      >提交即授权：当前版本审核合格后自动公开。</text
    >
    <button
      v-if="allowed('whisperPostSubmit')"
      class="ui-button ui-button-primary"
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
    <text v-if="record" class="ui-copy"
      >关闭评论保留已公开合规评论只读，恢复不会补发已取消评论。</text
    >
    <button
      v-if="retryReady"
      class="ui-button ui-button-primary"
      :disabled="(locked && !retryReady) || writing"
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
.post-editor {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.ui-section.ce-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  min-width: 0;
}

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
