<script setup lang="ts">
import type { HotContentEntry } from '@/api/hot-content'

defineProps<{ items: HotContentEntry[]; busy: boolean; error: string }>()
</script>

<template>
  <view class="hot-list">
    <navigator v-for="(item, index) in items" :key="item.id" :url="item.url" class="hot-row">
      <text class="hot-rank">{{ index + 1 }}</text>
      <text class="hot-title">{{ item.title }}</text>
      <text class="hot-arrow">›</text>
    </navigator>
    <text v-if="busy || error || !items.length" class="hot-state">{{
      busy ? '正在加载热点…' : error || '这周暂时没有上榜内容'
    }}</text>
  </view>
</template>

<style scoped>
.hot-list {
  overflow: hidden;
  border: 1px solid var(--theme-line);
  border-radius: 24rpx;
  background: var(--theme-surface);
}
.hot-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
}
.hot-row + .hot-row {
  border-top: 1px solid var(--theme-line);
}
.hot-rank {
  flex: 0 0 40rpx;
  color: var(--theme-brand);
  text-align: center;
  font-weight: 700;
}
.hot-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--theme-ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hot-arrow,
.hot-state {
  color: var(--theme-muted);
}
.hot-state {
  display: block;
  padding: 24rpx;
  text-align: center;
  font-size: 26rpx;
}
</style>
