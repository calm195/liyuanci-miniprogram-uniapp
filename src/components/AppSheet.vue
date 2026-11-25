<script setup lang="ts">
defineProps<{ title: string; busy?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>
<template>
  <view class="app-sheet-shade">
    <view class="app-sheet-backdrop" aria-hidden="true" @click="!busy && emit('close')" />
    <view class="app-sheet" role="dialog" :aria-label="title" aria-modal="true">
      <view class="app-sheet-heading">
        <text>{{ title }}</text>
        <button
          class="app-sheet-close"
          aria-label="关闭面板"
          :disabled="busy"
          @click="emit('close')"
        >
          ×
        </button>
      </view>
      <scroll-view scroll-y class="app-sheet-content">
        <slot />
      </scroll-view>
    </view>
  </view>
</template>
<style scoped>
.app-sheet-shade {
  position: fixed;
  inset: 0;
  z-index: 1600;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.app-sheet-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(9 29 61 / 50%);
}
.app-sheet {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 540px;
  min-width: 0;
  padding: 12px 18px calc(16px + env(safe-area-inset-bottom));
  border-radius: 22px 22px 0 0;
  background: var(--theme-surface);
}
.app-sheet-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-line);
}
.app-sheet-heading text {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
button.app-sheet-close {
  flex: none;
  width: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 24px;
  color: var(--theme-muted);
}
.app-sheet-close::after {
  border: 0;
}
.app-sheet-content {
  max-height: 66vh;
}
</style>
