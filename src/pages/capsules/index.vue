<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import AppIcon from '@/components/AppIcon.vue'
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
    if (!more) seen.clear()
    const merged = mergeWhisperPage(more ? items.value : [], result, previous, seen)
    items.value = merged.items
    cursor.value = merged.cursor
    ready.value = true
  }, more)
}
function createCapsule() {
  uni.navigateTo({ url: '/pages/capsules/create' })
}
page.onRefresh(() => load())
onShow(() => {
  void load()
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading
      title="时光胶囊"
      illustration="entry-whisper"
      description="把此刻的心情，留给未来的某一天。"
    >
      <button class="ui-button ui-button-primary" @click="createCapsule">新建胶囊</button>
    </PageHeading>
    <view class="ce-layout">
      <text v-if="busy && !items.length" class="ui-state">正在读取你的胶囊…</text>
      <text v-if="ready && !items.length && !busy && !error" class="ui-state"
        >还没有胶囊，写一封信给未来吧。</text
      >
      <view v-if="items.length" class="capsule-timeline">
        <navigator
          v-for="item in items"
          :key="item.id"
          class="capsule-row"
          :url="`/pages/capsules/detail?id=${encodeURIComponent(item.id)}`"
        >
          <view class="capsule-status"
            ><AppIcon name="clock" :size="36" /><text class="ui-meta">{{
              capsuleStatus(item)
            }}</text></view
          >
          <text class="ui-section-title">写给未来的一封信</text>
          <text v-if="item.status === 'unlocked' && item.preview" class="ui-copy"
            >{{ item.preview }}…</text
          >
          <text class="ui-meta">预约时间 · {{ beijingTime(item.unlock_at) }}</text>
          <text class="ui-link">查看这封信 ›</text>
        </navigator>
      </view>
      <button
        v-if="cursor"
        class="ui-button"
        :disabled="locked"
        :loading="isPageActionPending('pages-capsules-index-button-2')"
        @click="runPageAction(() => load(true), 'pages-capsules-index-button-2')"
      >
        加载下一页
      </button>
      <AppNotice :message="error" kind="error" />
    </view>
  </AppPage>
</template>
<style scoped>
.ce-layout {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.ce-panel {
  margin-bottom: 0;
}
.capsule-timeline {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.capsule-row {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin: 0;
  color: var(--theme-ink);
  padding: 36rpx;
  border: 2rpx solid var(--theme-line);
  border-radius: 24rpx;
  background: linear-gradient(135deg, var(--theme-peach), var(--theme-surface));
}
.capsule-status {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}
.capsule-row .ui-link {
  align-self: flex-end;
}
</style>
