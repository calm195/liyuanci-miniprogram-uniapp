<script setup lang="ts">
// 权限与目标由业务层决定，公共操作栏只展示允许的动作并通知调用方。
const props = defineProps<{
  canReply?: boolean
  replyDisabled?: boolean
  canExpand?: boolean
  expanded?: boolean
  replyCount?: number
  expandDisabled?: boolean
  reportUrl?: string
  canBlock?: boolean
  blockDisabled?: boolean
  blockLoading?: boolean
}>()
const emit = defineEmits<{ reply: []; toggle: []; block: [] }>()
function reply() {
  if (props.canReply && !props.replyDisabled) emit('reply')
}
function toggle() {
  if (props.canExpand && !props.expandDisabled) emit('toggle')
}
function block() {
  if (props.canBlock && !props.blockDisabled && !props.blockLoading) emit('block')
}
</script>
<template>
  <view v-if="canReply || canExpand || reportUrl || canBlock" class="comment-action-bar">
    <view v-if="reportUrl || canBlock" class="comment-moderation">
      <navigator v-if="reportUrl" :url="reportUrl" class="comment-action">举报</navigator>
      <button
        v-if="canBlock"
        class="comment-action"
        :disabled="blockDisabled || blockLoading"
        :loading="blockLoading"
        @click="block"
      >
        屏蔽发布者
      </button>
    </view>
    <view v-if="canReply || canExpand" class="comment-primary">
      <button v-if="canReply" class="comment-action" :disabled="replyDisabled" @click="reply">
        回复
      </button>
      <button
        v-if="canExpand"
        class="comment-action"
        :disabled="expandDisabled"
        :aria-expanded="!!expanded"
        @click="toggle"
      >
        {{ expanded ? '收起回复' : replyCount ? `展开 ${replyCount} 条回复` : '展开回复' }}
      </button>
    </view>
  </view>
</template>
<style scoped>
.comment-action-bar,
.comment-moderation,
.comment-primary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}
.comment-action-bar {
  justify-content: space-between;
  width: 100%;
}
.comment-primary {
  justify-content: flex-end;
  margin-left: auto;
}
.comment-action-bar .comment-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: auto;
  margin: 0;
  padding: 4rpx 0;
  min-height: 52rpx;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--theme-teal);
  font-size: 22rpx;
  line-height: 1.5;
  text-decoration: none;
}
.comment-action::after {
  border: 0;
}
</style>
