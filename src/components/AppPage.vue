<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
const theme = useThemeStore()
</script>
<template>
  <view v-show="isPageVisible" class="page" :style="theme.variables">
    <slot />
  </view>
</template>
