<script setup lang="ts">
/* global console */
import { onMounted, ref } from 'vue'
import AppNotice from '@/components/AppNotice.vue'
import ProfileAvatar from '@/components/ProfileAvatar.vue'
import { useThemeStore } from '@/stores/theme'
import type { WechatProfileChoice } from '@/types/settings'

declare const wx: {
  getPrivacySetting?: (options: {
    success: (result: { needAuthorization: boolean }) => void
    fail: () => void
  }) => void
}

const props = defineProps<{
  busy: boolean
  submitted: boolean
  retryLabel: string
  partiallySaved: boolean
  saveError: string
}>()
const emit = defineEmits<{ close: []; save: [choice?: WechatProfileChoice] }>()
const theme = useThemeStore()
const avatarAvailable = uni.canIUse?.('button.open-type.chooseAvatar') ?? false
const nicknameAvailable = uni.canIUse?.('input.type.nickname') ?? false
const reviewAvailable = nicknameAvailable && !!uni.canIUse?.('input.bindnicknamereview')
const debug = import.meta.env?.VITE_WECHAT_PROFILE_DEBUG === 'true'
const chosenAvatar = ref('')
const avatarNotice = ref('')
const nicknameNotice = ref('')
const keyboardHeight = ref(0)
const nicknameField = ref(0)
const review = ref<'idle' | 'pending' | 'passed' | 'rejected'>('idle')
const typedNickname = ref('')
let reviewValue = ''

function trace(stage: string, result: Record<string, boolean> = {}) {
  if (debug) console.info('[微信资料]', stage, result)
}

onMounted(() => {
  trace('原生控件能力', { avatarAvailable, nicknameAvailable, reviewAvailable })
  // 真机调试只读取授权状态，操作时由微信显示官方隐私弹窗。
  // #ifdef MP-WEIXIN
  if (debug) {
    wx.getPrivacySetting?.({
      success: ({ needAuthorization }) => trace('隐私状态', { needAuthorization }),
      fail: () => trace('隐私状态查询失败'),
    })
  }
  // #endif
})

function chooseAvatar(event: { detail?: { avatarUrl?: string; errMsg?: string } }) {
  if (props.busy || props.submitted) return
  const path = event.detail?.avatarUrl
  const cancelled = !!event.detail?.errMsg?.includes('cancel')
  trace('头像回调', { hasAvatar: !!path, cancelled })
  if (path) {
    chosenAvatar.value = path
    avatarNotice.value = ''
  } else if (!cancelled) {
    avatarNotice.value = '微信未返回头像。可重选头像或只填写昵称。'
  }
}

function avatarTapped() {
  trace('点击头像')
}

function nicknameValue(event: unknown): string {
  const value = (event as { detail?: { value?: unknown } })?.detail?.value
  return typeof value === 'string' ? value.trim() : ''
}

function nicknameInput(event: unknown) {
  if (props.busy || props.submitted || review.value === 'pending') return
  typedNickname.value = nicknameValue(event)
  if (typedNickname.value && typedNickname.value !== reviewValue) {
    nicknameNotice.value = ''
    review.value = 'idle'
  }
}

function nicknameBlur(event: unknown) {
  if (props.busy || props.submitted) return
  const value = nicknameValue(event)
  keyboardHeight.value = 0
  trace('昵称失焦', { hasNickname: !!value })
  if (review.value === 'pending') return
  const previous = typedNickname.value
  typedNickname.value = value
  if (!reviewAvailable) return
  if (!value) {
    if (previous || review.value === 'rejected') {
      review.value = 'rejected'
      nicknameNotice.value = '微信未返回可用昵称，请重新选用或保留原昵称。'
    }
    return
  }
  if (review.value === 'passed' && reviewValue === value) return
  reviewValue = value
  review.value = 'pending'
  nicknameNotice.value = ''
}

function nicknameReview(event: {
  detail?: { pass?: boolean }
  currentTarget?: { dataset?: { nicknameField?: number } }
}) {
  const pass = event.detail?.pass === true
  trace('昵称审核回调', { pass })
  if (props.busy || props.submitted || review.value !== 'pending') return
  const field = event.currentTarget?.dataset?.nicknameField
  if (field !== undefined && Number(field) !== nicknameField.value) return
  review.value = pass ? 'passed' : 'rejected'
  nicknameNotice.value = pass ? '' : '微信昵称未通过校验，请重新选用或保留原昵称。'
}

function skipNickname() {
  if (props.busy || props.submitted) return
  review.value = 'idle'
  reviewValue = ''
  typedNickname.value = ''
  nicknameNotice.value = ''
  nicknameField.value++
}

function keyboardChanged(event: { detail?: { height?: number } }) {
  keyboardHeight.value = Math.max(0, Number(event.detail?.height) || 0)
}

