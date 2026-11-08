<script setup lang="ts">
import { onHide, onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppPage from '@/components/AppPage.vue'
import StoryWall from '@/components/StoryWall.vue'
import { useContentShare } from '@/composables/use-content-share'
import { shareReference } from '@/utils/share'
import type { WishPublicContent } from '@/types/wish'

const storyId = ref('')
const shareRef = ref<string>()
const sharedEntry = ref(false)
const publicStory = ref<WishPublicContent | null>(null)
const storyWall = ref<InstanceType<typeof StoryWall> | null>(null)
useContentShare('story', () => (sharedEntry.value ? null : publicStory.value))
onLoad((query) => {
  shareRef.value = shareReference(query)
  sharedEntry.value = shareRef.value !== undefined || query?.shared === '1'
  if (shareRef.value === undefined && typeof query?.id === 'string') storyId.value = query.id
  if (sharedEntry.value && !storyId.value && shareRef.value === undefined) shareRef.value = ''
})
onShow(() => storyWall.value?.show())
onHide(() => {
  publicStory.value = null
  storyWall.value?.hide()
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
  <AppPage :tab="storyId || sharedEntry ? undefined : 'pond'" :hide-entry-prompts="sharedEntry">
    <StoryWall
      ref="storyWall"
      :story-id="storyId"
      :share-ref="shareRef"
      :read-only="sharedEntry"
      @share-content="publicStory = $event"
    />
  </AppPage>
</template>
