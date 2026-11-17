<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import type { HelpDirectory } from '@/types/whispers'
const directory = ref<HelpDirectory | null>(null)
const page = useWhisperPage(() => {
  directory.value = null
})
const { error } = page
async function load() {
  await page.read(async (active) => {
    const result = await callWhisper('whisperHelpGet', {})
    if (active()) directory.value = result
  })
}
page.onRefresh(() => load())
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading title="解忧与公共援助" description="无需登录即可查看已核验的公共援助目录。" />

    <view v-if="directory?.status === 'ready'"
      ><text class="ui-copy">目录版本：{{ directory.version }}</text
      ><text class="ui-copy">核验日期（UTC）：{{ directory.verified_at }}</text
      ><view v-for="(item, index) in directory.items" :key="index" class="ui-section ce-group"
        ><text class="ui-copy">{{ item.label }}</text
        ><text class="ui-copy">{{ item.contact }}</text
        ><text class="ui-copy">来源：{{ item.source_url }}</text></view
      ><text v-if="!directory.items.length" class="ui-copy">当前目录暂无可展示的资源。</text></view
    >
    <text v-if="directory?.status === 'unavailable'" class="ui-copy"
      >核验后的援助目录尚未配置，当前不可用。</text
    >
    <navigator class="ui-link" url="/pages/care/index">查看本人关怀卡（需要本人登录）</navigator
    ><text class="ui-copy">公共援助目录与本人关怀卡分别授权。</text
    ><AppNotice :message="error" kind="error" />
  </AppPage>
</template>

<style scoped>
.ui-section.ce-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  min-width: 0;
}
</style>
