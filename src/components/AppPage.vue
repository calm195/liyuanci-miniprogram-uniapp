<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import AppTabBar from '@/components/AppTabBar.vue'
import type { MainTab } from '@/utils/navigation'
defineProps<{ tab?: MainTab; title?: string; brand?: boolean }>()
const theme = useThemeStore()
// 自定义导航仅用于主页面，为系统状态栏和微信胶囊保留空间。
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0
</script>
<template>
  <view v-show="isPageVisible" class="page" :class="{ 'has-tabs': tab }" :style="theme.variables">
    <view v-if="title" class="app-header" :style="{ paddingTop: `${statusBarHeight}px` }">
      <view class="app-header-inner">
        <image v-if="brand" src="/static/illustrations/brand-koi.png" class="brand-koi" />
        <text class="ui-text">{{ title }}</text>
      </view>
    </view>
    <view class="page-content"><slot /></view>
    <AppTabBar v-if="tab" :active="tab" />
  </view>
</template>
