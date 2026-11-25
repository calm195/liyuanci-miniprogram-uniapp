<script setup lang="ts">
import { onShareAppMessage } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import FeedPageHero from '@/components/FeedPageHero.vue'
import AppIcon from '@/components/AppIcon.vue'
import ContentSearchBar from '@/components/ContentSearchBar.vue'
import WhisperFeedCard from '@/components/WhisperFeedCard.vue'
import { useWhisperFeed } from '@/composables/use-whisper-feed'
import { brandFriendShare, nativeShareQuery, shareCover } from '@/utils/share'
const {
  items,
  cursor,
  ready,
  busy,
  writing,
  retryReady,
  error,
  notice,
  keyword,
  sort,
  load,
  search,
  hug,
  retry,
} = useWhisperFeed()
onShareAppMessage((event) => {
  const id = event.target?.dataset?.postId as unknown
  if (
    event.from !== 'button' ||
    typeof id !== 'string' ||
    !items.value.some((item) => item.id === id)
  )
    return brandFriendShare()
  return {
    title: '鲤愿池 · 一条悄悄话',
    imageUrl: shareCover,
    path: `/pages/whispers/detail?${nativeShareQuery(id)}`,
  }
})
</script>
<template>
  <AppPage tab="whispers" title="悄悄话" responsive-padding>
    <FeedPageHero title="悄悄话" description="有些话，轻轻说就好。" illustration="entry-whisper" />
    <view class="ce-layout">
      <view class="whisper-shortcuts">
        <navigator
          v-for="item in [
            { label: '我的心事', icon: 'chat', url: '/pages/whispers/mine' },
            { label: '我的回响', icon: 'bell', url: '/pages/whispers/notifications' },
            { label: '时光胶囊', icon: 'clock', url: '/pages/capsules/index' },
          ]"
          :key="item.url"
          :url="item.url"
          class="whisper-shortcut"
        >
          <view class="whisper-shortcut-content">
            <AppIcon :name="item.icon" :size="40" /><text>{{ item.label }}</text>
          </view>
        </navigator>
      </view>
      <ContentSearchBar
        :keyword="keyword"
        :sort="sort"
        :disabled="busy || writing || retryReady"
        @search="search"
      />
      <view v-if="items.length" class="whisper-feed-list">
        <WhisperFeedCard
          v-for="item in items"
          :key="item.id"
          :post="item"
          :hug="hug"
          :disabled="busy || writing || retryReady"
        />
      </view>
      <text v-if="busy && !items.length" class="ui-state">正在加载悄悄话…</text>
      <text v-if="ready && !items.length && !busy && !error" class="ui-state">{{
        keyword ? '暂时没有符合条件的悄悄话' : '这里静静的，等一个轻轻的声音。'
      }}</text>
      <button
        v-if="cursor"
        class="ui-button"
        :disabled="busy"
        :loading="isPageActionPending('pages-whispers-index-button-2')"
        @click="runPageAction(() => load(true), 'pages-whispers-index-button-2')"
      >
        加载下一页
      </button>
      <button
        v-if="retryReady"
        class="ui-button ui-button-primary"
        :disabled="writing"
        :loading="isPageActionPending('whisper-feed-retry')"
        @click="runPageAction(retry, 'whisper-feed-retry')"
      >
        使用原请求重试
      </button>
      <AppNotice :message="notice" kind="info" /><AppNotice :message="error" kind="error" />
    </view>
    <view class="compose-space" aria-hidden="true" />
    <navigator url="/pages/whispers/editor" class="floating-compose whisper-compose">
      ＋ 写心事
    </navigator>
  </AppPage>
</template>
<style scoped>
.ce-layout,
.whisper-feed-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.whisper-compose.whisper-compose {
  left: auto;
  right: 28rpx;
}
.compose-space {
  height: 88rpx;
}
.whisper-shortcuts {
  display: flex;
  gap: 12rpx;
  width: 100%;
}
.whisper-shortcut {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 24rpx 4rpx;
  background: var(--theme-peach);
  border-radius: 20rpx;
  color: var(--theme-ink);
}
.whisper-shortcut:nth-child(2) {
  background: var(--theme-mint);
}
.whisper-shortcut:nth-child(3) {
  background: var(--theme-surface);
}
.whisper-shortcut-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  font-size: 24rpx;
}
.whisper-shortcut-content text {
  margin: 0;
}
</style>
