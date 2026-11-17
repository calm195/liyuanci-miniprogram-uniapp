<script setup lang="ts">
defineProps<{ title: string; description?: string; kicker?: string; illustration?: string }>()
</script>

<template>
  <view class="page-heading" :class="{ 'has-illustration': illustration }">
    <image
      v-if="illustration"
      :src="`/static/illustrations/${illustration}.png`"
      class="heading-art"
      mode="aspectFit"
    />
    <text v-if="kicker" class="heading-kicker">{{ kicker }}</text>
    <text class="heading-title">{{ title }}</text>
    <text v-if="description" class="heading-description">{{ description }}</text>
    <view v-if="$slots.default" class="heading-actions"><slot /></view>
  </view>
</template>

<style scoped>
.page-heading {
  margin: 0 0 32rpx;
  position: relative;
}
.heading-kicker,
.heading-title,
.heading-description {
  display: block;
  margin: 0;
}
.heading-kicker {
  margin-bottom: 12rpx;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.heading-title {
  color: var(--theme-ink);
  font-size: 54rpx;
  font-weight: 700;
  line-height: 1.35;
}
.heading-description {
  margin-top: 12rpx;
  color: var(--theme-muted);
  font-size: 26rpx;
  line-height: 1.6;
}
.heading-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 24rpx;
}
.has-illustration {
  min-height: 144rpx;
  padding-right: 144rpx;
}
.heading-art {
  position: absolute;
  right: 0;
  top: 0;
  width: 124rpx;
  height: 124rpx;
  border-radius: 28rpx;
}
</style>
