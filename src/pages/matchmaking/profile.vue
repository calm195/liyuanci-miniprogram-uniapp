<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { matchmakingID } from '@/utils/matchmaking'

onLoad((query) => {
  const activity = matchmakingID(query?.activity) ? `?activity=${query.activity}` : ''
  uni.redirectTo({ url: `/pages/settings/index${activity}` })
})
</script>

<template>
  <view />
</template>
