<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import HotContentList from '@/components/HotContentList.vue'
import { useHotContent } from '@/composables/use-hot-content'
import type { HotContentKind } from '@/types/content'

const kind = ref<HotContentKind>('wish')
const { wish, whisper, busy, errors, load } = useHotContent()
const items = computed(() => (kind.value === 'wish' ? wish.value : whisper.value))
function selectKind(value: HotContentKind) {
  kind.value = value
  void load(value)
}
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
  <AppPage responsive-padding>
    <PageHeading title="本周热点" description="看看本周被认真阅读与回应的内容。" />
    <view class="hot-tabs"
      ><button
        class="ui-button"
        :class="{ 'ui-button-primary': kind === 'wish' }"
        @click="selectKind('wish')"
      >
        心愿周榜</button
      ><button
        class="ui-button"
        :class="{ 'ui-button-primary': kind === 'whisper' }"
        @click="selectKind('whisper')"
      >
        悄悄话周榜
      </button></view
    >
    <HotContentList :items="items" :busy="busy[kind]" :error="errors[kind]" />
  </AppPage>
</template>

<style scoped>
.hot-tabs {
  display: flex;
  gap: 16rpx;
  margin-bottom: 24rpx;
}
.hot-tabs .ui-button {
  flex: 1;
}
</style>
