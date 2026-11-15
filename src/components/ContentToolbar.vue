<template>
  <view class="content-toolbar"><slot /></view>
</template>

<style scoped>
.content-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8rpx 24rpx;
  margin-top: 20rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid var(--theme-line);
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.5;
}
</style>
