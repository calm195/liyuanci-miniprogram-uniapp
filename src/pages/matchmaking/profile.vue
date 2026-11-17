<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import { computed, ref } from 'vue'
import { onLoad, onShow, onHide, onUnload, onPullDownRefresh } from '@dcloudio/uni-app'
import { campuses, genders } from '@/types/wish'
import AppPage from '@/components/AppPage.vue'
import { useThemeStore } from '@/stores/theme'
import MatchmakingForm from '@/components/MatchmakingForm.vue'
import { useMatchmakingProfile } from '@/composables/use-matchmaking-profile'
import { matchmakingID } from '@/utils/matchmaking'
import type { MatchmakingPreferences } from '@/types/matchmaking'
const activity = ref('')
const step = ref(1)
const theme = useThemeStore()
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
useLoginRefresh(() => reload())
</script>
<template>
  <AppPage responsive-padding>
    <view class="match-experience" :class="{ dark: theme.mode === 'dark' }">
      <view class="match-hero">
        <text class="content-text match-kicker">给未来的相遇</text>
        <text class="content-text match-title">先从认识你开始</text>
        <text class="content-text match-description">认真写下自己，也留一点空间给惊喜。</text>
      </view>
      <LoginLink v-if="!user.isLoggedIn" class="match-card">登录后填写资料 ›</LoginLink>
      <text v-if="busy" class="content-text muted">正在读取包分配资料…</text>
      <text v-if="gate" class="content-text muted">{{ gate }}</text>
      <template v-if="form">
        <MatchmakingForm
          :model-value="form"
          :step="step"
          :trait-selections="traitSelections"
          :personal-trait-selections="personalTraitSelections"
          :disabled="busy || !!pending || (locked && !saving)"
          @update:model-value="edit"
          @update:step="step = $event"
        >
          <template #identity>
            <view v-if="shared" class="shared-profile"
              ><view class="shared-copy"
                ><view class="shared-heading"
                  ><text class="content-text shared-name">{{
                    shared.nickname || '未填写昵称'
                  }}</text
                  ><text
                    v-if="shared.verification === 'verified'"
                    class="content-text identity-badge"
                    >已认证</text
                  ></view
                ><text class="content-text muted"
                  >{{
                    campuses.find((item) => item.value === shared?.identity_tags?.campus)?.label ||
                    '未填写校区'
                  }}
                  · {{ yearLabel }} · {{ shared.mbti || '未填写 MBTI' }} ·
                  {{
                    genders.find((item) => item.value === shared?.identity_tags?.gender)?.label ||
                    '未填写性别'
                  }}</text
                ></view
              ><navigator :url="commonURL" class="shared-edit">编辑基础资料</navigator></view
            >
          </template>
          <template #submit
            ><button
              class="match-primary"
              :disabled="busy || writing"
              :loading="isPageActionPending('matchmaking-save-profile')"
              @click="runPageAction(() => saveForm(), 'matchmaking-save-profile')"
            >
              {{ pending ? '原样重试保存' : '保存包分配资料' }}
            </button></template
          >
        </MatchmakingForm>
        <view class="save-status" aria-live="polite"
          ><text v-if="pending" class="content-text">上次保存结果尚未确认，请使用原请求重试。</text
          ><text v-else-if="saving" class="content-text">正在保存…</text
          ><text v-else-if="dirty" class="content-text">有改动尚未保存</text
          ><text v-else class="content-text">修改后自动保存，也可手动保存。</text
          ><button
            v-if="step !== 3 || pending"
            class="save-link"
            :disabled="busy || writing"
            :loading="isPageActionPending('matchmaking-save-draft')"
            @click="runPageAction(() => saveForm(), 'matchmaking-save-draft')"
          >
            {{ pending ? '原样重试保存' : '保存当前资料' }}
          </button></view
        >
      </template>
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
      <AppNotice :message="error" kind="error" /><AppNotice :message="notice" kind="info" />
    </view>
  </AppPage>
</template>
<style scoped lang="scss">
@use '@/styles/matchmaking.scss';
.shared-profile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 32rpx;
  padding-bottom: 32rpx;
  border-bottom: 1rpx solid var(--theme-line);
}
.shared-copy {
  min-width: 0;
}
.shared-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.shared-name {
  font-size: 28rpx;
  font-weight: 600;
}
.identity-badge {
  padding: 4rpx 12rpx;
  border-radius: 12rpx;
  background: var(--match-soft);
  color: var(--match-accent);
  font-size: 22rpx;
}
.shared-edit {
  flex-shrink: 0;
  margin: 0;
  padding: 12rpx 0;
  font-size: 24rpx;
  color: var(--match-accent);
}
.save-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin: 24rpx 0;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.7;
}
.save-status .save-link {
  margin: 0;
  padding: 8rpx;
  border: 0;
  background: transparent;
  color: var(--match-accent);
  font-size: 24rpx;
  line-height: 1.5;
}
</style>
