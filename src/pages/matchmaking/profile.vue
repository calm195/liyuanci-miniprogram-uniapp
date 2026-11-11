<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onHide, onUnload, onPullDownRefresh } from '@dcloudio/uni-app'
import { campuses, genders } from '@/types/wish'
import AppPage from '@/components/AppPage.vue'
import MatchmakingForm from '@/components/MatchmakingForm.vue'
import { useMatchmakingProfile } from '@/composables/use-matchmaking-profile'
import { matchmakingID } from '@/utils/matchmaking'
import type { MatchmakingPreferences } from '@/types/matchmaking'
const activity = ref('')
const {
  page,
  traitSelections,
  personalTraitSelections,
  form,
  locked,
  dirty,
  save,
  refreshDraft,
  load,
} = useMatchmakingProfile()
const { user, busy, writing, pending, error, notice, gate } = page
const saving = ref(false)
let timer: ReturnType<typeof globalThis.setTimeout> | undefined
const shared = computed(() => (user.validated ? user.user : null))
const yearLabel = computed(
  () =>
    shared.value?.grade_options?.find((item) => item.code === shared.value?.identity_tags?.grade)
      ?.label ??
    shared.value?.identity_tags?.grade ??
    '未填写',
)
const commonURL = computed(
  () => `/pages/settings/index${activity.value ? `?activity=${activity.value}` : ''}`,
)
onLoad((query) => {
  if (matchmakingID(query?.activity)) activity.value = query.activity
})
async function reload() {
  const active = page.actionTicket()
  try {
    await user.refresh(false, true)
    await load()
  } catch {
    if (active()) error.value = '登录资料暂不可读取，请刷新后重试。'
  }
}
async function saveForm(manual = true) {
  globalThis.clearTimeout(timer)
  if (saving.value) return
  saving.value = true
  try {
    await save(manual)
  } finally {
    saving.value = false
    if (dirty.value && !pending.value && !error.value) {
      timer = globalThis.setTimeout(() => {
        void saveForm(false)
      }, 600)
    }
  }
}
function edit(draft: MatchmakingPreferences) {
  form.value = draft
  globalThis.clearTimeout(timer)
  timer = globalThis.setTimeout(() => {
    void saveForm(false)
  }, 600)
}
async function returnToActivity() {
  if (dirty.value || pending.value) await saveForm()
  if (dirty.value || pending.value || error.value) return
  uni.navigateBack({
    fail: () => uni.redirectTo({ url: `/pages/matchmaking/detail?id=${activity.value}` }),
  })
}
onShow(() => {
  void reload()
})
onHide(() => {
  globalThis.clearTimeout(timer)
})
onUnload(() => {
  globalThis.clearTimeout(timer)
})
onPullDownRefresh(async () => {
  try {
    await refreshDraft()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage>
    <text class="title">包分配资料</text>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index" class="card"
      >登录后填写资料 ›</navigator
    >
    <view v-if="shared" class="card shared-profile">
      <text class="section-title">共享基础信息</text>
      <text
        >{{ shared.nickname || '未填写昵称' }} · {{ yearLabel }} ·
        {{ shared.mbti || '未填写 MBTI' }}
        ·
        {{
          campuses.find((item) => item.value === shared?.identity_tags?.campus)?.label ||
          '未填写校区'
        }}
        ·
        {{
          genders.find((item) => item.value === shared?.identity_tags?.gender)?.label ||
          '未填写性别'
        }}</text
      >
      <text class="muted">昵称、校区、性别、MBTI 与学籍信息来自个人资料。</text>
      <navigator :url="commonURL">编辑基础信息 ›</navigator>
    </view>
    <text v-if="busy">正在读取包分配资料…</text>
    <text v-if="gate">{{ gate }}</text>
    <view v-if="form" class="card">
      <text class="muted"
        >资料用于报名审核和向有效配对对象展示。保存资料后，请回到活动确认报名；已报名内容需在活动中更新。</text
      >
      <MatchmakingForm
        :model-value="form"
        :trait-selections="traitSelections"
        :personal-trait-selections="personalTraitSelections"
        :disabled="busy || !!pending || (locked && !saving)"
        @update:model-value="edit"
      />
      <text v-if="pending" class="muted">上次保存结果尚未确认，请使用原请求重试。</text>
      <text v-else-if="saving" class="muted">正在保存…</text>
      <text v-else-if="dirty" class="muted">有改动尚未保存</text>
      <text v-else class="muted">修改后自动保存，也可手动保存。</text>
      <button
        :disabled="busy || writing"
        :loading="isPageActionPending('matchmaking-save-profile')"
        @click="runPageAction(() => saveForm(), 'matchmaking-save-profile')"
      >
        {{ pending ? '原样重试保存' : '保存包分配资料' }}
      </button>
    </view>
    <button
      v-if="!form && !busy && user.isLoggedIn"
      :loading="isPageActionPending('matchmaking-profile-reload')"
      @click="runPageAction(reload, 'matchmaking-profile-reload')"
    >
      重新读取资料
    </button>
    <button
      v-if="activity"
      :disabled="busy || writing"
      :loading="isPageActionPending('matchmaking-profile-return')"
      @click="runPageAction(returnToActivity, 'matchmaking-profile-return')"
    >
      保存并返回活动
    </button>
    <AppNotice :message="error" kind="error" />
    <AppNotice :message="notice" kind="info" />
  </AppPage>
</template>
<style scoped>
.card {
  display: grid;
  gap: 24rpx;
}
.muted {
  font-size: 24rpx;
  line-height: 1.7;
  opacity: 0.75;
}
</style>
