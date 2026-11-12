<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { useUnreadStore } from '@/stores/unread'
const unread = useUnreadStore()
import { mainNavigation, switchMainTab } from '@/utils/navigation'
import type { MainTab } from '@/utils/navigation'
defineProps<{ active: MainTab }>()
</script>
<template>
  <view class="app-tabbar">
    <button
      v-for="item in mainNavigation"
      :key="item.key"
      class="tabbar-item"
      :class="{ 'tabbar-active': active === item.key }"
      :aria-label="item.label + (active === item.key ? '，当前页面' : '')"
      @click="
        runPageAction(
          () => switchMainTab(item.key, active),
          'components-AppTabBar-button-1' + ':' + item.key,
        )
      "
    >
      <view class="tab-icon"
        ><AppIcon :name="item.icon" :active="active === item.key" :size="44" /><text
          v-if="item.key === 'mine' && unread.label"
          class="unread-badge"
          :aria-label="`${unread.count}条未读通知`"
          >{{ unread.label }}</text
        ></view
      >
      <text class="ui-text">{{ item.label }}</text>
    </button>
  </view>
</template>

<style scoped>
.tab-icon {
  position: relative;
  display: flex;
}
.unread-badge {
  position: absolute;
  top: -14rpx;
  left: 28rpx;
  min-width: 30rpx;
  height: 32rpx;
  padding: 0 7rpx;
  border-radius: 20rpx;
  background: var(--theme-danger);
  color: white;
  font-size: 20rpx;
  line-height: 32rpx;
  text-align: center;
  border: 2rpx solid var(--theme-surface);
}
</style>
