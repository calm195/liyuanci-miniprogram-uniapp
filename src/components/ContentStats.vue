<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
defineProps<{ views?: number; comments?: number; applications?: number }>()
function count(value: number) {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : String(value)
}
</script>
<template>
  <view class="content-stats">
    <text v-if="applications !== undefined">应愿 {{ count(applications) }}</text>
    <text v-if="comments !== undefined">评论 {{ count(comments) }}</text>
    <view v-if="views !== undefined" class="view-count" :aria-label="`浏览 ${views} 次`"
      ><AppIcon name="eye" :size="28" /><text>{{ count(views) }}</text></view
    >
  </view>
</template>
<style scoped>
.content-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 24rpx;
  color: var(--theme-muted);
  font-size: 24rpx;
  margin-top: 16rpx;
}
.view-count {
  display: flex;
  align-items: center;
  gap: 6rpx;
}
</style>
