<script setup lang="ts">
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import type { VerificationState } from '@/types/api'
const store = useUserStore()
const states: VerificationState[] = ['unverified', 'pending', 'rejected', 'verified']
function login() {
  uni.navigateTo({ url: '/pages/login/index' })
}
async function refresh() {
  try {
    await store.refresh()
  } catch {
    /* 请求层统一提示。 */
  }
}
async function logout() {
  try {
    await store.logout()
  } catch {
    /* 本地会话已清除；服务端撤销失败由请求层提示。 */
  }
}
</script>
<template>
  <view class="page">
    <text class="title">鲤源池</text>
    <view v-if="config.useMock" class="notice">合成 Mock · 无真实微信身份，不发送 API</view>
    <view class="card">
      <text>账号状态：{{ store.label }}</text>
      <text v-if="store.expired">登录已过期，请重新登录。</text>
      <text v-if="store.user && !store.validated">当前资格尚未校验，受保护操作暂不可用。</text>
      <text v-if="store.user?.penalty_notice">{{ store.user.penalty_notice }}</text>
      <text v-if="store.user?.verification === 'pending'">学生认证审核中，请留意状态更新。</text>
      <text v-if="store.verification?.status === 'rejected'"
        >驳回原因：{{ store.verification.reason }}</text
      >
      <text v-if="store.verification?.revision_suggestion"
        >修改建议：{{ store.verification.revision_suggestion }}</text
      >
      <text>微信登录用于建立会话；学生认证通过后才具备发布、申请和聊天的资格。</text>
      <button v-if="!store.isLoggedIn" @click="login">前往登录</button>
      <button v-if="store.isLoggedIn && !config.useMock" :disabled="store.busy" @click="refresh">
        刷新认证状态
      </button>
      <button v-if="store.isLoggedIn" :disabled="store.busy" @click="logout">退出登录</button>
    </view>
    <view class="card">
      <text>首发文字心愿互助</text>
      <navigator url="/pages/verification/index">学生认证</navigator>
      <text
        >学生认证通过后，可按当前权限创建、编辑和提交心愿审核；可申请应愿并确定匹配；可通过会话入口聊天并查看通知。</text
      >
      <navigator url="/pages/wishes/index">心愿广场 / 我的心愿</navigator>
      <navigator url="/pages/applications/index">我的应愿</navigator>
      <navigator url="/pages/inbox/index">聊天与通知</navigator>
      <navigator url="/pages/stories/index">还愿墙</navigator>
      <navigator url="/pages/settings/index">个人资料与隐私</navigator>
      <navigator url="/pages/safety/index">警告与申诉</navigator>
      <navigator url="/pages/care/index">关怀与援助</navigator>
    </view>
    <view v-if="config.useMock" class="card">
      <text>仅用于检查状态展示</text>
      <button v-for="state in states" :key="state" @click="store.simulate(state)">
        {{ state }}
      </button>
    </view>
  </view>
</template>
<style scoped lang="scss">
.page {
  padding: 32rpx;
}
.title {
  font-size: 48rpx;
  font-weight: bold;
}
.card {
  margin-top: 24rpx;
  padding: 28rpx;
  background: white;
  border-radius: 20rpx;
}
.card text {
  display: block;
  margin-bottom: 20rpx;
}
.notice {
  padding: 24rpx;
  background: #fff1cc;
}
button {
  margin-top: 16rpx;
}
</style>
