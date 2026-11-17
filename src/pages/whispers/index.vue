<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import FeedPageHero from '@/components/FeedPageHero.vue'
import ContentStats from '@/components/ContentStats.vue'
import ContentToolbar from '@/components/ContentToolbar.vue'
import AppIcon from '@/components/AppIcon.vue'
import ContentSearchBar from '@/components/ContentSearchBar.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import { canWhisperAction } from '@/utils/whispers'
import { useWhisperFeed } from '@/composables/use-whisper-feed'
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
</script>
<template>
  <AppPage tab="whispers" title="悄悄话" responsive-padding>
    <FeedPageHero title="悄悄话" description="有些话，轻轻说就好。" illustration="entry-whisper" />
    <view class="ce-layout">
      <view class="whisper-shortcuts"
        ><navigator
          v-for="item in [
            { label: '我的心事', icon: 'chat', url: '/pages/whispers/mine' },
            { label: '我的回响', icon: 'bell', url: '/pages/whispers/notifications' },
            { label: '时光胶囊', icon: 'clock', url: '/pages/capsules/index' },
          ]"
          :key="item.url"
          :url="item.url"
          class="whisper-shortcut"
          ><view class="whisper-shortcut-content"
            ><AppIcon :name="item.icon" :size="40" /><text>{{ item.label }}</text></view
          ></navigator
        ></view
      >
      <ContentSearchBar
        :keyword="keyword"
        :sort="sort"
        :disabled="busy || writing || retryReady"
        @search="search"
      />
      <view v-if="items.length" class="whisper-feed-list">
        <view v-for="item in items" :key="item.id" class="whisper-feed-card">
          <navigator
            class="whisper-content-link"
            hover-class="tap-feedback"
            :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
          >
            <WhisperContent :content="item" preview />
          </navigator>
          <ContentToolbar>
            <button
              v-if="
                !item.viewer_is_author &&
                item.my_hug &&
                canWhisperAction('PublicPost', item, 'whisperHugSet')
              "
              class="content-action"
              :aria-label="item.my_hug.active ? '取消抱抱' : '抱抱'"
              :disabled="busy || writing || retryReady"
              :loading="isPageActionPending('whisper-feed-hug:' + item.id)"
              @click="runPageAction(() => hug(item), 'whisper-feed-hug:' + item.id)"
            >
              <AppIcon name="heart" :active="item.my_hug.active" :size="32" /><text class="ui-meta"
                >抱抱 {{ item.hug_count }}</text
              >
            </button>
            <text v-else class="ui-meta">抱抱 {{ item.hug_count }}</text>
            <navigator
              class="content-action"
              :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
              ><AppIcon name="chat" :size="28" /><text class="ui-meta"
                >暖评 {{ item.comment_count }}</text
              ></navigator
            >
            <ContentStats :views="item.view_count" />
          </ContentToolbar>
        </view>
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
    <navigator url="/pages/whispers/editor" class="floating-compose whisper-compose"
      >＋ 写心事</navigator
    >
  </AppPage>
</template>
<style scoped>
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
.ce-layout {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.whisper-content-link {
  display: block;
  margin: 0;
  color: var(--theme-ink);
}
.whisper-feed-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.whisper-feed-card {
  min-width: 0;
  margin: 0;
  padding: 32rpx;
  border-radius: 32rpx;
  background: var(--theme-surface);
  color: var(--theme-ink);
}
</style>
