<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import AppIcon from '@/components/AppIcon.vue'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { mergeWhisperPage, whisperStates } from '@/utils/whisper-content'
import type { OwnerPost } from '@/types/whispers'
const module = useWhispersStore()
const posts = ref<OwnerPost[]>([])
const cursor = ref<string | null>(null)
const ready = ref(false)
const seen = new Set<string>()
const page = useWhisperPage(() => {
  posts.value = []
  cursor.value = null
  ready.value = false
  seen.clear()
})
const { busy, writing, error, retryReady } = page
async function load(more = false) {
  if (more && !cursor.value) return
  const previous = more ? cursor.value! : undefined
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后查看自己的心事。')
    if (!more) await module.refresh()
    if (!active()) return
    if (!module.config?.enabled) throw new Error('悄悄话尚未开放或当前不可用。')
    const result = await callWhisper('whisperOwnPostsList', {
      query: { limit: 20, ...(previous ? { cursor: previous } : {}) },
    })
    if (!active()) return
    if (!more) seen.clear()
    const merged = mergeWhisperPage(more ? posts.value : [], result, previous, seen)
    posts.value = merged.items
    cursor.value = merged.cursor
    ready.value = true
  }, more)
}
page.onRefresh(() => load())
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">我的心事</text>
    <view v-for="post in posts" :key="post.id" class="whisper-preview">
      <text class="post-heading">{{ post.title || '未命名悄悄话' }}</text>
      <view class="post-meta"
        ><text class="author-tag">帖主</text><text>{{ whisperStates[post.status] }}</text></view
      >
      <text v-if="post.body" class="whitespace-pre-wrap">{{ post.body }}</text>
      <text v-if="post.review_result?.reason" class="notice">{{ post.review_result.reason }}</text>
      <text v-if="post.review_result?.revision_suggestion" class="notice">{{
        post.review_result.revision_suggestion
      }}</text>
      <navigator
        class="small-link"
        :url="`/pages/whispers/detail?id=${encodeURIComponent(post.id)}&manage=1`"
        >查看心事 ›</navigator
      >
    </view>
    <view v-if="ready && !posts.length && !busy" class="empty-state"
      ><AppIcon name="chat" :size="52" /><text>还没有心事，想说的话可以慢慢写。</text></view
    >
    <button
      v-if="cursor"
      :disabled="busy || writing || retryReady"
      :loading="isPageActionPending('whisper-mine-more')"
      @click="runPageAction(() => load(true), 'whisper-mine-more')"
    >
      加载下一页
    </button>
    <text v-if="error" class="error">{{ error }}</text>
    <navigator url="/pages/whispers/editor" class="floating-compose">＋ 说说心事</navigator>
  </AppPage>
</template>
<style scoped>
.post-heading {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.post-meta {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  color: var(--theme-muted);
}
.author-tag {
  padding: 4rpx 14rpx;
  color: var(--theme-teal);
  background: var(--theme-mint);
  border-radius: 12rpx;
}
.small-link {
  display: block;
  margin-top: 24rpx;
}
</style>
