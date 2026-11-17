<script setup lang="ts">
import type { MatchmakingActivitySummary } from '@/types/matchmaking'

defineProps<{ summary: MatchmakingActivitySummary; compact?: boolean }>()
</script>

<template>
  <view class="activity-stats" :class="{ compact }">
    <view class="stat">
      <text class="stat-label">报名人数</text>
      <view class="stat-value"
        ><text class="stat-number">{{ summary.enrollment_count }}</text
        ><text class="stat-unit">人</text></view
      >
    </view>
    <view class="stat">
      <text class="stat-label">成功配对组数</text>
      <view class="stat-value"
        ><text class="stat-number">{{ summary.successful_pair_count }}</text
        ><text class="stat-unit">组</text></view
      >
    </view>
  </view>
</template>

<style scoped>
.activity-stats.compact {
  margin-top: 24rpx;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.compact .stat {
  padding: 0 24rpx 0 0;
}
.compact .stat + .stat {
  padding-left: 24rpx;
}
.compact .stat-label,
.compact .stat-number,
.compact .stat-unit {
  margin: 0;
}
.activity-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1rpx solid var(--theme-line);
  border-radius: 24rpx;
  background: var(--theme-surface);
}
.stat {
  display: grid;
  gap: 6rpx;
  padding: 18rpx 22rpx;
}
.stat + .stat {
  border-left: 1rpx solid var(--theme-line);
}
.stat-label {
  font-size: 23rpx;
  line-height: 1.5;
}
.stat-value {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  color: var(--theme-teal);
  font-size: 24rpx;
}
.stat-value text:first-child {
  font-size: 42rpx;
  line-height: 1.15;
  font-weight: 700;
}
</style>
