<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import type { HelpDirectory } from '@/types/whispers'
const directory = ref<HelpDirectory | null>(null)
const page = useWhisperPage(() => {
  directory.value = null
})
const { busy, error } = page
async function load() {
  await page.read(async (active) => {
    const result = await callWhisper('whisperHelpGet', {})
    if (active()) directory.value = result
  })
}
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">解忧与公共援助</text><text>无需登录即可查看经核验的公共援助目录。</text>
    <button :disabled="busy" @click="runPageAction(load)">刷新目录</button>
    <view v-if="directory?.status === 'ready'"
      ><text>目录版本：{{ directory.version }}</text
      ><text>核验日期（UTC）：{{ directory.verified_at }}</text
      ><view v-for="(item, index) in directory.items" :key="index" class="card"
        ><text>{{ item.label }}</text
        ><text>{{ item.contact }}</text
        ><text>来源：{{ item.source_url }}</text></view
      ><text v-if="!directory.items.length">当前目录暂无可展示的资源。</text></view
    >
    <text v-if="directory?.status === 'unavailable'">核验后的援助目录尚未配置，当前不可用。</text>
    <navigator url="/pages/care/index">查看本人关怀卡（需要本人登录）</navigator
    ><text>公共援助目录与本人关怀卡分别授权。</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
