<script setup lang="ts">
defineProps<{ value: string }>()
</script>
<template>
  <view class="whisper-identity-preview">
    <text class="whisper-preview-label">公开预览</text>
    <text class="whisper-preview-value">{{ value }}</text>
  </view>
</template>
<style scoped>
.whisper-identity-preview {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
  padding: 22rpx;
  border-radius: 20rpx;
  background: var(--theme-mint);
  color: var(--theme-teal);
}
.whisper-preview-label,
.whisper-preview-value {
  margin: 0;
  font-size: 25rpx;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.whisper-preview-label {
  font-weight: 700;
}
</style>
