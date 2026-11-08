<script setup lang="ts">
import { watch, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useEntryStore } from '@/stores/entry'
import { config } from '@/config'
const user = useUserStore()
const entry = useEntryStore()
const loginError = ref('')
const guidePage = ref(0)
watch(
  () => [entry.guideVisible, entry.guide],
  () => {
    guidePage.value = 0
  },
)
let visible = true
let generation = 0
function leave() {
  visible = false
  generation++
  loginError.value = ''
}
onShow(() => {
  visible = true
})
onHide(leave)
onUnload(leave)
watch(
  () => user.user?.id,
  (value, previous) => {
    if (previous && value !== previous) entry.clear()
  },
)
watch(
  () => [user.validated, user.user?.verification],
  () => {
    if (!config.useMock && user.validated) {
      entry.loginVisible = false
      void entry.showGuide()
    }
  },
  { immediate: true },
)
async function login() {
  if (user.busy || !visible) return
  const current = generation
  const active = () => visible && current === generation
  loginError.value = ''
  try {
    await user.login()
    if (!active()) return
    if (!user.validated) throw new Error('登录尚未确认，请重试。')
    uni.$emit?.('app:notice', { message: '登录成功', kind: 'success' })
    entry.loginVisible = false
    await entry.showGuide()
  } catch (failure) {
    if (active())
      loginError.value = failure instanceof Error ? failure.message : '登录未完成，请重试。'
  }
}
</script>
<template>
  <view v-if="entry.loginVisible && !config.useMock" class="prompt-shade">
    <view class="prompt-card" role="dialog" aria-label="微信登录">
      <text class="title">欢迎来到鲤愿池</text>
      <text>微信登录后可管理心愿与心事，发布和互动需完成学生认证。</text>
      <AppNotice :message="loginError" kind="error" />
      <button
        :disabled="user.busy"
        :loading="isPageActionPending('src-components-EntryPrompts.vue-action-1')"
        @click="runPageAction(() => login(), 'src-components-EntryPrompts.vue-action-1')"
      >
        微信登录
      </button>
      <button
        :disabled="user.busy"
        :loading="isPageActionPending('src-components-EntryPrompts.vue-action-2')"
        @click="
          runPageAction(() => {
            entry.loginVisible = false
          }, 'src-components-EntryPrompts.vue-action-2')
        "
      >
        暂时逛逛
      </button>
    </view>
  </view>
  <view v-else-if="entry.guideVisible && entry.guide" class="prompt-shade">
    <view class="prompt-card" role="dialog" aria-label="功能使用说明">
      <text class="title">功能使用说明</text>
      <template v-for="(item, index) in entry.guide.modules" :key="item.module">
        <scroll-view v-if="guidePage === index" scroll-y class="guide-scroll">
          <text class="section-title">{{ item.title }}</text>
          <text class="guide-body">{{ item.body }}</text>
        </scroll-view>
      </template>
      <text v-if="entry.guide.modules.length > 1" class="guide-count">
        {{ guidePage + 1 }} / {{ entry.guide.modules.length }}
      </text>
      <AppNotice :message="entry.error" kind="error" />
      <view class="guide-actions">
        <button
          v-if="guidePage > 0"
          :disabled="entry.busy"
          @click="guidePage = Math.max(0, guidePage - 1)"
        >
          上一页
        </button>
        <button
          v-if="guidePage + 1 < entry.guide.modules.length"
          @click="guidePage = Math.min(entry.guide.modules.length - 1, guidePage + 1)"
        >
          下一页
        </button>
        <button
          v-else
          :disabled="entry.busy"
          :loading="isPageActionPending('src-components-EntryPrompts.vue-action-3')"
          @click="
            runPageAction(() => entry.confirmGuide(), 'src-components-EntryPrompts.vue-action-3')
          "
        >
          我知道了
        </button>
      </view>
    </view>
  </view>
</template>
<style scoped>
.prompt-shade {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgb(0 0 0 / 45%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
.prompt-card {
  width: 100%;
  padding: 36rpx;
  border-radius: 28rpx;
  background: var(--theme-surface);
  color: var(--theme-ink);
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.guide-scroll {
  height: 45vh;
}
.guide-count {
  text-align: center;
}
.guide-actions {
  display: flex;
  gap: 16rpx;
}
.guide-actions button {
  flex: 1;
  min-width: 0;
}
.guide-body {
  display: block;
  white-space: pre-wrap;
  line-height: 1.8;
  margin-top: 12rpx;
}
</style>
