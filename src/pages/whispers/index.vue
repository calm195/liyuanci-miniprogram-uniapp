<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
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
  <AppPage tab="whispers" title="悄悄话">
    <view class="module-hero">
      <image src="/static/illustrations/entry-whisper.png" class="module-art" mode="aspectFit" />
      <view class="module-copy">
        <text class="module-title">有些话，轻轻说就好</text>
        <text class="module-subtitle">在悄悄鲤，让心事被温柔接住。</text>
      </view>
    </view>
    <view class="module-shortcuts">
      <navigator url="/pages/whispers/mine"
        ><AppIcon name="chat" /><text class="ui-text">我的心事</text></navigator
      >

      <navigator url="/pages/whispers/notifications"
        ><AppIcon name="bell" /><text class="ui-text">暖心回响</text></navigator
      >
    </view>
    <navigator url="/pages/whispers/help" class="kindness-strip"
      ><AppIcon name="leaf" :size="34" /><text class="ui-text"
        >如果有点累，来这里歇一歇 · 解忧与援助 ›</text
      ></navigator
    >
    <ContentSearchBar
      :keyword="keyword"
      :sort="sort"
      :disabled="busy || writing || retryReady"
      @search="search"
    />
    <view v-for="item in items" :key="item.id" class="whisper-preview">
      <navigator
        class="whisper-content-link"
        hover-class="tap-feedback"
        :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
      >
        <WhisperContent :content="item" />
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
          <AppIcon name="heart" :active="item.my_hug.active" :size="32" />
          <text>抱抱 {{ item.hug_count }}</text>
        </button>
        <text v-else class="ui-text">抱抱 {{ item.hug_count }}</text>
        <navigator
          class="content-action"
          :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
        >
          <AppIcon name="chat" :size="28" /><text>暖评 {{ item.comment_count }}</text>
        </navigator>
        <ContentStats :views="item.view_count" />
        <navigator
          class="content-action whisper-detail-link"
          :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
          >去听听 ›</navigator
        >
      </ContentToolbar>
    </view>
    <text v-if="busy && !items.length" class="page-footnote">正在加载悄悄话…</text>
    <view v-if="ready && !items.length && !busy" class="empty-state"
      ><AppIcon name="chat" :size="52" /><text>{{
        keyword ? '暂时没有符合条件的悄悄话' : '这里静静的，等一个轻轻的声音。'
      }}</text></view
    >
    <button
      v-if="cursor"
      :disabled="busy"
      :loading="isPageActionPending('pages-whispers-index-button-2')"
      @click="runPageAction(() => load(true), 'pages-whispers-index-button-2')"
    >
      加载下一页
    </button>
    <button
      v-if="retryReady"
      :disabled="writing"
      :loading="isPageActionPending('whisper-feed-retry')"
      @click="runPageAction(retry, 'whisper-feed-retry')"
    >
      使用原请求重试
    </button>
    <AppNotice :message="notice" kind="info" />
    <AppNotice :message="error" kind="error" />
    <navigator url="/pages/whispers/editor" class="floating-compose">＋ 说说心事</navigator>
  </AppPage>
</template>

<style scoped>
.module-hero {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 0;
}
.module-copy {
  flex: 1;
  min-width: 0;
}
.module-art {
  position: static;
  order: 1;
  flex: 0 0 88rpx;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  opacity: 0.8;
}
.module-hero .module-title {
  font-size: 34rpx;
}
.module-shortcuts {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.module-shortcuts.module-shortcuts navigator {
  flex-direction: row;
  padding: 20rpx 12rpx;
}
.whisper-content-link {
  margin: 0;
  color: var(--theme-ink);
}
.whisper-detail-link {
  margin-left: auto;
}
</style>
