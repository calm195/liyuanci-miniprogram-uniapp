<script setup lang="ts">
import { session } from '@/utils/session'
import AppPage from '@/components/AppPage.vue'
import { onShow } from '@dcloudio/uni-app'
import { useWishActionReturn } from '@/composables/use-wish-action-return'
import { useEntryStore } from '@/stores/entry'
import { useUserStore } from '@/stores/user'
const entry = useEntryStore()
const user = useUserStore()
const wishReturn = useWishActionReturn('login')
onShow(() => {
  if (!user.isLoggedIn && !session.getToken()) entry.openLogin()
})
</script>
<template>
  <AppPage :hide-entry-guide="wishReturn.active.value" @login-cancel="wishReturn.returnToWish">
    <text class="title">{{ user.isLoggedIn ? '已登录' : '欢迎来到鲤愿池' }}</text>
    <button
      v-if="!user.isLoggedIn"
      :loading="isPageActionPending('src-pages-login-index.vue-action-1')"
      @click="runPageAction(() => entry.openLogin(), 'src-pages-login-index.vue-action-1')"
    >
      微信登录
    </button>
    <navigator v-else-if="!wishReturn.active.value" url="/pages/verification/index"
      >查看学生认证</navigator
    >
    <button
      v-if="wishReturn.active.value"
      :disabled="user.busy || wishReturn.returning.value"
      :loading="wishReturn.returning.value"
      @click="wishReturn.returnToWish"
    >
      返回心愿详情
    </button>
    <navigator v-else url="/pages/index/index" open-type="switchTab">返回首页</navigator>
  </AppPage>
</template>
