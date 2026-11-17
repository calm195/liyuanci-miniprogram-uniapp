<script setup lang="ts">
const props = defineProps<{
  expanded: boolean
  loading?: boolean
  hasMore?: boolean
  retry?: boolean
}>()
const emit = defineEmits<{ more: [] }>()
function more() {
  if (props.expanded && !props.loading && (props.hasMore || props.retry)) emit('more')
}
</script>
<template>
  <!-- 只控制展示，已读分页和回复草稿仍由业务层保留。 -->
  <view v-show="expanded" class="comment-reply-list">
    <slot />
    <view v-if="loading || hasMore || retry" class="comment-reply-footer">
      <text v-if="loading" class="comment-reply-loading">正在读取回复…</text>
      <button v-else class="comment-reply-more" @click="more">
        {{ retry ? '重试读取' : '更多回复' }}
      </button>
    </view>
  </view>
</template>
<style scoped>
.comment-reply-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 4rpx;
}
.comment-reply-footer .comment-reply-more,
.comment-reply-loading {
  display: inline-flex;
  align-items: center;
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
}
.comment-reply-more::after {
  border: 0;
}
.comment-reply-loading {
  color: var(--theme-muted);
}
</style>
