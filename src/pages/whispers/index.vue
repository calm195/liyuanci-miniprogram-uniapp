<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import AppIcon from '@/components/AppIcon.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import { useWhisperFeed } from '@/composables/use-whisper-feed'
const { items, cursor, ready, busy, error, load } = useWhisperFeed()
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
      <navigator url="/pages/capsules/index"
        ><AppIcon name="clock" /><text class="ui-text">时光胶囊</text></navigator
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
    <view class="section-heading"
      ><text class="section-title">听见彼此</text
      ><button class="small-link" :disabled="busy" @click="runPageAction(() => load())">
        {{ busy ? '加载中…' : '刷新' }}
      </button></view
    >
    <view v-for="item in items" :key="item.id" class="whisper-preview">
      <WhisperContent :content="item" />
      <view class="card-footer"
        ><view class="meta-item"
          ><AppIcon name="heart" :size="28" /><text class="ui-text"
            >{{ item.hug_count }} 个抱抱 · {{ item.comment_count }} 条暖评</text
          ></view
        ><navigator
          class="small-link"
          :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
          >去听听 ›</navigator
        ></view
      >
    </view>
    <view v-if="ready && !items.length && !busy" class="empty-state"
      ><AppIcon name="chat" :size="52" /><text>这里静静的，等一个轻轻的声音。</text></view
    >
    <button v-if="cursor" :disabled="busy" @click="runPageAction(() => load(true))">
      加载下一页
    </button>
    <text v-if="error" class="notice">{{ error }}</text>
    <navigator url="/pages/whispers/editor" class="floating-compose">＋ 说说心事</navigator>
  </AppPage>
</template>
