<script setup lang="ts">
/* global getCurrentPages */
import { onShow } from '@dcloudio/uni-app'
import { useEntryStore } from '@/stores/entry'
const entry = useEntryStore()
let returning = false
onShow(() => {
  if (returning) return
  returning = true
  const open = () => {
    globalThis.setTimeout(() => entry.openLogin(), 0)
  }
  if (getCurrentPages().length > 1) {
    uni.navigateBack({
      success: open,
      fail: () => uni.switchTab({ url: '/pages/index/index', success: open }),
    })
  } else uni.switchTab({ url: '/pages/index/index', success: open })
})
</script>
<template><view /></template>