function submit(event: unknown) {
  if (props.busy) return
  if (props.submitted) {
    if (props.retryLabel) emit('save')
    return
  }
  const value = (event as { detail?: { value?: { nickname?: unknown } } })?.detail?.value?.nickname
  const nickname = typeof value === 'string' ? value.trim() : ''
  trace('原生表单提交', { hasNickname: !!nickname, hasAvatar: !!chosenAvatar.value })
  if (Array.from(nickname).length > 40) {
    nicknameNotice.value = '昵称最多 40 字。'
    return
  }
  if (review.value === 'pending') {
    nicknameNotice.value = '微信正在校验昵称，请稍后再点保存。'
    return
  }
  if (review.value === 'rejected' || (reviewAvailable && review.value === 'passed' && !nickname)) {
    review.value = 'rejected'
    nicknameNotice.value = '微信未返回可用昵称，请重新选用或保留原昵称。'
    return
  }
  if (nickname && reviewAvailable && (review.value !== 'passed' || nickname !== reviewValue)) {
    nicknameNotice.value = '请先收起键盘，等微信校验完成后再保存。'
    return
  }
  if (!chosenAvatar.value && !nickname) {
    nicknameNotice.value = '请选择头像，或从微信键盘选用昵称、手动填写昵称。'
    return
  }
  emit('save', { avatar: chosenAvatar.value, nickname })
}
</script>

<template>
  <view
    class="wechat-shade"
    :class="{ 'wechat-shade--dark': theme.mode === 'dark' }"
    @touchmove.stop.prevent
  >
    <view
      class="wechat-sheet"
      :class="{ 'wechat-sheet--keyboard': keyboardHeight > 0 }"
      :style="{ '--wechat-keyboard-offset': `${keyboardHeight}px` }"
      role="dialog"
      aria-modal="true"
      aria-label="使用微信头像和昵称"
      @touchmove.stop
    >
      <view class="wechat-heading">
        <text class="wechat-title">使用微信头像和昵称</text>
        <text class="wechat-purpose">用于鲤愿池个人资料展示。</text>
      </view>
      <form class="wechat-form" @submit="submit">
        <view class="wechat-fields">
          <button
            v-if="avatarAvailable"
            class="wechat-row wechat-avatar-button"
            open-type="chooseAvatar"
            :disabled="busy || submitted"
            @click="avatarTapped"
            @chooseavatar="chooseAvatar"
          >
            <text class="wechat-label">头像</text>
            <view class="wechat-avatar-action">
              <ProfileAvatar v-if="chosenAvatar" :src="chosenAvatar" :size="64" />
              <text v-else class="wechat-avatar-placeholder" aria-hidden="true">＋</text>
              <text class="wechat-avatar-label">{{
                chosenAvatar ? '已选头像' : '选用微信头像'
              }}</text>
              <text class="wechat-chevron" aria-hidden="true">›</text>
            </view>
          </button>
          <view v-else class="wechat-row wechat-avatar-fallback">
            <text class="wechat-label">头像</text>
            <text>当前微信版本暂不支持选用</text>
          </view>
          <view class="wechat-row wechat-nickname">
            <label class="wechat-label" for="wechat-profile-nickname">昵称</label>
            <input
              v-if="nicknameAvailable"
              id="wechat-profile-nickname"
              :key="nicknameField"
              :data-nickname-field="nicknameField"
              class="wechat-input"
              name="nickname"
              type="nickname"
              placeholder="点此选用微信昵称"
              placeholder-class="wechat-placeholder"
              :adjust-position="false"
              :maxlength="-1"
              :disabled="busy || submitted || review === 'pending'"
              @input="nicknameInput"
              @blur="nicknameBlur"
              @nicknamereview="nicknameReview"
              @keyboardheightchange="keyboardChanged"
            />
            <input
              v-else
              id="wechat-profile-nickname"
              class="wechat-input"
              name="nickname"
              type="text"
              placeholder="手动填写昵称"
              placeholder-class="wechat-placeholder"
              :adjust-position="false"
              :maxlength="-1"
              :disabled="busy || submitted"
              @input="nicknameInput"
              @blur="nicknameBlur"
              @keyboardheightchange="keyboardChanged"
            />
          </view>
        </view>
        <text v-if="partiallySaved && submitted" class="wechat-help">
          头像已保存，昵称待保存。
        </text>
        <AppNotice :message="saveError || nicknameNotice || avatarNotice" kind="error" />
        <button
          v-if="!submitted && (review === 'rejected' || (review === 'pending' && nicknameNotice))"
          class="wechat-action wechat-skip"
          @click="skipNickname"
        >
          保留原昵称
        </button>
        <view class="wechat-actions">
          <button class="wechat-action wechat-cancel" :disabled="busy" @click="emit('close')">
            {{ submitted ? '关闭' : '取消' }}
          </button>
          <button
            v-if="!submitted || retryLabel || busy"
            class="wechat-action wechat-save"
            form-type="submit"
            :loading="busy"
            :disabled="busy || (!submitted && !chosenAvatar && !typedNickname)"
          >
            {{ busy ? '正在保存' : retryLabel || '保存资料' }}
          </button>
        </view>
      </form>
    </view>
  </view>
