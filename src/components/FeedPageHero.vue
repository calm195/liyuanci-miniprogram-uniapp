<script setup lang="ts">
defineProps<{ title: string; description: string; illustration: string }>()
</script>

<template>
  <view class="feed-page-hero">
    <view class="feed-page-copy">
      <text class="feed-page-title">{{ title }}</text>
      <text class="feed-page-description">{{ description }}</text>
    </view>
    <image
      :src="`/static/illustrations/${illustration}.png`"
      class="feed-page-background"
      :class="{ 'feed-page-background-square': illustration === 'entry-whisper' }"
      mode="aspectFit"
      aria-hidden="true"
    />
  </view>
</template>

<style scoped>
.feed-page-hero {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin: 0 0 24rpx;
}
.feed-page-copy {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.feed-page-background {
  flex: 0 0 216rpx;
  width: 216rpx;
  height: 160rpx;
  opacity: 0.8;
  pointer-events: none;
}
.feed-page-background-square {
  flex-basis: 160rpx;
  width: 160rpx;
}
.feed-page-title,
.feed-page-description {
  display: block;
  margin: 0;
}
.feed-page-title {
  color: var(--theme-ink);
  font-size: 38rpx;
  line-height: 1.35;
  font-weight: 750;
}
.feed-page-description {
  margin-top: 8rpx;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.55;
}
</style>
