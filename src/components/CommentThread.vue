<script setup lang="ts">
defineProps<{
  label: string
  body?: string | null
  author?: boolean
  time?: string | null
  replyTo?: string
  nested?: boolean
}>()
</script>
<template>
  <view class="comment-thread" :class="{ nested }"
    ><view class="comment-heading"
      ><text>{{ label || '同学' }}</text
      ><text v-if="author" class="author-label">帖主</text
      ><text v-if="time" class="comment-time">{{ time.slice(0, 10) }}</text></view
    ><text v-if="replyTo" class="reply-label">回复 {{ replyTo }}</text
    ><text class="comment-body">{{ body || '该评论已不可查看' }}</text
    ><view class="comment-actions"><slot name="actions" /></view
    ><view class="comment-replies"><slot /></view
  ></view>
</template>
<style scoped>
.comment-thread {
  padding: 24rpx 0;
  border-bottom: 2rpx solid var(--theme-line);
}
.comment-thread.nested {
  padding: 20rpx;
  border-radius: 16rpx;
  background: var(--theme-bg);
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
.comment-time {
  margin-left: auto;
  font-size: 22rpx;
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
  margin-top: 14rpx;
}
.reply-label {
  display: block;
  font-size: 24rpx;
  color: var(--theme-teal);
  margin-top: 8rpx;
}
.comment-actions {
  display: flex;
  gap: 12rpx;
  align-items: center;
  margin-top: 12rpx;
}
</style>
