<script setup lang="ts">
defineProps<{ title: string; description: string; number: string }>()
</script>
<template>
  <view class="card flex gap-4">
    <text class="text-blue-600 font-bold">{{ number }}</text>
    <view class="flex-1">
      <view class="font-bold mb-2">{{ title }}</view>
      <view class="subtitle">{{ description }}</view>
    </view>
  </view>
</template>
