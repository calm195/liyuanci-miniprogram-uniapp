<script setup lang="ts">
import { computed } from 'vue'
import { noticeCopy } from '@/utils/notices'
import type { NoticeItem } from '@/utils/notices'
const props = defineProps<{ items: NoticeItem[]; withAppHeader?: boolean }>()
const notices = computed(() => props.items.map((item) => ({ ...item, ...noticeCopy(item) })))
const emit = defineEmits<{ dismiss: [id: number] }>()
const marks: Record<NoticeItem['kind'], string> = {
  success: '✓',
  info: 'i',
  progress: '◌',
  warning: '!',
  error: '×',
  uncertain: '?',
}
</script>
<template>
  <view
    v-if="isPageVisible && items.length"
    class="floating-notices"
    :class="{ 'with-app-header': withAppHeader }"
    aria-live="polite"
  >
    <view
      v-for="item in notices"
      :key="item.id"
      class="floating-notice"
      :class="'floating-notice-' + item.kind"
      :role="item.kind === 'error' ? 'alert' : 'status'"
    >
      <text class="floating-notice-mark" aria-hidden="true">{{ marks[item.kind] }}</text>
      <view class="floating-notice-message">
        <text class="floating-notice-title">{{ item.title }}</text>
        <text v-if="item.description" class="floating-notice-description">{{
          item.description
        }}</text>
      </view>
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
  top: 8px;
  left: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  max-height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 160rpx);
  overflow-y: auto;
  pointer-events: none;
}
.floating-notices.with-app-header {
  top: calc(var(--status-bar-height) + var(--navigation-height) + 8px);
}
.floating-notice {
  --notice-accent: var(--theme-teal);
  --notice-surface: var(--theme-mint);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  max-width: 620rpx;
  margin: 0 auto;
  padding: 8px 4px 8px 12px;
  border: 1px solid var(--theme-line);
  border-radius: 12px;
  background: var(--theme-surface);
  color: var(--theme-ink);
  box-shadow: 0 6px 22px rgb(0 0 0 / 15%);
  pointer-events: auto;
}
.floating-notice-success {
  --notice-accent: var(--theme-success-ink);
  --notice-surface: var(--theme-success);
}
.floating-notice-warning,
.floating-notice-uncertain {
  --notice-accent: var(--theme-warning-ink);
  --notice-surface: var(--theme-warning);
}
.floating-notice-error {
  --notice-accent: var(--theme-danger);
  --notice-surface: var(--theme-peach);
}
.floating-notice-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin: 8px 0 0;
  border-radius: 50%;
  background: var(--notice-surface);
  color: var(--notice-accent);
  font-weight: 700;
}
.floating-notice .floating-notice-message {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  max-height: 35vh;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.floating-notice .floating-notice-title,
.floating-notice .floating-notice-description {
  margin: 0;
  line-height: 1.45;
}
.floating-notice-title {
  font-size: 15px;
  font-weight: 680;
}
.floating-notice-description {
  color: var(--theme-muted);
  font-size: 13px;
}
.floating-notice button.floating-notice-close {
  flex-shrink: 0;
  width: 44px;
  min-height: 44px;
  margin: 0 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--theme-muted);
  font-size: 40rpx;
  line-height: 44px;
}
</style>
