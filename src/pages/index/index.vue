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
]
function openShortcut(url: string) {
  return uni.navigateTo({ url })
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
  <AppPage responsive-padding tab="home" title="鲤愿池" brand>
    <view v-if="config.useMock" class="notice">合成演示 · 不发送 API</view>
    <view class="greeting-row">
      <view class="greeting-copy"
        ><AppIcon name="sun" :size="34" /><text class="ui-text">嗨，今天也有好运气</text></view
      >
      <navigator
        v-if="user.isLoggedIn"
        url="/pages/profile/index"
        open-type="switchTab"
        class="ui-link small-link"
        >我的主页 ›</navigator
      ><LoginLink v-else class="small-link">登录 ›</LoginLink>
    </view>
    <view class="home-hero"
      ><image src="/static/illustrations/pond.jpg" mode="aspectFill" class="home-hero-art" /><view
        class="home-hero-copy"
        ><text class="hero-kicker">鲤愿池 · 把善意交给彼此</text
        ><text class="hero-title">小小心愿，<br />也值得被看见。</text
        ><text class="hero-subtitle">许愿有人应，心事有人听。</text></view
      ></view
    >
    <view class="quick-grid">
      <view
        v-for="entry in shortcuts"
        :key="entry.label"
        role="button"
        class="quick-entry"
        hover-class="tap-feedback"
        @click="runPageAction(() => openShortcut(entry.url))"
      >
        <image :src="`/static/illustrations/${entry.art}.png`" class="entry-art" mode="aspectFit" />
        <text class="ui-text">{{ entry.label }}</text
        ><text class="ui-text-reset entry-caption">{{ entry.caption }}</text>
      </view>
    </view>
    <navigator url="/pages/matchmaking/index" class="ui-link matchmaking-entry">
      <AppIcon name="heart" :size="48" />
      <view
        ><text class="ui-section-title">包分配活动</text
        ><text class="ui-copy">填写期待，随活动认识一位新朋友</text></view
      >
      <text class="ui-text-reset small-link">查看 ›</text>
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
      <view class="section-heading"><text class="ui-section-title">本周热点</text></view>
      <view class="section-heading">
        <text class="ui-copy">热门心愿</text>
        <navigator class="ui-link small-link" url="/pages/hot-content/index?kind=wish"
          >查看更多 ›</navigator
        >
      </view>
      <HotContentList :items="hotWishes.slice(0, 3)" :busy="hotBusy.wish" :error="hotErrors.wish" />
      <view class="section-heading">
        <text class="ui-copy">热门悄悄话</text>
        <navigator class="ui-link small-link" url="/pages/hot-content/index?kind=whisper"
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
      ><text class="ui-section-title">新鲜心愿</text
      ><view
        role="button"
        class="small-link"
        @click="runPageAction(() => openMainPage('/pages/wishes/index'))"
        >去捞一捞 ›</view
      ></view
    >
    <WishPreview v-for="wish in rows" :key="wish.id" :wish="wish" compact />
    <view v-if="!rows.length && !error" class="ui-state">
      <AppIcon name="fish" :size="52" />
      <text class="ui-copy">{{
        busy ? '正在捞起新鲜心愿…' : '心愿池静静的，等你投下第一份期待。'
      }}</text>
    </view>
    <view class="section-heading"
      ><text class="ui-section-title">悄悄话</text
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
      class="ui-section home-whisper"
    >
      <WhisperContent :content="item" preview />
      <view class="card-meta"
        ><AppIcon name="heart" :size="28" /><text class="ui-text"
          >{{ item.hug_count }} 个抱抱 · {{ item.comment_count }} 条暖评</text
        ></view
      >
    </navigator>
    <view v-if="!latestWhispers.length && !whispersError" class="ui-state">
      <text class="ui-copy">{{
        whispersBusy
          ? '正在听见你的心事…'
          : whispersReady
            ? '有些话，轻轻说就好。这里有人愿意听。'
            : '心事也值得被温柔以待。'
      }}</text>
    </view>
    <AppNotice :message="error" kind="error" />
    <AppNotice :message="whispersError" kind="error" />
    <text class="ui-text-reset page-footnote">许愿有人应，心事有人听。</text>
  </AppPage>
</template>
<style scoped>
.greeting-row {
  padding: 10rpx 0;
}
.home-hero {
  height: 340rpx;
  margin-bottom: 12rpx;
}
.home-hero-art {
  position: absolute;
  width: 100%;
  height: 100%;
  inset: 0;
  opacity: 0.72;
}
.home-hero-copy {
  position: relative;
  padding: 40rpx 32rpx;
  color: #091d3d;
}
.hero-kicker {
  display: block;
  font-size: 20rpx;
  margin: 0 0 12rpx;
}
.hero-title {
  display: block;
  font-size: 46rpx;
  line-height: 1.35;
  font-weight: 700;
  margin: 0;
}
.hero-subtitle {
  display: block;
  font-size: 24rpx;
  margin-top: 18rpx;
}
.quick-grid {
  margin: 0 0 12rpx;
  padding: 8rpx 0 12rpx;
  gap: 16rpx;
}
.page .quick-entry {
  border-radius: 24rpx;
  padding: 12rpx;
}
.section-heading {
  margin: 0;
  padding: 20rpx 2rpx 12rpx;
}
.section-heading + .section-heading {
  padding-top: 0;
}
.home-whisper {
  color: var(--theme-ink);
}

.matchmaking-entry {
  display: flex;
  align-items: center;
  gap: 22rpx;
  margin: 0 0 16rpx;
  padding: 24rpx;
  border-radius: 32rpx;
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
