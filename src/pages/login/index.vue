<script setup lang="ts">
/* global getCurrentPages */
import { useUserStore } from '@/stores/user'
const user = useUserStore()

function browse() {
  const home = () => uni.switchTab({ url: '/pages/index/index' })
  if (getCurrentPages().length > 1) uni.navigateBack({ fail: home })
  else home()
}
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading title="账号登录" description="可直接浏览公开内容。登录后可使用个人功能。" />
    <view class="ui-section ui-stack">
      <LoginLink v-if="!user.isLoggedIn">登录鲤愿池</LoginLink>
      <button class="ui-button" @click="browse">继续浏览</button>
    </view>
  </AppPage>
</template>
