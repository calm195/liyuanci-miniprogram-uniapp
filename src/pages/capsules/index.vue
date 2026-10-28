<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { mergeWhisperPage } from '@/utils/whisper-content'
import { beijingTime, capsuleStatus } from '@/utils/capsules'
import type { CapsuleSummary } from '@/types/whispers'
const items = ref<CapsuleSummary[]>([])
const cursor = ref<string | null>(null)
const ready = ref(false)
const seen = new Set<string>()
const page = useWhisperPage(() => {
  items.value = []
  cursor.value = null
  ready.value = false
  seen.clear()
})
const { busy, writing, error } = page
const locked = computed(() => busy.value || writing.value)
async function load(more = false) {
  if (more && !cursor.value) return
  const previous = more ? cursor.value! : undefined
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后查看本人胶囊。')
    const result = await callWhisper('whisperCapsulesList', {
      query: { limit: 20, ...(previous ? { cursor: previous } : {}) },
    })
    if (!active()) return
    const merged = mergeWhisperPage(more ? items.value : [], result, previous, seen)
    items.value = merged.items
    cursor.value = merged.cursor
    ready.value = true
  }, more)
}
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">我的时光胶囊</text>
    <navigator url="/pages/capsules/create">写给未来的自己</navigator>
    <navigator url="/pages/whispers/help">解忧与公共援助</navigator>
    <navigator url="/pages/whispers/notifications">悄悄鲤通知</navigator>
    <button :disabled="locked" @click="runPageAction(() => load())">刷新列表</button>
    <text v-if="ready && !items.length">当前页暂无胶囊。</text>
    <view v-for="item in items" :key="item.id" class="card">
      <text>{{ capsuleStatus(item) }}</text>
      <text>预约时间（北京时间）：{{ beijingTime(item.unlock_at) }}</text>
      <navigator :url="`/pages/capsules/detail?id=${encodeURIComponent(item.id)}`"
        >读取当前详情与管理</navigator
      >
    </view>
    <button v-if="cursor" :disabled="locked" @click="runPageAction(() => load(true))">
      加载下一页
    </button>
    <text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
