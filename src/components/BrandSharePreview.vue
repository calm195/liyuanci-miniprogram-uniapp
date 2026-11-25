<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { isShareBrowseOnly } from '@/utils/shared-wish-navigation'
import { mainNavigation } from '@/utils/navigation'

const theme = useThemeStore()
const browseOnly = isShareBrowseOnly()
const opening = ref(false)
const error = ref('')

onMounted(() => uni.setNavigationBarTitle?.({ title: '鲤愿池' }))

function openHome() {
  if (browseOnly || opening.value) return
  opening.value = true
  error.value = ''
  // 重建首页可清除原页面实例及其分享参数，首页本身也可以作为朋友圈来源。
  uni.reLaunch({
    url: mainNavigation[0].url,
    fail: () => {
      error.value = '首页暂时无法打开，请重试。'
    },
    complete: () => {
      opening.value = false
    },
  })
}
</script>

<template>
  <view class="brand-preview" :style="theme.variables">
    <view class="preview-content">
      <image class="pond" src="/static/illustrations/pond.jpg" mode="aspectFill" />
      <text class="brand-title">鲤愿池</text>
      <text class="intro">在这里发布校园心愿，回应同学的期待，读读愿望实现后的故事。</text>
      <text v-if="browseOnly" class="enter-hint">点击微信的「前往小程序」继续浏览。</text>
      <button v-else class="enter-home" :loading="opening" :disabled="opening" @click="openHome">
        进入首页
      </button>
      <AppNotice v-if="error" :message="error" kind="error" />
    </view>
  </view>
</template>

<style scoped>
.brand-preview {
  min-height: 100vh;
  padding: calc(100rpx + env(safe-area-inset-top)) 40rpx calc(56rpx + env(safe-area-inset-bottom));
  background: var(--theme-canvas);
  color: var(--theme-ink);
}
.preview-content {
  max-width: 720rpx;
  margin: 0 auto;
}
.pond {
  display: block;
  width: 100%;
  height: 360rpx;
  border-radius: 32rpx;
}
.brand-title,
.intro,
.enter-hint {
  display: block;
}
.brand-title {
  margin: 32rpx 0 12rpx;
  font-size: 48rpx;
  font-weight: 700;
}
.intro,
.enter-hint {
  color: var(--theme-muted);
}
.enter-hint,
.enter-home {
  margin-top: 32rpx;
}
.enter-home {
  border-radius: 24rpx;
  background: var(--theme-brand);
  color: var(--theme-on-brand);
  font-size: 30rpx;
}
</style>
