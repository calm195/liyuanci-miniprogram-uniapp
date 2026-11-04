<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
const theme = useThemeStore()
</script>
<template>
  <view class="card">
    <text class="font-bold">外观</text>
    <text class="subtitle">选择亮色或暗色，设置仅保存在本机。</text>
    <view class="flex gap-3">
      <button
        class="flex-1"
        :class="{ 'theme-selected': theme.mode === 'light' }"
        :aria-pressed="theme.mode === 'light'"
        :loading="isPageActionPending('components-ThemeSwitcher-button-1')"
        @click="runPageAction(() => theme.setMode('light'), 'components-ThemeSwitcher-button-1')"
      >
        {{ theme.mode === 'light' ? '已选：亮色' : '亮色' }}
      </button>
      <button
        class="flex-1"
        :class="{ 'theme-selected': theme.mode === 'dark' }"
        :aria-pressed="theme.mode === 'dark'"
        :loading="isPageActionPending('components-ThemeSwitcher-button-2')"
        @click="runPageAction(() => theme.setMode('dark'), 'components-ThemeSwitcher-button-2')"
      >
        {{ theme.mode === 'dark' ? '已选：暗色' : '暗色' }}
      </button>
    </view>
  </view>
</template>
