<script setup lang="ts">
import {
  onHide,
  onLoad,
  onPullDownRefresh,
  onShow,
  onShareAppMessage,
  onShareTimeline,
} from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import StoryWall from '@/components/StoryWall.vue'
import { useContentShare } from '@/composables/use-content-share'
import { shareReference } from '@/utils/share'
import type { WishPublicContent } from '@/types/wish'

const storyId = ref('')
const shareRef = ref<string>()
const sharedEntry = ref(false)
const publicStory = ref<WishPublicContent | null>(null)
const storyWall = ref<InstanceType<typeof StoryWall> | null>(null)
const { friendShare, timelineShare } = useContentShare('story', () =>
  !sharedEntry.value && publicStory.value?.id === storyId.value ? publicStory.value : null,
)
onShareAppMessage(friendShare)
onShareTimeline(timelineShare)
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
  <AppPage
    responsive-padding
    :tab="storyId || sharedEntry ? undefined : 'pond'"
    :hide-entry-prompts="sharedEntry"
  >
    <PageHeading
      v-if="!storyId && !sharedEntry"
      title="还愿故事"
      description="读读那些被认真回应的期待。"
    />
    <StoryWall
      ref="storyWall"
      :story-id="storyId"
      :share-ref="shareRef"
      :read-only="sharedEntry"
      @share-content="publicStory = $event"
    />
  </AppPage>
</template>
