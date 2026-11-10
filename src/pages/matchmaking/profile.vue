<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import MatchmakingForm from '@/components/MatchmakingForm.vue'
import { getMatchmakingAccountProfile } from '@/api/matchmaking'
import { useMatchmakingPage } from '@/composables/use-matchmaking-page'
import {
  matchmakingID,
  matchmakingKey,
  matchmakingMbtis,
  parseMatchmakingProfileDraft,
} from '@/utils/matchmaking'
import type { MatchmakingProfileDraft } from '@/types/matchmaking'

const profileScope = 'account-profile'
const activity = ref('')
const version = ref(0)
const form = ref<MatchmakingProfileDraft | null>(null)
const page = useMatchmakingPage(
  () => {
    form.value = null
    version.value = 0
  },
  () => profileScope,
)
const { user, busy, writing, pending, error, notice, gate } = page
const grades = computed(() => user.user?.grade_options ?? [])
const locked = computed(() => busy.value || writing.value || !!pending.value)
const types = ['', ...matchmakingMbtis]
const typeLabels = ['未设置', ...matchmakingMbtis]
const assessmentURL = 'https://www.16personalities.com/ch/人格测试'

function initialProfile(): MatchmakingProfileDraft {
  const identity = user.user?.identity_tags
  const gender = identity?.gender
  const campus = identity?.campus
  return {
    name: (user.user?.nickname ?? '').slice(0, 32),
    gender: gender === 'female' || gender === 'male' ? gender : '',
    education: '',
    grade: identity?.grade ?? '',
    campus:
      campus === 'wushan' || campus === 'university_town' || campus === 'international'
        ? campus
        : '',
    mbti: '',
    age: 0,
    age_min: 18,
    age_max: 30,
    height: 0,
    height_min: 150,
    height_max: 200,
    weight: 0,
    weight_min: 80,
    weight_max: 180,
    wechat: '',
    introduction: '',
    consent: false,
  }
}
async function load() {
  await page.read(async (active) => {
    const command = pending.value
    if (command?.kind === 'profile') {
      version.value = command.input.expected_version
      form.value = { ...command.input.profile }
      return
    }
    const result = await getMatchmakingAccountProfile()
    if (!active()) return
    version.value = result.version
    form.value = result.profile ?? initialProfile()
  })
}
function selectPersonality(event: { detail: { value: string | number } }) {
  const mbti = types[Number(event.detail.value)]
  if (!locked.value && form.value && mbti !== undefined) form.value = { ...form.value, mbti }
}
function copyAssessment() {
  const current = page.actionTicket()
  uni.setClipboardData({
    data: assessmentURL,
    showToast: false,
    success: () => {
      if (current()) notice.value = '链接已复制，可在浏览器中打开。'
    },
    fail: () => {
      if (current()) error.value = '复制失败，可长按选中网址。'
    },
  })
}
async function save() {
  if (!form.value || locked.value) return
  try {
    const profile = parseMatchmakingProfileDraft({ ...form.value, consent: false })
    await page.write(
      {
        kind: 'profile',
        activityId: profileScope,
        key: matchmakingKey(),
        input: { expected_version: version.value, profile },
      },
      load,
    )
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请检查个人资料。'
  }
}
function returnToActivity() {
  if (locked.value || !activity.value) return
  uni.navigateBack({
    fail: () => uni.redirectTo({ url: `/pages/matchmaking/detail?id=${activity.value}` }),
  })
}
onLoad((query) => {
  if (matchmakingID(query?.activity)) activity.value = query.activity
})
onShow(() => {
  void load()
})
</script>

<template>
  <AppPage title="个人资料">
    <view v-if="gate" class="card profile-card">
      <text>{{ gate }}</text>
      <navigator v-if="!user.isLoggedIn" url="/pages/login/index" class="small-link"
        >微信登录 ›</navigator
      >
    </view>
    <text v-if="busy" class="notice">正在读取个人资料…</text>
    <template v-if="form">
      <view class="card profile-card">
        <text class="section-title">人格标签</text>
        <picker
          :disabled="locked"
          :range="typeLabels"
          :value="Math.max(0, types.indexOf(form.mbti))"
          @change="selectPersonality"
        >
          <view class="personality-picker">{{ form.mbti || '未设置' }} ›</view>
        </picker>
        <text class="muted"
          >人格标签选填，来源为本人填写。参加包分配时，标签可随本次报名资料提交。</text
        >
        <view class="assessment">
          <text class="section-title">16Personalities 官方测评</text>
          <text class="muted">在浏览器完成测评后，可以回来手动选择结果的四字母类型。</text>
          <text class="muted" selectable>{{ assessmentURL }}</text>
          <button @click="copyAssessment">复制官方测评链接</button>
        </view>
      </view>
      <view class="card profile-card">
        <text class="section-title">包分配报名资料</text>
        <text class="muted"
          >保存后可在活动中确认报名。可以先只保存人格标签，报名所需资料也可稍后补齐。</text
        >
        <MatchmakingForm v-model="form" :grades="grades" :disabled="locked" />
      </view>
      <button
        :disabled="locked"
        class="profile-save"
        :loading="isPageActionPending('matchmaking-account-save')"
        @click="runPageAction(() => save(), 'matchmaking-account-save')"
      >
        保存个人资料
      </button>
    </template>
    <view v-if="pending" class="card profile-card">
      <text>上次保存结果尚未确认，请原样重试。</text>
      <button
        :disabled="busy || writing"
        :loading="isPageActionPending('matchmaking-account-retry')"
        @click="runPageAction(() => page.retry(load), 'matchmaking-account-retry')"
      >
        原样重试上次操作
      </button>
    </view>
    <button v-if="!form && !gate && !busy" @click="load">重新读取个人资料</button>
    <button v-if="activity" :disabled="locked" @click="returnToActivity">返回活动</button>
    <AppNotice :message="error" kind="error" />
    <AppNotice :message="notice" kind="success" />
  </AppPage>
</template>

<style scoped>
.profile-card,
.assessment {
  display: grid;
  gap: 20rpx;
  margin-bottom: 24rpx;
}
.assessment {
  border-top: 1rpx solid var(--theme-line);
  padding-top: 20rpx;
  margin-bottom: 0;
}
.personality-picker {
  border: 1rpx solid var(--theme-line);
  border-radius: 18rpx;
  padding: 22rpx;
}
.muted {
  font-size: 24rpx;
  line-height: 1.7;
  opacity: 0.75;
  overflow-wrap: anywhere;
}
</style>
