<script setup lang="ts">
import { ref } from 'vue'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
const store = useUserStore()
const error = ref('')
async function login() {
  error.value = ''
  try {
    await store.login()
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '登录未完成，请重试'
  }
}
</script>
<template>
  <view class="login">
    <text>微信登录</text>
    <text>登录后仍需提交学生认证，人工审核通过后才能发布、申请和聊天。</text>
    <text v-if="config.useMock">当前为合成 Mock，请返回首页选择合成状态。</text>
    <button :loading="store.busy" :disabled="store.busy || config.useMock" @click="login">
      微信登录
    </button>
    <text v-if="error">{{ error }}</text>
    <navigator url="/pages/index/index" open-type="reLaunch">返回首页</navigator>
  </view>
</template>
<style scoped>
.login {
  padding: 40rpx;
}
text {
  display: block;
  margin-bottom: 24rpx;
}
</style>
