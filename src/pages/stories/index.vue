<script setup lang="ts">
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppPage from '@/components/AppPage.vue'
import StoryWall from '@/components/StoryWall.vue'

const storyId = ref('')
const storyWall = ref<InstanceType<typeof StoryWall> | null>(null)
onLoad((query) => {
  storyId.value = typeof query?.id === 'string' ? query.id : ''
})
onPullDownRefresh(async () => {
  try {
    await storyWall.value?.refresh()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage :tab="storyId ? undefined : 'pond'">
    <StoryWall ref="storyWall" :story-id="storyId" />
  </AppPage>
</template>