</template>

<style scoped>
.wechat-shade {
  --wechat-surface: #fff;
  --wechat-soft: #f5f4f1;
  --wechat-ink: #152a39;
  --wechat-muted: #596978;
  --wechat-line: #e7e3dc;
  --wechat-primary: #d53c2d;
  --wechat-on-primary: #fff;
  --wechat-highlight: #0b6355;
  --wechat-mask: rgb(27 37 42 / 42%);
  position: fixed;
  inset: 0;
  z-index: 1600;
  background: var(--wechat-mask);
}
.wechat-shade--dark {
  --wechat-surface: #2b272c;
  --wechat-soft: #353035;
  --wechat-ink: #f3efef;
  --wechat-muted: #c1b8bd;
  --wechat-line: #484149;
  --wechat-primary: #ff988b;
  --wechat-on-primary: #411a1a;
  --wechat-highlight: #a2d6c6;
  --wechat-mask: rgb(8 6 8 / 66%);
}
.wechat-sheet {
  position: absolute;
  bottom: var(--wechat-keyboard-offset);
  inset-inline: 0;
  width: 100%;
  max-width: 540px;
  max-height: calc(100vh - var(--wechat-keyboard-offset));
  margin-inline: auto;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 19px 16px calc(18px + env(safe-area-inset-bottom));
  border-radius: 23px 23px 0 0;
  background: var(--wechat-surface);
  color: var(--wechat-ink);
  font-size: 14px;
  line-height: 1.5;
}
.wechat-sheet--keyboard {
  padding-bottom: 18px;
}
.wechat-heading {
  margin-bottom: 14px;
}
.wechat-title,
.wechat-purpose,
.wechat-help {
  display: block;
}
.wechat-title,
.wechat-label,
.wechat-avatar-label,
.wechat-avatar-placeholder,
.wechat-chevron {
  margin: 0;
}
.wechat-title {
  font-size: 19px;
  font-weight: 680;
  line-height: 1.35;
}
.wechat-purpose,
.wechat-help,
.wechat-avatar-fallback {
  color: var(--wechat-muted);
  font-size: 12px;
}
.wechat-purpose {
  margin: 4px 0 0;
}
.wechat-fields {
  border-top: 1px solid var(--wechat-line);
  border-bottom: 1px solid var(--wechat-line);
}
.wechat-row,
.wechat-avatar-action {
  display: flex;
  align-items: center;
}
.wechat-row {
  justify-content: space-between;
  gap: 10px;
  min-height: 54px;
}
.wechat-avatar-button {
  width: 100%;
  margin: 0;
  padding: 4px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--wechat-ink);
  font-size: 14px;
  line-height: 1.5;
}
.wechat-avatar-button[disabled] {
  background: transparent;
}
.wechat-avatar-button::after,
.wechat-action::after {
  border: 0;
}
.wechat-label {
  flex: none;
  color: var(--wechat-ink);
  font-size: 14px;
  font-weight: 650;
}
.wechat-avatar-action {
  min-width: 0;
  justify-content: flex-end;
  gap: 7px;
  color: var(--wechat-highlight);
}
.wechat-avatar-placeholder {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border: 1px dashed var(--wechat-line);
  border-radius: 50%;
  background: var(--wechat-soft);
  color: var(--wechat-muted);
  font-weight: 650;
}
.wechat-chevron {
  flex: none;
  color: var(--wechat-muted);
  font-size: 21px;
  line-height: 1;
}
.wechat-nickname {
  border-top: 1px solid var(--wechat-line);
}
.wechat-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  margin: 0;
  padding: 0 0 0 4px;
  border: 0;
  background: transparent;
  color: var(--wechat-ink);
  text-align: right;
  font-size: 16px;
  line-height: 1.4;
}
.wechat-input :deep(.wechat-placeholder) {
  color: var(--wechat-muted);
}
.wechat-help {
  margin: 12px 0 0;
}
.wechat-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 9px;
  margin-top: 12px;
}
.wechat-action {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin: 0;
  padding: 6px 10px;
  border: 0;
  border-radius: 10px;
  background: var(--wechat-soft);
  color: var(--wechat-ink);
  font-size: 14px;
  line-height: 1.5;
}
.wechat-cancel:only-child {
  grid-column: 1 / -1;
}
.wechat-save {
  background: var(--wechat-primary);
  color: var(--wechat-on-primary);
  font-weight: 650;
}
.wechat-action[disabled] {
  background: var(--wechat-soft);
  color: var(--wechat-muted);
  opacity: 1;
}
.wechat-skip {
  margin-top: 12px;
}
</style>
