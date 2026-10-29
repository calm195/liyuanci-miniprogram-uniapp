<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import AppIcon from '@/components/AppIcon.vue'
import WishPreview from '@/components/WishPreview.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import { useHomeWishes } from '@/composables/use-home-wishes'
import { useWhisperFeed } from '@/composables/use-whisper-feed'
import { useUserStore } from '@/stores/user'
import { config } from '@/config'
const user = useUserStore()
const { rows, busy, error, load } = useHomeWishes()
const {
  items: latestWhispers,
  ready: whispersReady,
  busy: whispersBusy,
  error: whispersError,
  load: refreshWhispers,
} = useWhisperFeed(1)
const shortcuts = [
  {
    label: '许个心愿',
    caption: '让善意发生',
    art: 'entry-wish',
    url: '/pages/wishes/index?compose=1',
  },
  { label: '说说心事', caption: '有人在听', art: 'entry-whisper', url: '/pages/whispers/index' },
  {
    label: '找个搭子',
    caption: '遇见同路人',
    art: 'entry-buddy',
    url: '/pages/wishes/index?category=team',
  },
  { label: '资料广场', caption: '认证后查看', art: '', url: '/pages/resources/index' },
]
</script>
<template>
  <AppPage tab="home" title="鲤愿池" brand>
    <view v-if="config.useMock" class="notice">合成演示 · 不发送 API</view>
    <view class="greeting-row">
      <view class="greeting-copy"
        ><AppIcon name="sun" :size="34" /><text class="ui-text">嗨，今天也有好运气</text></view
      >
      <navigator
        :url="user.isLoggedIn ? '/pages/profile/index' : '/pages/login/index'"
        class="small-link"
        >{{ user.isLoggedIn ? '我的主页 ›' : '登录 ›' }}</navigator
      >
    </view>
    <view class="home-hero">
      <image class="hero-art" src="/static/illustrations/pond.jpg" mode="aspectFill" />
      <view class="hero-copy">
        <text class="hero-title">{{ '把小小心愿\n交给大大的善意' }}</text>
        <text class="hero-subtitle">总有一条锦鲤，为你而来。</text>
        <navigator url="/pages/wishes/index?compose=1" class="hero-button"
          >许个心愿 <text class="ui-text">→</text></navigator
        >
      </view>
    </view>
    <view class="quick-grid">
      <navigator v-for="entry in shortcuts" :key="entry.label" :url="entry.url" class="quick-entry">
        <image
          v-if="entry.art"
          :src="`/static/illustrations/${entry.art}.png`"
          class="entry-art"
          mode="aspectFit"
        />
        <view v-else class="quick-symbol"><AppIcon name="book" :size="52" /></view>
        <text class="ui-text">{{ entry.label }}</text
        ><text class="entry-caption">{{ entry.caption }}</text>
      </navigator>
    </view>
    <navigator url="/pages/wishes/index" class="kindness-strip"
      ><AppIcon name="notice" :size="32" /><text class="ui-text"
        >今日锦鲤 · 你也可以成为别人的锦鲤</text
      ></navigator
    >
    <view class="section-heading"
      ><text class="section-title">新鲜心愿</text
      ><navigator url="/pages/wishes/index" class="small-link">去捞一捞 ›</navigator></view
    >
    <WishPreview v-for="wish in rows" :key="wish.id" :wish="wish" compact />
    <view v-if="!rows.length" class="empty-state">
      <AppIcon name="fish" :size="52" />
      <text>{{ busy ? '正在捞起新鲜心愿…' : error || '心愿池静静的，等你投下第一份期待。' }}</text>
      <button v-if="error" class="small-link" @click="runPageAction(() => load())">再捞一次</button>
    </view>
    <view class="section-heading"
      ><text class="section-title">悄悄话</text
      ><navigator url="/pages/whispers/index" class="small-link">去听一听 ›</navigator></view
    >
    <navigator
      v-for="item in latestWhispers"
      :key="item.id"
      :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
      class="whisper-preview"
    >
      <WhisperContent :content="item" />
      <view class="card-meta"
        ><AppIcon name="heart" :size="28" /><text class="ui-text"
          >{{ item.hug_count }} 个抱抱 · {{ item.comment_count }} 条暖评</text
        ></view
      >
    </navigator>
    <view v-if="!latestWhispers.length" class="whisper-preview">
      <text>{{
        whispersBusy
          ? '正在听见你的心事…'
          : whispersError ||
            (whispersReady ? '有些话，轻轻说就好。这里有人愿意听。' : '心事也值得被温柔以待。')
      }}</text>
      <button
        v-if="whispersError"
        class="small-link"
        @click="runPageAction(() => refreshWhispers())"
      >
        重新加载
      </button>
    </view>
    <text class="page-footnote">许愿有人应，心事有人听。</text>
  </AppPage>
</template>
