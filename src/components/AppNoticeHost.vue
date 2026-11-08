<script setup lang="ts">
import type { NoticeItem } from '@/utils/notices'
defineProps<{ items: NoticeItem[] }>()
const emit = defineEmits<{ dismiss: [id: number] }>()
// 微信胶囊覆盖页面顶层，通知放在胶囊下方以保留完整的操作区域。
const capsuleBottom = uni.getMenuButtonBoundingClientRect?.()?.bottom
const position = capsuleBottom > 0 ? { top: `${capsuleBottom + 8}px` } : undefined
</script>
<template>
  <view
    v-if="isPageVisible && items.length"
    class="floating-notices"
    :style="position"
    aria-live="polite"
  >
    <view
      v-for="item in items"
      :key="item.id"
      class="floating-notice"
      :class="'floating-notice-' + item.kind"
      :role="item.kind === 'error' ? 'alert' : 'status'"
    >
      <text class="floating-notice-message">{{ item.message }}</text>
      <button class="floating-notice-close" aria-label="关闭提示" @click="emit('dismiss', item.id)">
        ×
      </button>
    </view>
  </view>
</template>
<style scoped>
.floating-notices {
  position: fixed;
  z-index: 3000;
  top: calc(env(safe-area-inset-top) + 96rpx);
  left: 24rpx;
  right: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  max-height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 160rpx);
  overflow-y: auto;
  pointer-events: none;
}
.floating-notice {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  width: 100%;
  max-width: 800rpx;
  margin: 0 auto;
  padding: 22rpx 18rpx 22rpx 26rpx;
  border: 2rpx solid var(--theme-line);
  border-left: 8rpx solid var(--theme-teal);
  border-radius: 20rpx;
  background: var(--theme-surface);
  color: var(--theme-ink);
  box-shadow: 0 10rpx 32rpx rgb(0 0 0 / 18%);
  pointer-events: auto;
}
.floating-notice-warning,
.floating-notice-uncertain,
.floating-notice-error {
  border-left-color: var(--theme-danger);
}
.floating-notice .floating-notice-message {
  flex: 1;
  min-width: 0;
  margin: 0;
  max-height: 35vh;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 27rpx;
}
.floating-notice button.floating-notice-close {
  flex-shrink: 0;
  width: 60rpx;
  min-height: 60rpx;
  margin: -10rpx -6rpx -10rpx auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--theme-muted);
  font-size: 40rpx;
  line-height: 60rpx;
}
</style>
