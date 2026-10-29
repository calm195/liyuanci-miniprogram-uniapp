<script setup lang="ts">
withDefaults(defineProps<{ name: string; active?: boolean; size?: number }>(), { size: 40 })
</script>
<template>
  <image
    class="app-icon"
    :src="`/static/icons/${name}${active ? '-active' : ''}.svg`"
    :style="{ width: `${size}rpx`, height: `${size}rpx` }"
    mode="aspectFit"
    aria-hidden="true"
  />
</template>
<style scoped>
.app-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
