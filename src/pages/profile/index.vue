<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import AppIcon from '@/components/AppIcon.vue'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import { useUserStore } from '@/stores/user'
import { config } from '@/config'
import type { VerificationState } from '@/types/api'
const user = useUserStore()
const states: VerificationState[] = ['unverified', 'pending', 'rejected', 'verified']
const wishStates = [
  { label: '待审核', icon: 'send', state: 'pending_review' },
  { label: '匹配中', icon: 'chat', state: 'matching' },
  { label: '待还愿', icon: 'clock', state: 'realized' },
  { label: '已还愿', icon: 'check', state: 'fulfilled' },
]
const groups = [
  [
    { label: '我的消息', icon: 'bell', url: '/pages/inbox/index' },
    { label: '我的应愿', icon: 'send', url: '/pages/applications/index' },
    { label: '身份认证', icon: 'shield', url: '/pages/verification/index' },
  ],
  [
    { label: '我的悄悄话', icon: 'chat', url: '/pages/whispers/mine' },
    { label: '悄悄鲤通知', icon: 'bell', url: '/pages/whispers/notifications' },
    { label: '我的时光胶囊', icon: 'clock', url: '/pages/capsules/index' },
    { label: '资料广场', icon: 'book', url: '/pages/resources/index' },
  ],
  [
    { label: '个人资料与隐私', icon: 'lock', url: '/pages/settings/index' },
    { label: '警告与申诉', icon: 'shield', url: '/pages/safety/index' },
    { label: '关怀与援助', icon: 'heart', url: '/pages/care/index' },
    { label: '解忧与公共援助', icon: 'leaf', url: '/pages/whispers/help' },
    { label: '账号注销与删除进度', icon: 'settings', url: '/pages/deletion/index' },
  ],
]
async function refresh() {
  try {
    await user.refresh()
  } catch {
    /* 请求层统一提示，资格维持未校验状态。 */
  }
}
async function logout() {
  try {
    await user.logout()
  } catch {
    /* 本地会话已清除，撤销失败由请求层提示。 */
  }
}
onShow(() => {
  void refresh()
})
</script>
<template>
  <AppPage tab="mine" title="我的">
    <view class="profile-heading">
      <image src="/static/illustrations/profile-koi.png" class="profile-avatar" mode="aspectFit" />
      <view class="profile-copy">
        <text class="profile-name">{{
          user.user?.nickname || (user.isLoggedIn ? '一条热心的锦鲤' : '遇见你，真好')
        }}</text>
        <text class="category-pill mint">{{
          user.isLoggedIn && !user.validated ? '资格待校验' : user.label
        }}</text>
      </view>
      <navigator
        :url="user.isLoggedIn ? '/pages/settings/index' : '/pages/login/index'"
        class="small-link"
        ><AppIcon name="chevron" :size="34"
      /></navigator>
    </view>
    <view class="profile-banner">
      <text class="section-title">把善意，攒成好运</text>
      <text>{{
        user.isLoggedIn
          ? '每一个认真回应，都会让心愿更近一点。'
          : '登录后，记录属于你的心愿与回响。'
      }}</text>
      <navigator :url="user.isLoggedIn ? '/pages/wishes/index?own=1' : '/pages/login/index'">{{
        user.isLoggedIn ? '看看我的心愿 →' : '微信登录 →'
      }}</navigator>
    </view>
    <view
      v-if="
        user.expired ||
        (user.user && !user.validated) ||
        user.user?.penalty_notice ||
        user.verification
      "
      class="notice"
    >
      <text v-if="user.expired">登录已过期，请重新登录。</text>
      <text v-if="user.user && !user.validated">当前资格尚未校验，受保护操作暂不可用。</text>
      <text v-if="user.user?.penalty_notice">{{ user.user.penalty_notice }}</text>
      <text v-if="user.user?.verification === 'pending'">学生认证审核中，请留意状态更新。</text>
      <text v-if="user.verification?.reason">驳回原因：{{ user.verification.reason }}</text>
      <text v-if="user.verification?.revision_suggestion"
        >修改建议：{{ user.verification.revision_suggestion }}</text
      >
    </view>
    <view class="menu-panel">
      <view class="section-heading"
        ><text class="section-title">我的心愿</text
        ><navigator url="/pages/wishes/index?own=1" class="small-link">查看全部 ›</navigator></view
      >
      <view class="status-grid">
        <navigator
          v-for="item in wishStates"
          :key="item.state"
          :url="`/pages/wishes/index?own=1&state=${item.state}`"
          ><AppIcon :name="item.icon" :size="46" /><text class="ui-text">{{
            item.label
          }}</text></navigator
        >
      </view>
    </view>
    <view v-for="(group, index) in groups" :key="index" class="menu-panel">
      <navigator v-for="item in group" :key="item.url" :url="item.url" class="menu-row"
        ><AppIcon :name="item.icon" :size="36" /><text class="ui-text menu-label">{{
          item.label
        }}</text
        ><AppIcon name="chevron" :size="28"
      /></navigator>
    </view>
    <ThemeSwitcher />
    <view v-if="user.isLoggedIn" class="card">
      <button v-if="!config.useMock" :disabled="user.busy" @click="runPageAction(() => refresh())">
        刷新认证状态
      </button>
      <button :disabled="user.busy" @click="runPageAction(() => logout())">退出登录</button>
    </view>
    <view v-if="config.useMock" class="card"
      ><text class="notice">合成演示 · 不发送 API</text
      ><button
        v-for="state in states"
        :key="state"
        @click="runPageAction(() => user.simulate(state))"
      >
        {{ state }}
      </button></view
    >
    <text class="page-footnote">许愿有人应，心事有人听。</text>
  </AppPage>
</template>
