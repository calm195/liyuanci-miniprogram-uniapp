<script setup lang="ts">
import AppNoticeHost from '@/components/AppNoticeHost.vue'
import { usePageNotices } from '@/composables/use-page-notices'
import { useThemeStore } from '@/stores/theme'
import EntryPrompts from '@/components/EntryPrompts.vue'
import AppTabBar from '@/components/AppTabBar.vue'
import type { MainTab } from '@/utils/navigation'
defineProps<{
  tab?: MainTab
  title?: string
  brand?: boolean
  hideEntryPrompts?: boolean
  hideEntryGuide?: boolean
  responsivePadding?: boolean
}>()
const emit = defineEmits<{ loginCancel: [] }>()
const theme = useThemeStore()
const notifications = usePageNotices()
// 主页面恢复品牌导航，胶囊所在行本身承载标题，不再额外叠加一段顶部留白。
let statusBarHeight = 0
let navigationHeight = 44
let navigationRight = 20
// #ifdef MP-WEIXIN
const windowInfo = uni.getSystemInfoSync()
statusBarHeight = windowInfo.statusBarHeight || 0
const capsule = uni.getMenuButtonBoundingClientRect?.()
if (capsule?.height && capsule.top >= statusBarHeight) {
  navigationHeight = Math.max(44, capsule.height + (capsule.top - statusBarHeight) * 2)
  navigationRight = Math.max(20, windowInfo.windowWidth - capsule.left + 12)
}
// #endif
</script>
<template>
  <view
    class="page"
    :class="{ 'has-tabs': tab, 'responsive-padding': responsivePadding }"
    :style="`${theme.variables};--status-bar-height:${statusBarHeight}px;--navigation-height:${navigationHeight}px;--navigation-right:${navigationRight}px`"
  >
    <AppNoticeHost :items="notifications.items.value" @dismiss="notifications.dismiss" />
    <view v-if="tab" class="app-header">
      <view class="app-header-inner">
        <image src="/static/illustrations/brand-koi.png" class="brand-koi" mode="aspectFit" />
        <text class="brand-title">鲤愿池</text>
      </view>
    </view>
    <view class="page-content"><slot /></view>
    <AppTabBar v-if="tab" :active="tab" />
    <EntryPrompts
      v-if="isPageVisible && !hideEntryPrompts"
      :hide-guide="hideEntryGuide"
      @login-cancel="emit('loginCancel')"
    />
  </view>
</template>

<style scoped>
.page,
.page.responsive-padding {
  padding: 24rpx 40rpx;
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
}
.page.has-tabs,
.page.responsive-padding.has-tabs {
  padding-top: 0;
  padding-bottom: calc(148rpx + env(safe-area-inset-bottom));
}
.app-header {
  position: sticky;
  top: 0;
  z-index: 8;
  margin: 0 -40rpx;
  padding: var(--status-bar-height) var(--navigation-right) 0 40rpx;
  background: var(--theme-canvas);
}
.app-header-inner {
  display: flex;
  align-items: center;
  gap: 16rpx;
  height: var(--navigation-height);
}
.brand-koi {
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  border-radius: 50%;
}
.brand-title {
  margin: 0;
  color: var(--theme-ink);
  font-size: 40rpx;
  font-weight: 750;
  line-height: 1.4;
}
.has-tabs .page-content {
  padding-top: 8rpx;
}
</style>
