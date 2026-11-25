<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import LoginLink from '@/components/LoginLink.vue'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhispersStore } from '@/stores/whispers'
import { useUserStore } from '@/stores/user'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { mergeWhisperPage, whisperStates } from '@/utils/whisper-content'
import type { OwnerPost } from '@/types/whispers'
const module = useWhispersStore()
const user = useUserStore()
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
    if (!session.getToken()) return
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
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading title="我的心事" />
    <view class="whisper-mine-list">
      <view v-for="post in posts" :key="post.id" class="whisper-mine-card">
        <navigator
          v-if="post.title || post.body || post.allowed_actions.length"
          class="whisper-mine-link"
          hover-class="tap-feedback"
          :url="`/pages/whispers/detail?id=${encodeURIComponent(post.id)}&manage=1`"
        >
          <WhisperContent v-if="post.title || post.body" :content="post" preview />
          <text v-else class="whisper-mine-state">这条心事暂时无法查看</text>
          <view class="whisper-mine-meta">
            <text>{{ whisperStates[post.status] }}</text
            ><text>查看心事 ›</text>
          </view>
        </navigator>
        <template v-else>
          <text class="whisper-mine-state">{{ whisperStates[post.status] }}</text>
          <text class="whisper-mine-meta">这条心事暂时无法查看。</text>
        </template>
        <text v-if="post.review_result?.reason" class="ui-meta notice">{{
          post.review_result.reason
        }}</text>
        <text v-if="post.review_result?.revision_suggestion" class="ui-meta notice">{{
          post.review_result.revision_suggestion
        }}</text>
      </view>
      <view v-if="!posts.length && !user.isLoggedIn" class="whisper-mine-card">
        <LoginLink class="ui-link">登录后查看我的心事</LoginLink>
      </view>
      <view v-else-if="busy && !posts.length" class="whisper-mine-card">
        <text class="whisper-mine-meta">正在加载我的心事…</text>
      </view>
      <view v-else-if="ready && !posts.length && !error" class="whisper-mine-card empty-state">
        <text class="whisper-mine-meta">还没有心事。</text>
      </view>
      <button
        v-if="cursor"
        class="ui-button"
        :disabled="busy || writing || retryReady"
        :loading="isPageActionPending('whisper-mine-more')"
        @click="runPageAction(() => load(true), 'whisper-mine-more')"
      >
        加载下一页
      </button>
      <AppNotice :message="error" kind="error" />
      <button
        v-if="error"
        class="ui-button"
        :disabled="busy"
        :loading="isPageActionPending('whisper-mine-reload')"
        @click="runPageAction(() => load(), 'whisper-mine-reload')"
      >
        重新读取
      </button>
      <navigator url="/pages/whispers/editor" class="ui-button ui-button-primary">
        ＋ 写心事
      </navigator>
    </view>
  </AppPage>
</template>
<style scoped>
.whisper-mine-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.whisper-mine-card {
  min-width: 0;
  padding: 28rpx;
  border: 1px solid var(--theme-line);
  border-radius: 34rpx;
  background: var(--theme-surface);
}
.whisper-mine-card .whisper-mine-link {
  display: block;
  margin: 0;
  color: var(--theme-ink);
}
.whisper-mine-state {
  display: block;
  margin: 0 0 12rpx;
  color: var(--theme-ink);
  font-size: 28rpx;
  font-weight: 650;
}
.whisper-mine-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12rpx;
  margin: 12rpx 0 0;
  color: var(--theme-muted);
  font-size: 24rpx;
}
.whisper-mine-meta text {
  margin: 0;
}
.whisper-mine-link .whisper-mine-meta text:last-child {
  color: var(--theme-teal);
}
</style>
