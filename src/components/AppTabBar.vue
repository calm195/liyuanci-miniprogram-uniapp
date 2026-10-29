<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
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
      @click="runPageAction(() => switchMainTab(item.key, active))"
    >
      <AppIcon :name="item.icon" :active="active === item.key" :size="44" />
      <text class="ui-text">{{ item.label }}</text>
    </button>
  </view>
</template>
