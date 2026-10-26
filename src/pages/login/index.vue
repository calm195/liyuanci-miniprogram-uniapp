<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
const store = useUserStore()
const error = ref('')
const submitting = ref(false)
let visible = false
let generation = 0
async function login() {
  if (!visible || submitting.value || store.busy || config.useMock) return
  const current = generation
  const active = () => visible && current === generation
  submitting.value = true
  error.value = ''
  try {
    await store.login()
    // 登录期间可能离页、失效或被取消，只允许本次仍可见且已校验的页面导航。
    if (!active()) return
    if (!store.isLoggedIn || !store.validated) {
      error.value = '登录尚未确认，请重试。'
      return
    }
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (failure) {
    if (active()) error.value = failure instanceof Error ? failure.message : '登录未完成，请重试'
  } finally {
    submitting.value = false
  }
}
function leave() {
  visible = false
  generation++
  error.value = ''
}
onShow(() => {
  visible = true
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <AppPage>
    <text>微信登录</text>
    <text>登录后仍需提交学生认证，人工审核通过后才能发布、申请和聊天。</text>
    <text v-if="config.useMock">当前为合成 Mock，请返回首页选择合成状态。</text>
    <button
      :loading="submitting || store.busy"
      :disabled="submitting || store.busy || config.useMock"
      @click="runPageAction(() => login())"
    >
      微信登录
    </button>
    <text v-if="error">{{ error }}</text>
    <navigator url="/pages/index/index" open-type="reLaunch">返回首页</navigator>
  </AppPage>
</template>
