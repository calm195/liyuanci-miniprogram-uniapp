<script setup lang="ts">
import IdentityTags from '@/components/IdentityTags.vue'
import type { IdentityTags as Tags } from '@/types/wish'
defineProps<{
  label: string
  body?: string | null
  author?: boolean
  time?: string | null
  replyTo?: string
  nested?: boolean
  tags?: Tags | null
}>()
</script>
<template>
  <view class="comment-thread" :class="{ nested }"
    ><view class="comment-heading"
      ><view class="comment-avatar" aria-hidden="true">{{ Array.from(label || '同学')[0] }}</view
      ><text class="comment-name">{{ label || '同学' }}</text
      ><text v-if="author" class="author-label">帖主</text
      ><text v-if="time" class="comment-time">{{ time.slice(0, 10) }}</text></view
    ><view class="comment-content"
      ><IdentityTags v-if="tags" :tags="tags" /><text v-if="replyTo" class="reply-label"
        >回复 {{ replyTo }}</text
      ><text class="comment-body">{{ body || '该评论已不可查看' }}</text
      ><view v-if="$slots.actions" class="comment-actions"><slot name="actions" /></view
      ><view class="comment-replies"><slot /></view></view
  ></view>
</template>
<style scoped>
.comment-thread {
  padding: 34rpx 0;
  border-bottom: 2rpx solid var(--theme-line);
}
.comment-thread.nested {
  padding: 20rpx;
  border-radius: 16rpx;
  background: var(--theme-canvas);
  border: 0;
  margin-top: 14rpx;
}
.comment-heading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 24rpx;
  color: var(--theme-muted);
}
.comment-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 60rpx;
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: var(--theme-mint);
  color: var(--theme-teal);
  font-size: 22rpx;
}
.comment-name {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--theme-ink);
  font-weight: 600;
}
.comment-content {
  margin-left: 84rpx;
  min-width: 0;
}
.nested .comment-avatar {
  flex-basis: 44rpx;
  width: 44rpx;
  height: 44rpx;
  font-size: 20rpx;
}
.nested .comment-content {
  margin-left: 0;
}
.nested .comment-heading {
  font-size: 22rpx;
}
.comment-time {
  margin-left: auto;
  font-size: 20rpx;
  flex-shrink: 0;
}
.author-label {
  color: var(--theme-teal);
  background: var(--theme-mint);
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
}
.comment-body {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
  margin-top: 20rpx;
  font-size: 26rpx;
}
.reply-label {
  display: block;
  font-size: 24rpx;
  color: var(--theme-teal);
  margin-top: 8rpx;
}
.comment-actions {
  margin-top: 4rpx;
}
.comment-actions:empty,
.comment-replies:empty {
  display: none;
}
</style>
