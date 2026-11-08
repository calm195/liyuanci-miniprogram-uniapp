<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
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
      <text class="module-title">有些话，轻轻说就好</text>
      <text class="module-subtitle">在悄悄鲤，让心事被温柔接住。</text>
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
      <WhisperContent :content="item" />
      <view class="card-footer">
        <view class="meta-item">
          <button
            v-if="
              !item.viewer_is_author &&
              item.my_hug &&
              canWhisperAction('PublicPost', item, 'whisperHugSet')
            "
            class="hug-button"
            :class="{ hugged: item.my_hug.active }"
            :disabled="busy || writing || retryReady"
            :loading="isPageActionPending('whisper-feed-hug:' + item.id)"
            @click="runPageAction(() => hug(item), 'whisper-feed-hug:' + item.id)"
          >
            <AppIcon name="heart" :size="28" />{{ item.my_hug.active ? '已抱抱' : '抱抱' }}
            {{ item.hug_count }}
          </button>
          <text v-else>{{ item.hug_count }} 个抱抱</text
          ><text class="ui-text"> · {{ item.comment_count }} 条暖评</text>
        </view>
        <navigator
          class="small-link"
          :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
          >去听听 ›</navigator
        >
      </view>
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
.hug-button {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  margin: 0;
  padding: 0 18rpx;
  font-size: 24rpx;
  line-height: 2.2;
  color: var(--theme-muted);
  background: transparent;
}
.hugged {
  color: var(--theme-brand);
  background: var(--theme-peach);
}
</style>
