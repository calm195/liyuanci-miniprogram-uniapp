<script setup lang="ts">
import { computed } from 'vue'
import { dictionaryLabel } from '@/features/dictionaries/catalog'
import { openMainPage } from '@/utils/navigation'
function openOwnWishes() {
  if (user.isLoggedIn) return openMainPage('/pages/wishes/index?own=1')
  uni.navigateTo({ url: '/pages/login/index' })
}
import { onPullDownRefresh } from '@dcloudio/uni-app'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import ProfileAvatar from '@/components/ProfileAvatar.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useThemeStore, type ThemePreference } from '@/stores/theme'
import { useEntryStore } from '@/stores/entry'
import { useUserStore } from '@/stores/user'
import { config } from '@/config'
import type { VerificationState } from '@/types/api'
const user = useUserStore()
const theme = useThemeStore()
const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]
const themeIndex = computed(() => themeOptions.findIndex(({ value }) => value === theme.preference))
function cycleTheme() {
  const next = themeOptions[(themeIndex.value + 1) % themeOptions.length]!
  theme.setMode(next.value)
}
const entry = useEntryStore()
const states: VerificationState[] = ['unverified', 'pending', 'rejected', 'verified']
const wishStates = [
  { icon: 'send', state: 'pending_review', label: '待审心愿' },
  { icon: 'chat', state: 'matching', label: '配对中的心愿' },
  { icon: 'clock', state: 'realized', label: '已实现的心愿' },
  { icon: 'check', state: 'fulfilled', label: '已还愿的心愿' },
]
const groups = [
  [
    { label: '通知中心', icon: 'bell', url: '/pages/inbox/index' },
    { label: '聊天', icon: 'chat', url: '/pages/inbox/index?view=conversations' },
    { label: '我的应愿', icon: 'send', url: '/pages/applications/index' },
    { label: '包分配活动', icon: 'heart', url: '/pages/matchmaking/index' },
    { label: '身份认证', icon: 'shield', url: '/pages/verification/index' },
  ],
  [
    { label: '悄悄话设置', icon: 'settings', url: '/pages/whispers/settings' },
    { label: '悄悄话', icon: 'chat', url: '/pages/whispers/mine' },
    { label: '时光胶囊', icon: 'clock', url: '/pages/capsules/index' },
  ],
  [
    { label: '个人资料与隐私', icon: 'lock', url: '/pages/settings/index' },
    { label: '黑名单', icon: 'shield', url: '/pages/blacklist/index' },
    { label: '警告与申诉', icon: 'shield', url: '/pages/safety/index' },
    { label: '关怀与援助', icon: 'heart', url: '/pages/care/index' },
    { label: '解忧与公共援助', icon: 'leaf', url: '/pages/whispers/help' },
    { label: '账号注销与删除进度', icon: 'settings', url: '/pages/deletion/index' },
  ],
]
async function refresh() {
  try {
    await user.refresh(true, true)
  } catch {
    /* 请求层统一提示，资格维持未校验状态。 */
  }
}
async function logout() {
  try {
    await user.logout()
    uni.$emit?.('app:notice', { message: '已退出登录', kind: 'success' })
  } catch {
    /* 本地会话已清除，撤销失败由请求层提示。 */
  }
}
onShow(() => {
  void refresh()
})
onPullDownRefresh(async () => {
  try {
    await refresh()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage tab="mine" title="我的">
    <view class="profile-heading">
      <ProfileAvatar :src="user.user?.avatar_url" class="profile-avatar" />
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
    <view class="profile-tools">
      <button
        :loading="isPageActionPending('src-pages-profile-index.vue-action-1')"
        @click="runPageAction(() => entry.showGuide(true), 'src-pages-profile-index.vue-action-1')"
      >
        功能使用说明
      </button>
      <button class="theme-toggle" @click="cycleTheme">
        <AppIcon name="sun" :size="34" />
        {{ themeOptions[themeIndex]?.label }}
      </button>
    </view>
    <view class="profile-banner">
      <text class="section-title">把善意，攒成好运</text>
      <text>{{
        user.isLoggedIn
          ? '每一个认真回应，都会让心愿更近一点。'
          : '登录后，记录属于你的心愿与回响。'
      }}</text>
      <view role="button" @click="runPageAction(() => openOwnWishes())">{{
        user.isLoggedIn ? '看看我的心愿 →' : '微信登录 →'
      }}</view>
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
        ><view
          role="button"
          class="small-link"
          @click="runPageAction(() => openMainPage('/pages/wishes/index?own=1'))"
          >查看全部 ›</view
        ></view
      >
      <view class="status-grid">
        <view
          v-for="item in wishStates"
          :key="item.state"
          role="button"
          @click="
            runPageAction(() => openMainPage(`/pages/wishes/index?own=1&state=${item.state}`))
          "
          ><AppIcon :name="item.icon" :size="46" /><text class="ui-text">{{
            dictionaryLabel('wish_state', item.state, item.label)
          }}</text></view
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
    <view v-if="user.isLoggedIn" class="card">
      <button
        :disabled="user.busy"
        :loading="isPageActionPending('pages-profile-index-button-2')"
        @click="runPageAction(() => logout(), 'pages-profile-index-button-2')"
      >
        退出登录
      </button>
    </view>
    <view v-if="config.useMock" class="card"
      ><text class="notice">合成演示 · 不发送 API</text
      ><button
        v-for="state in states"
        :key="state"
        :loading="isPageActionPending('pages-profile-index-button-3' + ':' + state)"
        @click="
          runPageAction(() => user.simulate(state), 'pages-profile-index-button-3' + ':' + state)
        "
      >
        {{ state }}
      </button></view
    >
    <text class="page-footnote">许愿有人应，心事有人听。</text>
  </AppPage>
</template>

<style scoped>
.profile-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.profile-tools button {
  margin: 0;
  background: transparent;
  color: var(--theme-teal);
  font-size: 26rpx;
}
.profile-tools .theme-toggle,
.profile-tools .theme-toggle::after {
  border: 0;
  border-radius: 0;
}
</style>
