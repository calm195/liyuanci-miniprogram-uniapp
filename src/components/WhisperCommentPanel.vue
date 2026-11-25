<script setup lang="ts">
import { computed } from 'vue'
import CommentThread from '@/components/CommentThread.vue'
import WhisperCommentEditor from '@/components/WhisperCommentEditor.vue'
import WhisperReplies from '@/components/WhisperReplies.vue'
import type { useWhisperCommentEditor } from '@/composables/use-whisper-comment-editor'
import type { PublicComment, PublicPost } from '@/types/whispers'
import { canWhisperAction } from '@/utils/whispers'

const props = defineProps<{
  post: PublicPost
  comments: PublicComment[]
  editor: ReturnType<typeof useWhisperCommentEditor>
  canWrite: boolean
  canBlock: boolean
  loading: boolean
  hasMore: boolean
  disabled: boolean
  error: string
  openComment: (rootId?: string, replyId?: string) => Promise<void>
  loadMore: () => Promise<void>
  reload: () => Promise<void>
  block: (comment: PublicComment) => Promise<void>
}>()

const commentLocated = computed(
  () => props.editor.anchor.value === `${props.editor.rootId.value}:${props.editor.replyId.value}`,
)
</script>
<template>
  <view class="whisper-comment-panel">
    <view class="whisper-comment-heading">
      <text class="whisper-comment-title" role="heading">暖评与回复</text>
      <button
        v-if="canWrite && !editor.expanded.value"
        class="whisper-comment-write"
        :disabled="disabled"
        :loading="isPageActionPending('whisper-inline-compose')"
        @click="runPageAction(() => openComment(), 'whisper-inline-compose')"
      >
        写暖评
      </button>
    </view>
    <text v-if="!post.comments_open" class="whisper-comment-meta">
      评论已关闭，已公开的暖评仍可查看。
    </text>

    <CommentThread
      v-for="comment in comments"
      :key="comment.id"
      :label="comment.identity.label"
      :body="comment.body"
      :author="comment.identity.is_author"
      :time="comment.published_at"
      :tags="comment.identity.tags"
    >
      <WhisperReplies
        :post="post"
        :root="comment"
        :editor="editor"
        :report-url="
          canWhisperAction('PublicComment', comment, 'whisperReportCreate')
            ? `/pages/whispers/report?kind=whisper_comment&id=${encodeURIComponent(comment.id)}&postId=${encodeURIComponent(comment.post_id)}`
            : undefined
        "
        :can-block="!comment.viewer_is_author && canBlock"
        :block-disabled="disabled"
        :block-loading="isPageActionPending('whisper-comment-block:' + comment.id)"
        @reply="openComment"
        @block="runPageAction(() => block(comment), 'whisper-comment-block:' + comment.id)"
      />
    </CommentThread>
    <text v-if="loading && !comments.length" class="whisper-comment-meta">正在加载暖评…</text>
    <text v-else-if="!comments.length && !error" class="whisper-comment-meta"> 还没有暖评。 </text>
    <view v-if="editor.expanded.value && editor.rootId.value && !commentLocated">
      <text class="whisper-comment-meta">目标暖评暂不在当前列表，编辑内容保留在这里。</text>
    </view>
    <WhisperCommentEditor v-if="!editor.rootId.value || !commentLocated" :editor="editor" />
    <button
      v-if="hasMore"
      class="ui-button"
      :disabled="disabled"
      :loading="isPageActionPending('whisper-comment-more')"
      @click="runPageAction(loadMore, 'whisper-comment-more')"
    >
      加载更多暖评
    </button>
    <AppNotice :message="error" kind="error" />
    <button
      v-if="error"
      class="ui-button"
      :disabled="disabled"
      :loading="isPageActionPending('whisper-comment-refresh')"
      @click="runPageAction(reload, 'whisper-comment-refresh')"
    >
      重新读取暖评
    </button>
  </view>
</template>
<style scoped>
.whisper-comment-panel {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 24rpx 28rpx 28rpx;
  border: 1px solid var(--theme-line);
  border-radius: 34rpx;
  background: var(--theme-surface);
}
.whisper-comment-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.whisper-comment-title {
  min-width: 0;
  margin: 0;
  color: var(--theme-ink);
  font-size: 34rpx;
  font-weight: 700;
}
button.whisper-comment-write {
  flex: none;
  min-height: 44px;
  margin: 0;
  padding: 0 6rpx;
  border: 0;
  background: transparent;
  color: var(--theme-teal);
  font-size: 26rpx;
  white-space: nowrap;
}
button.whisper-comment-write::after {
  border: 0;
}
.whisper-comment-meta {
  display: block;
  margin: 0;
  color: var(--theme-muted);
  font-size: 26rpx;
  line-height: 1.55;
}
</style>
