<script setup lang="ts">
import { openMainPage } from '@/utils/navigation'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import AppIcon from '@/components/AppIcon.vue'
import WishPreview from '@/components/WishPreview.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import HotContentList from '@/components/HotContentList.vue'
import { useHotContent } from '@/composables/use-hot-content'
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
const {
  wish: hotWishes,
  whisper: hotWhispers,
  busy: hotBusy,
  errors: hotErrors,
  load: loadHot,
} = useHotContent()
const refreshHot = () => Promise.all([loadHot('wish'), loadHot('whisper')])
onShow(() => {
  void refreshHot()
})
const shortcuts = [
  {
    label: '许个心愿',
    caption: '让善意发生',
    art: 'entry-wish',
    url: '/pages/wishes/shortcut?compose=1',
  },
  { label: '说说心事', caption: '有人在听', art: 'entry-whisper', url: '/pages/whispers/editor' },
  {
    label: '找个搭子',
    caption: '遇见同路人',
    art: 'entry-buddy',
    url: '/pages/wishes/shortcut?category=team',
  },
  { label: '资料广场', caption: '认证后查看', art: '', url: '/pages/resources/index' },
]
function openShortcut(url: string) {
  return url === '/pages/resources/index' ? openMainPage(url) : uni.navigateTo({ url })
}
onPullDownRefresh(async () => {
  try {
    await Promise.all([load(), refreshWhispers(), refreshHot()])
  } finally {
    uni.stopPullDownRefresh()
  }
})
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
        :open-type="user.isLoggedIn ? 'switchTab' : 'navigate'"
        class="small-link"
        >{{ user.isLoggedIn ? '我的主页 ›' : '登录 ›' }}</navigator
      >
    </view>
    <view class="home-hero">
      <image class="hero-art" src="/static/illustrations/pond.jpg" mode="aspectFill" />
      <view class="hero-copy">
        <text class="hero-title">{{ '把小小心愿\n交给大大的善意' }}</text>
        <text class="hero-subtitle">总有一条锦鲤，为你而来。</text>
        <view
          role="button"
          class="hero-button"
          @click="runPageAction(() => openShortcut('/pages/wishes/shortcut?compose=1'))"
          >许个心愿 <text class="ui-text">→</text></view
        >
      </view>
    </view>
    <view class="quick-grid">
      <view
        v-for="entry in shortcuts"
        :key="entry.label"
        role="button"
        class="quick-entry"
        @click="runPageAction(() => openShortcut(entry.url))"
      >
        <image
          v-if="entry.art"
          :src="`/static/illustrations/${entry.art}.png`"
          class="entry-art"
          mode="aspectFit"
        />
        <view v-else class="quick-symbol"><AppIcon name="book" :size="52" /></view>
        <text class="ui-text">{{ entry.label }}</text
        ><text class="entry-caption">{{ entry.caption }}</text>
      </view>
    </view>
    <navigator url="/pages/matchmaking/index" class="matchmaking-entry">
      <AppIcon name="heart" :size="48" />
      <view
        ><text class="section-title">包分配活动</text
        ><text>填写期待，随活动认识一位新朋友</text></view
      >
      <text class="small-link">查看 ›</text>
    </navigator>
    <view
      role="button"
      class="kindness-strip"
      @click="runPageAction(() => openMainPage('/pages/wishes/index'))"
      ><AppIcon name="notice" :size="32" /><text class="ui-text"
        >今日锦鲤 · 你也可以成为别人的锦鲤</text
      ></view
    >
    <view v-if="!config.useMock">
      <view class="section-heading"><text class="section-title">本周热点</text></view>
      <view class="section-heading">
        <text>热门心愿</text>
        <navigator class="small-link" url="/pages/hot-content/index?kind=wish"
          >查看更多 ›</navigator
        >
      </view>
      <HotContentList :items="hotWishes.slice(0, 3)" :busy="hotBusy.wish" :error="hotErrors.wish" />
      <view class="section-heading">
        <text>热门悄悄话</text>
        <navigator class="small-link" url="/pages/hot-content/index?kind=whisper"
          >查看更多 ›</navigator
        >
      </view>
      <HotContentList
        :items="hotWhispers.slice(0, 3)"
        :busy="hotBusy.whisper"
        :error="hotErrors.whisper"
      />
    </view>
    <view class="section-heading"
      ><text class="section-title">新鲜心愿</text
      ><view
        role="button"
        class="small-link"
        @click="runPageAction(() => openMainPage('/pages/wishes/index'))"
        >去捞一捞 ›</view
      ></view
    >
    <WishPreview v-for="wish in rows" :key="wish.id" :wish="wish" compact />
    <view v-if="!rows.length" class="empty-state">
      <AppIcon name="fish" :size="52" />
      <text>{{ busy ? '正在捞起新鲜心愿…' : '心愿池静静的，等你投下第一份期待。' }}</text>
    </view>
    <view class="section-heading"
      ><text class="section-title">悄悄话</text
      ><view
        role="button"
        class="small-link"
        @click="runPageAction(() => openMainPage('/pages/whispers/index'))"
        >去听一听 ›</view
      ></view
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
          : whispersReady
            ? '有些话，轻轻说就好。这里有人愿意听。'
            : '心事也值得被温柔以待。'
      }}</text>
    </view>
    <AppNotice :message="error" kind="error" />
    <AppNotice :message="whispersError" kind="error" />
    <text class="page-footnote">许愿有人应，心事有人听。</text>
  </AppPage>
</template>
<style scoped>
.matchmaking-entry {
  display: flex;
  align-items: center;
  gap: 22rpx;
  margin-bottom: 24rpx;
  padding: 26rpx;
  border-radius: 24rpx;
  background: var(--theme-mint);
  color: var(--theme-ink);
}
.matchmaking-entry view {
  flex: 1;
  display: grid;
  gap: 8rpx;
  font-size: 24rpx;
}
</style>
