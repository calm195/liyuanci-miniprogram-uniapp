<script setup lang="ts">
import { useLogin } from '@/composables/use-login'
const { requestLogin } = useLogin()
import { computed, ref } from 'vue'
import { dictionaryLabel } from '@/features/dictionaries/catalog'
import { openMainPage } from '@/utils/navigation'
function openOwnWishes(state = '') {
  if (user.isLoggedIn)
    return openMainPage(
      `/pages/wishes/index?own=1${state ? `&state=${encodeURIComponent(state)}` : ''}`,
    )
  requestLogin(() => openOwnWishes(state))
}
import { onPullDownRefresh } from '@dcloudio/uni-app'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import ProfileAvatar from '@/components/ProfileAvatar.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useThemeStore, type ThemePreference } from '@/stores/theme'
import { useEntryStore } from '@/stores/entry'
import { useUserStore } from '@/stores/user'
import { useUnreadStore } from '@/stores/unread'
import { config } from '@/config'
import type { VerificationState } from '@/types/api'
const user = useUserStore()
const unread = useUnreadStore()
const theme = useThemeStore()
const themeOptions: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: '跟随系统', description: '随设备外观自动切换' },
  { value: 'light', label: '浅色', description: '暖白底色，轻盈明亮' },
  { value: 'dark', label: '深色', description: '柔和暗色，适合夜间阅读' },
]
const appearanceOpen = ref(false)
const themeIndex = computed(() => themeOptions.findIndex(({ value }) => value === theme.preference))
function setAppearance(value: ThemePreference) {
  theme.setMode(value)
  appearanceOpen.value = false
}
function openProfile() {
  requestLogin(() => {
    uni.navigateTo({ url: '/pages/settings/index' })
  })
}
const entry = useEntryStore()
const states: VerificationState[] = ['unverified', 'pending', 'rejected', 'verified']
const wishStates = [
  { icon: 'send', state: 'pending_review', label: '待审' },
  { icon: 'chat', state: 'matching', label: '配对中' },
  { icon: 'clock', state: 'realized', label: '已实现' },
  { icon: 'check', state: 'fulfilled', label: '已还愿' },
]
const groups = [
  [
    { label: '通知中心', icon: 'bell', url: '/pages/inbox/index' },
    { label: '我的收藏', icon: 'star', url: '/pages/favorites/index' },
    { label: '聊天', icon: 'chat', url: '/pages/inbox/index?view=conversations' },
    { label: '我的应愿', icon: 'send', url: '/pages/applications/index' },
    { label: '包分配资料', icon: 'heart', url: '/pages/matchmaking/profile' },
    { label: '包分配活动', icon: 'heart', url: '/pages/matchmaking/index' },
    { label: '身份认证', icon: 'shield', url: '/pages/verification/index' },
  ],
  [
    { label: '悄悄话设置', icon: 'settings', url: '/pages/whispers/settings' },
    { label: '我的心事', icon: 'chat', url: '/pages/whispers/mine' },
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
  <AppPage responsive-padding tab="mine" title="我的">
    <button
      class="ui-link profile-heading"
      hover-class="tap-feedback"
      :loading="isPageActionPending('profile-open-details')"
      @click="runPageAction(openProfile, 'profile-open-details')"
    >
      <!-- 横排放在原生 view 内，避免公共 navigator 块级样式覆盖微信端布局。 -->
      <view class="profile-heading-row">
        <view class="profile-avatar">
          <ProfileAvatar :src="user.user?.avatar_url" :size="88" />
        </view>
        <text class="ui-text-reset profile-name">{{
          user.user?.nickname || (user.isLoggedIn ? '一条热心的锦鲤' : '遇见你，真好')
        }}</text>
        <text class="ui-text-reset category-pill mint">{{
          user.isLoggedIn && !user.validated ? '资格待校验' : user.label
        }}</text>
        <text class="ui-text-reset profile-arrow" aria-hidden="true">→</text>
      </view>
    </button>
    <view class="profile-tools">
      <button
        class="ui-button"
        :loading="isPageActionPending('src-pages-profile-index.vue-action-1')"
        @click="runPageAction(() => entry.showGuide(true), 'src-pages-profile-index.vue-action-1')"
      >
        功能使用说明
      </button>
      <button class="ui-button theme-toggle" @click="appearanceOpen = true">
        <AppIcon name="sun" :size="34" />{{ themeOptions[themeIndex]?.label }} ›
      </button>
    </view>
    <view v-if="!user.isLoggedIn" class="profile-banner">
      <text class="ui-section-title">记录你的心愿与回响</text>
      <text class="ui-copy">登录后查看心愿、应愿进度和收到的回复。</text>
      <LoginLink class="ui-link" target="/pages/settings/index">微信登录 →</LoginLink>
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
      <text v-if="user.expired" class="ui-copy">登录已过期，请重新登录。</text>
      <text v-if="user.user && !user.validated" class="ui-copy"
        >当前资格尚未校验，受保护操作暂不可用。</text
      >
      <text v-if="user.user?.penalty_notice" class="ui-copy">{{ user.user.penalty_notice }}</text>
      <text v-if="user.user?.verification === 'pending'" class="ui-copy"
        >学生认证审核中，请留意状态更新。</text
      >
      <text v-if="user.verification?.reason" class="ui-copy"
        >驳回原因：{{ user.verification.reason }}</text
      >
      <text v-if="user.verification?.revision_suggestion" class="ui-copy"
        >修改建议：{{ user.verification.revision_suggestion }}</text
      >
    </view>
    <view class="ui-section profile-menu-panel">
      <view class="section-heading"
        ><text class="ui-section-title">我的心愿</text
        ><view role="button" class="small-link" @click="runPageAction(() => openOwnWishes())"
          >查看全部 ›</view
        ></view
      >
      <view class="status-grid">
        <view
          v-for="item in wishStates"
          :key="item.state"
          role="button"
          hover-class="tap-feedback"
          @click="runPageAction(() => openOwnWishes(item.state))"
          ><AppIcon :name="item.icon" :size="46" /><text class="ui-text">{{
            dictionaryLabel('wish_state', item.state, item.label).replace(/(?:的)?心愿$/, '')
          }}</text></view
        >
      </view>
    </view>
    <view v-for="(group, index) in groups" :key="index" class="ui-section profile-menu-panel">
      <navigator v-for="item in group" :key="item.url" :url="item.url" class="ui-link menu-row"
        ><AppIcon :name="item.icon" :size="36" /><text class="ui-text menu-label">{{
          item.label
        }}</text
        ><text
          v-if="item.url === '/pages/inbox/index' && unread.label"
          class="ui-text-reset notification-badge"
          :aria-label="`${unread.count}条未读通知`"
          >{{ unread.label }}</text
        ><AppIcon name="chevron" :size="28"
      /></navigator>
    </view>
    <view v-if="user.isLoggedIn" class="ui-section">
      <button
        class="ui-button"
        :disabled="user.busy"
        :loading="isPageActionPending('pages-profile-index-button-2')"
        @click="runPageAction(() => logout(), 'pages-profile-index-button-2')"
      >
        退出登录
      </button>
    </view>
    <view v-if="config.useMock" class="ui-section"
      ><text class="ui-text-reset notice">合成演示 · 不发送 API</text
      ><button
        v-for="state in states"
        :key="state"
        class="ui-button"
        :loading="isPageActionPending('pages-profile-index-button-3' + ':' + state)"
        @click="
          runPageAction(() => user.simulate(state), 'pages-profile-index-button-3' + ':' + state)
        "
      >
        {{ state }}
      </button></view
    >
    <text class="ui-text-reset page-footnote">许愿有人应，心事有人听。</text>
    <view v-if="appearanceOpen" class="appearance-shade" @click="appearanceOpen = false"
      ><view class="appearance-panel" role="dialog" aria-label="选择外观" @click.stop
        ><view class="appearance-heading"
          ><text class="ui-section-title">选择外观</text
          ><button
            class="appearance-close"
            aria-label="关闭外观选择"
            @click="appearanceOpen = false"
          >
            ×
          </button></view
        ><text class="ui-copy appearance-description">选择适合你的阅读方式。</text
        ><button
          v-for="option in themeOptions"
          :key="option.value"
          class="appearance-option"
          :class="{ selected: theme.preference === option.value }"
          :aria-pressed="theme.preference === option.value"
          @click="setAppearance(option.value)"
        >
          <view class="appearance-swatch" :class="option.value"
            ><AppIcon name="sun" :size="34" /></view
          ><view class="appearance-copy"
            ><text class="appearance-label">{{ option.label }}</text
            ><text class="appearance-hint">{{ option.description }}</text></view
          ><AppIcon
            v-if="theme.preference === option.value"
            name="check"
            :size="32"
          /></button></view
    ></view>
  </AppPage>
</template>

<style scoped>
.appearance-shade {
  position: fixed;
  inset: 0;
  z-index: 1000;
  padding: 40rpx;
  background: rgba(9, 29, 61, 0.36);
  display: flex;
  align-items: center;
  justify-content: center;
}
.appearance-panel {
  width: 100%;
  max-width: 680rpx;
  padding: 36rpx;
  border-radius: 32rpx;
  background: var(--theme-surface);
  box-shadow: 0 24rpx 80rpx #091d3d25;
}
.appearance-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
}
.appearance-heading .appearance-close {
  width: 56rpx;
  height: 56rpx;
  min-height: 56rpx;
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
  color: var(--theme-muted);
  font-size: 40rpx;
  line-height: 56rpx;
}
.appearance-description {
  margin: 8rpx 0 28rpx !important;
  color: var(--theme-muted);
  font-size: 24rpx;
}
.appearance-panel .appearance-option {
  display: flex;
  align-items: center;
  gap: 20rpx;
  width: 100%;
  margin: 16rpx 0 0;
  padding: 22rpx 20rpx;
  border: 2rpx solid var(--theme-line);
  border-radius: 22rpx;
  background: var(--theme-canvas);
  text-align: left;
  line-height: 1.5;
}
.appearance-panel .appearance-option.selected {
  border-color: var(--theme-teal);
  background: var(--theme-mint);
}
.appearance-swatch {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  background: #fcfaf7;
}
.appearance-swatch.dark {
  background: #253b57;
}
.appearance-swatch.system {
  background: linear-gradient(90deg, #fcfaf7 50%, #253b57 50%);
}
.appearance-copy {
  flex: 1;
  min-width: 0;
}
.appearance-label {
  display: block;
  margin: 0;
  font-size: 28rpx;
  font-weight: 600;
}
.appearance-hint {
  display: block;
  margin: 4rpx 0 0;
  color: var(--theme-muted);
  font-size: 22rpx;
}

.page .profile-heading {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  padding: 0;
}

.profile-menu-panel {
  padding: 8rpx 32rpx;
}
.profile-menu-panel .section-heading {
  margin: 24rpx 0;
}
.profile-menu-panel .menu-row {
  padding: 24rpx 0;
  margin: 0;
  color: var(--theme-ink);
  font-size: 28rpx;
}
.profile-tools {
  gap: 16rpx;
}
.profile-tools .ui-button {
  padding: 12rpx 0;
  min-height: 64rpx;
  border: 0;
}

.profile-heading {
  margin: 0;
  color: var(--theme-ink);
}
.profile-heading-row {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  width: 100%;
  gap: 16rpx;
}
.profile-heading-row .profile-avatar {
  flex: 0 0 88rpx;
  width: 88rpx;
  height: 88rpx;
}

.profile-heading-row .profile-name {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 34rpx;
}
.profile-heading-row .category-pill {
  flex-shrink: 0;
  margin: 0;
  white-space: nowrap;
  font-size: 22rpx;
  padding: 8rpx 12rpx;
}
.profile-heading-row .profile-arrow {
  flex-shrink: 0;
  margin: 0;
  font-size: 36rpx;
  color: var(--theme-teal);
}
.notification-badge {
  flex-shrink: 0;
  min-width: 32rpx;
  padding: 0 8rpx;
  border-radius: 20rpx;
  background: var(--theme-danger);
  color: white;
  font-size: 22rpx;
  line-height: 36rpx;
  text-align: center;
}
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
