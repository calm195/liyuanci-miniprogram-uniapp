<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import { computed, ref } from 'vue'
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import MatchmakingResult from '@/components/MatchmakingResult.vue'
import { useThemeStore } from '@/stores/theme'
import MatchmakingProfile from '@/components/MatchmakingProfile.vue'
import MatchmakingActivitySummary from '@/components/MatchmakingActivitySummary.vue'
import { getMatchmaking, getMatchmakingAccountProfile } from '@/api/matchmaking'
import { useMatchmakingPage } from '@/composables/use-matchmaking-page'
import {
  canEditMatchmaking,
  matchmakingEnrollmentLabel,
  matchmakingID,
  matchmakingKey,
  matchmakingPhaseLabel,
  matchmakingResultState,
  matchmakingProfileProblem,
  parseMatchmakingProfile,
} from '@/utils/matchmaking'
import { beijingTime } from '@/utils/capsules'
import type {
  MatchmakingDetail,
  MatchmakingAccountProfile,
  MatchmakingTask,
} from '@/types/matchmaking'

const id = ref('')
const theme = useThemeStore()
const enrollmentExpanded = ref(false)
const scheduleExpanded = ref(false)
const detail = ref<MatchmakingDetail | null>(null)
const editing = ref(false)
const account = ref<MatchmakingAccountProfile | null>(null)
const editVersion = ref(0)
const consent = ref(false)
const exitReason = ref('')
const expandedTask = ref('')
const tasksExpanded = ref(false)
const page = useMatchmakingPage(
  () => {
    detail.value = null
    editing.value = false
    account.value = null
    consent.value = false
    exitReason.value = ''
    expandedTask.value = ''
    tasksExpanded.value = false
    enrollmentExpanded.value = false
    scheduleExpanded.value = false
  },
  () => id.value,
)
const { user, busy, writing, error, notice, gate, pending } = page
const locked = computed(() => busy.value || writing.value || !!pending.value)
const verified = computed(() => user.validated && user.user?.verification === 'verified')
const grades = computed(() => user.user?.grade_options ?? [])
const canEdit = computed(
  () =>
    !!detail.value &&
    canEditMatchmaking(detail.value) &&
    verified.value &&
    !user.user?.penalty_notice,
)
const canExit = computed(
  () => !!detail.value?.enrollment && detail.value.enrollment.status !== 'withdrawn',
)
const profileProblem = computed(() => {
  const profile = account.value?.profile
  if (!profile) return '请先完善个人资料。'
  const problem = matchmakingProfileProblem({ ...profile, consent: true })
  if (problem) return problem
  if (
    !grades.value.some((item) => item.code === profile.grade) &&
    !/^(undergraduate|master|doctoral)_[1-9]\d*$/.test(profile.grade)
  )
    return '请选择当前可用的年级。'
  return ''
})
const preview = computed(() => {
  const profile = account.value?.profile
  return profile && !profileProblem.value ? parseMatchmakingProfile(profile) : null
})
const enrollmentText = computed(() =>
  detail.value?.enrollment
    ? matchmakingEnrollmentLabel(detail.value.enrollment.status)
    : '尚未报名',
)
const showTasks = computed(
  () =>
    !!detail.value &&
    matchmakingResultState(detail.value) === 'paired' &&
    detail.value.pair?.accessible,
)
const featuredTask = computed(() => {
  const tasks = detail.value?.tasks ?? []
  return tasks.filter((task) => !!task.body).slice(-1)[0] ?? tasks[0]
})
const visibleTasks = computed(() =>
  tasksExpanded.value
    ? (detail.value?.tasks ?? [])
    : featuredTask.value
      ? [featuredTask.value]
      : [],
)
function gradeLabel(code: string) {
  const configured = grades.value.find((item) => item.code === code)?.label
  if (configured) return configured
  const match = /^(undergraduate|master|doctoral)_([1-9]\d*)$/.exec(code)
  if (!match) return code
  const level =
    match[1] === 'undergraduate' ? '本科' : match[1] === 'master' ? '硕士研究生' : '博士研究生'
  return `${level}${match[2]}年级`
}
async function load() {
  await page.read(async (active) => {
    if (!matchmakingID(id.value)) throw new Error('活动地址无效，请返回活动列表。')
    const result = await getMatchmaking(id.value)
    if (!active()) return
    detail.value = result
    if (canEdit.value && !pending.value) {
      const profile = await getMatchmakingAccountProfile()
      if (active()) {
        if (
          account.value?.version !== profile.version ||
          account.value?.account_version !== profile.account_version
        )
          consent.value = false
        account.value = profile
      }
    }
  })
}
function beginEdit() {
  if (!canEdit.value || locked.value || !detail.value) return
  editVersion.value = detail.value.enrollment?.version ?? 0
  consent.value = false
  editing.value = true
}
function cancelEdit() {
  editing.value = false
  consent.value = false
}
function selectConsent(event: { detail: { value: string[] } }) {
  consent.value = event.detail.value.includes('consent')
}
async function submit() {
  if (!canEdit.value || locked.value || !detail.value || !account.value) return
  if (profileProblem.value) {
    error.value = profileProblem.value
    return
  }
  if (!consent.value) {
    error.value = '请先阅读并勾选资料展示说明。'
    return
  }
  await page.write(
    {
      kind: 'enroll',
      activityId: id.value,
      key: matchmakingKey(),
      input: {
        expected_version: editVersion.value,
        profile_version: account.value.version,
        account_version: account.value.account_version,
        consent: true,
      },
    },
    async () => {
      cancelEdit()
      await load()
    },
  )
}
async function withdraw() {
  const enrollment = detail.value?.enrollment
  if (!enrollment || !canExit.value || locked.value) return
  const reason = exitReason.value.trim()
  if (!reason) {
    error.value = '请填写退出原因。'
    return
  }
  const active = page.actionTicket()
  const accepted = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: '退出本次活动',
      content: '退出后当前配对解除，并停止访问本次活动的聊天、对方资料和任务。是否继续？',
      confirmText: '确认退出',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  )
  if (
    !accepted ||
    !active() ||
    locked.value ||
    detail.value?.enrollment?.id !== enrollment.id ||
    detail.value.enrollment.version !== enrollment.version
  )
    return
  await page.write(
    {
      kind: 'withdraw',
      activityId: id.value,
      key: matchmakingKey(),
      input: { expected_version: enrollment.version, reason },
    },
    load,
  )
}
async function openTask(task: MatchmakingTask) {
  if (locked.value || !detail.value?.tasks.some((item) => item.id === task.id)) return
  if (!task.body) {
    error.value = '任务尚未开放，请到时间后刷新。'
    return
  }
  const active = page.actionTicket()
  if (task.can_open && !task.opened_at) {
    await page.write(
      { kind: 'open', activityId: id.value, taskId: task.id, key: matchmakingKey(), input: {} },
      load,
    )
    if (!active() || pending.value || error.value) return
  }
  if (detail.value?.tasks.some((item) => item.id === task.id && item.body))
    expandedTask.value = expandedTask.value === task.id ? '' : task.id
}
async function retry() {
  await page.retry(async () => {
    cancelEdit()
    await load()
  })
}
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
})
onShow(() => {
  void load()
})
onPullDownRefresh(async () => {
  try {
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <view class="match-experience" :class="{ dark: theme.mode === 'dark' }">
      <view v-if="gate" class="match-card"
        ><text class="content-text">{{ gate }}</text
        ><LoginLink class="small-link">微信登录 ›</LoginLink></view
      >
      <text v-if="busy" class="content-text notice">正在读取最新活动状态…</text>
      <template v-if="detail">
        <MatchmakingResult
          :detail="detail"
          :grade-label="detail.pair?.peer ? gradeLabel(detail.pair.peer.grade) : ''"
        />
        <view v-if="showTasks" class="match-card task-card">
          <view class="task-heading"
            ><text class="content-text section-title">每天，靠近一点</text
            ><text v-if="featuredTask" class="content-text muted"
              >第 {{ featuredTask.day_index }} 天</text
            ></view
          >
          <text v-if="!detail.tasks.length" class="content-text muted">每日任务尚未开放。</text>
          <view v-for="task in visibleTasks" :key="task.id" class="task-row">
            <view class="task-summary">
              <text class="content-text task-day"
                >DAY {{ String(task.day_index).padStart(2, '0') }}</text
              >
              <view class="task-copy"
                ><text class="content-text task-name">{{
                  task.kind === 'offline' ? '今日线下互动' : '今日线上互动'
                }}</text
                ><text class="content-text muted">{{
                  task.opened_at
                    ? '本人已查看'
                    : task.body
                      ? '还未查看 · 点开后阅读任务内容'
                      : `待解锁 · ${beijingTime(task.unlocks_at)}`
                }}</text></view
              >
              <button
                :disabled="locked || !task.body"
                :loading="isPageActionPending('matchmaking-open-task-' + task.id)"
                @click="runPageAction(() => openTask(task), 'matchmaking-open-task-' + task.id)"
              >
                {{ expandedTask === task.id ? '收起' : '查看' }}
              </button>
            </view>
            <view v-if="expandedTask === task.id && task.body" class="task-body"
              ><text class="content-text muted"
                >{{ task.kind === 'online' ? '线上互动' : '线下互动' }} ·
                {{ beijingTime(task.unlocks_at) }} 解锁</text
              ><text class="content-text preserve-text">{{ task.body }}</text></view
            >
          </view>
          <view class="task-footer">
            <button
              v-if="detail.tasks.length > 1"
              class="task-all"
              :aria-expanded="tasksExpanded"
              @click="tasksExpanded = !tasksExpanded"
            >
              {{ tasksExpanded ? '收起全部' : `查看全部 ${detail.tasks.length} 天` }}
            </button>
            <text class="content-text muted">任务记录表示是否查看，不代表已经完成。</text>
          </view>
        </view>
        <view v-if="!verified && detail.activity.phase === 'registration'" class="match-card">
          <text class="content-text">报名需要通过平台学生认证。</text>
          <navigator url="/pages/verification/index" class="small-link">查看学生认证 ›</navigator>
        </view>
        <view v-if="user.user?.penalty_notice" class="match-card">
          <text class="content-text">{{ user.user.penalty_notice }}</text>
          <navigator url="/pages/safety/index" class="small-link">查看警告与申诉 ›</navigator>
          <text class="content-text">已报名用户可在本页退出本次活动。</text>
        </view>
        <view class="match-card enrollment-card">
          <view class="enrollment-heading"
            ><text class="content-text section-title">我的报名</text
            ><text class="content-text enrollment-state">{{ enrollmentText }}</text></view
          >
          <button
            v-if="detail.enrollment?.profile && !editing"
            class="schedule-toggle"
            :aria-expanded="enrollmentExpanded"
            @click="enrollmentExpanded = !enrollmentExpanded"
          >
            报名资料
            <text class="content-text">{{ enrollmentExpanded ? '收起 −' : '查看快照 +' }}</text>
          </button>
          <text v-if="detail.enrollment?.reason" class="content-text preserve-text">{{
            detail.enrollment.reason
          }}</text>
          <MatchmakingProfile
            v-if="detail.enrollment?.profile && !editing && enrollmentExpanded"
            :profile="detail.enrollment.profile"
            :grade-label="gradeLabel(detail.enrollment.profile.grade)"
            own
          />
          <button
            v-if="canEdit && !editing"
            :disabled="locked"
            :loading="isPageActionPending('matchmaking-begin-edit')"
            @click="runPageAction(() => beginEdit(), 'matchmaking-begin-edit')"
          >
            {{
              detail.enrollment?.status === 'withdrawn'
                ? '重新报名'
                : detail.enrollment
                  ? '更新报名资料'
                  : '查看资料并报名'
            }}
          </button>
          <text
            v-if="
              !canEdit &&
              detail.activity.phase !== 'ended' &&
              detail.enrollment?.status !== 'withdrawn'
            "
            class="content-text muted"
            >报名截止、已有配对或当前资格受限时，不能修改报名资料。</text
          >
        </view>
        <view v-if="editing" class="match-card">
          <text class="content-text section-title">确认个人资料</text>
          <text class="content-text muted"
            >报名使用当前账号资料，提交后保存本次报名的资料快照。</text
          >
          <template v-if="preview">
            <MatchmakingProfile :profile="preview" :grade-label="gradeLabel(preview.grade)" own />
            <checkbox-group class="enrollment-consent" @change="selectConsent">
              <label class="consent"
                ><checkbox value="consent" :checked="consent" :disabled="locked" /><text
                  class="content-text"
                  >我已阅读活动说明，同意审核通过的资料和配对偏好向当前有效配对对象展示。退出或解除配对后停止访问。</text
                ></label
              >
            </checkbox-group>
            <button
              :disabled="locked || !canEdit"
              class="enrollment-submit match-primary"
              :loading="isPageActionPending('matchmaking-submit-enrollment')"
              @click="runPageAction(() => submit(), 'matchmaking-submit-enrollment')"
            >
              确认报名
            </button>
          </template>
          <text v-else class="content-text muted">{{ profileProblem }}</text>
          <navigator
            v-if="!locked"
            :url="`/pages/matchmaking/profile?activity=${id}`"
            class="small-link profile-editor-link"
            >{{ preview ? '编辑个人资料' : '去完善个人资料' }} ›</navigator
          >
          <button :disabled="locked" @click="cancelEdit">取消</button>
        </view>
        <view class="match-card activity-summary">
          <text class="content-text section-title">活动说明与日程</text>
          <view class="summary-heading">
            <text class="content-text category-pill">{{
              matchmakingPhaseLabel(detail.activity.phase)
            }}</text>
            <text class="content-text muted">{{ detail.activity.days }} 天互动</text>
          </view>
          <text class="content-text activity-name">{{ detail.activity.title }}</text>
          <text class="content-text match-description preserve-text">{{
            detail.activity.description
          }}</text>
          <MatchmakingActivitySummary
            v-if="detail.activity.summary"
            :summary="detail.activity.summary"
          />
          <button
            class="schedule-toggle"
            :aria-expanded="scheduleExpanded"
            @click="scheduleExpanded = !scheduleExpanded"
          >
            活动日程
            <text class="content-text">{{ scheduleExpanded ? '收起 −' : '查看全部 +' }}</text>
          </button>
          <view v-show="scheduleExpanded" class="schedule"
            ><text class="content-text">报名开始</text
            ><text class="content-text">{{
              beijingTime(detail.activity.registration_opens_at)
            }}</text
            ><text class="content-text">报名截止</text
            ><text class="content-text">{{
              beijingTime(detail.activity.registration_closes_at)
            }}</text
            ><text class="content-text">最早结果发布</text
            ><text class="content-text">{{ beijingTime(detail.activity.results_at) }}</text
            ><text class="content-text">活动开始</text
            ><text class="content-text">{{ beijingTime(detail.activity.starts_at) }}</text
            ><text class="content-text">活动结束</text
            ><text class="content-text">{{ beijingTime(detail.activity.ends_at) }}</text></view
          >
          <text class="content-text muted">以上时间均为北京时间。结果以运营实际发布为准。</text>
        </view>
        <view v-if="canExit" class="match-card exit-card"
          ><text class="content-text section-title">退出本次活动</text
          ><text class="content-text muted"
            >退出会解除当前配对，并停止访问本次活动的聊天、对方资料和任务。</text
          ><input
            v-model="exitReason"
            :disabled="locked"
            maxlength="200"
            placeholder="请填写退出原因"
          /><button
            :disabled="locked"
            :loading="isPageActionPending('matchmaking-withdraw')"
            @click="runPageAction(() => withdraw(), 'matchmaking-withdraw')"
          >
            退出本次活动
          </button></view
        >
      </template>
      <view v-if="pending" class="match-card"
        ><text class="content-text">上次操作结果尚未确认，已保留原始请求。请原样重试核实结果。</text
        ><button
          :disabled="busy || writing"
          :loading="isPageActionPending('matchmaking-retry-command')"
          @click="runPageAction(() => retry(), 'matchmaking-retry-command')"
        >
          原样重试上次操作
        </button></view
      >
      <button
        :disabled="busy || writing"
        :loading="isPageActionPending('matchmaking-detail-refresh')"
        @click="runPageAction(() => load(), 'matchmaking-detail-refresh')"
      >
        刷新活动状态
      </button>
      <navigator url="/pages/matchmaking/index" class="small-link">返回包分配活动列表 ›</navigator>
      <AppNotice :message="error" kind="error" /><AppNotice :message="notice" kind="success" />
    </view>
  </AppPage>
</template>
<style scoped lang="scss">
@use '@/styles/matchmaking.scss';
.activity-name {
  font-size: 30rpx;
  font-weight: 600;
}
.summary-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  margin-bottom: 18rpx;
}
.summary-heading .category-pill {
  background: var(--theme-surface);
  color: var(--match-accent);
}
.schedule-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
  width: 100%;
  margin: 24rpx 0 0;
  padding: 20rpx 0;
  border: 0;
  border-top: 1rpx solid var(--theme-line);
  border-radius: 0;
  background: transparent;
  color: var(--theme-ink);
  font-size: 26rpx;
  line-height: 1.6;
}
.schedule-toggle > text {
  color: var(--match-accent);
  font-size: 24rpx;
}
.preserve-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.schedule {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14rpx 22rpx;
  margin-bottom: 16rpx;
  font-size: 24rpx;
  line-height: 1.6;
}
.schedule text:nth-child(even) {
  text-align: right;
}
.enrollment-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}
.enrollment-state {
  flex-shrink: 0;
  padding: 6rpx 16rpx;
  border-radius: 99rpx;
  background: var(--match-soft);
  color: var(--match-accent);
  font-size: 22rpx;
}
.enrollment-card .schedule-toggle {
  margin-top: 0;
}
.task-card {
  gap: 0;
}
.task-row {
  padding: 28rpx 0;
  border-top: 1rpx solid var(--theme-line);
}
.task-summary {
  display: flex;
  gap: 24rpx;
  align-items: center;
}
.task-day {
  width: 72rpx;
  flex-shrink: 0;
  color: var(--match-accent);
  font-size: 24rpx;
  line-height: 1.4;
  white-space: pre-line;
}
.task-copy {
  flex: 1;
  min-width: 0;
}
.task-name {
  font-size: 28rpx;
  font-weight: 600;
}
.task-copy .muted {
  margin-top: 4rpx;
}
.task-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.task-body {
  display: grid;
  gap: 18rpx;
  margin-top: 24rpx;
}
.task-row button,
.task-all {
  margin: 0;
  padding: 12rpx 0;
  border: 0;
  border-radius: 0;
  font-size: 24rpx;
  color: var(--match-accent);
  background: transparent;
  line-height: 1.5;
}
.task-row button::after,
.task-all::after {
  border: 0;
}
.task-footer {
  display: grid;
  gap: 0;
}
.task-all {
  line-height: 1.6;
  justify-self: start;
}
.consent {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  font-size: 24rpx;
  line-height: 1.7;
}
.consent checkbox {
  flex-shrink: 0;
}
.exit-card input {
  height: 88rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 18rpx;
  padding: 20rpx;
  font-size: 28rpx;
}
.schedule[hidden] {
  display: none !important;
}
</style>
