<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { onShow } from '@dcloudio/uni-app'
import { useEntryStore } from '@/stores/entry'
import { useUserStore } from '@/stores/user'
const entry = useEntryStore()
const user = useUserStore()
onShow(() => {
  if (!user.isLoggedIn) entry.openLogin()
})
</script>
<template>
  <AppPage>
    <text class="title">{{ user.isLoggedIn ? '已登录' : '欢迎来到鲤愿池' }}</text>
    <button
      v-if="!user.isLoggedIn"
      :loading="isPageActionPending('src-pages-login-index.vue-action-1')"
      @click="runPageAction(() => entry.openLogin(), 'src-pages-login-index.vue-action-1')"
    >
      微信登录
    </button>
    <navigator v-else url="/pages/verification/index">查看学生认证</navigator>
    <navigator url="/pages/index/index" open-type="reLaunch">返回首页</navigator>
  </AppPage>
</template>
