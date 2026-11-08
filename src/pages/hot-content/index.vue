<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import HotContentList from '@/components/HotContentList.vue'
import { useHotContent } from '@/composables/use-hot-content'
import type { HotContentKind } from '@/types/content'

const kind = ref<HotContentKind>('wish')
const { wish, whisper, busy, errors, load } = useHotContent()
const items = computed(() => (kind.value === 'wish' ? wish.value : whisper.value))
onLoad((query) => {
  kind.value = query?.kind === 'whisper' ? 'whisper' : 'wish'
  uni.setNavigationBarTitle({ title: kind.value === 'wish' ? '心愿周榜' : '悄悄话周榜' })
})
onShow(() => {
  void load(kind.value)
})
onPullDownRefresh(async () => {
  try {
    await load(kind.value)
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>

<template>
  <AppPage>
    <HotContentList :items="items" :busy="busy[kind]" :error="errors[kind]" />
  </AppPage>
</template>
