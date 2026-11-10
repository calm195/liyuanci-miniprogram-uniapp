<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
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
const detail = ref<MatchmakingDetail | null>(null)
const editing = ref(false)
const account = ref<MatchmakingAccountProfile | null>(null)
const editVersion = ref(0)
const consent = ref(false)
const exitReason = ref('')
const expandedTask = ref('')
const page = useMatchmakingPage(
  () => {
    detail.value = null
    editing.value = false
    account.value = null
    consent.value = false
    exitReason.value = ''
    expandedTask.value = ''
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
  if (!grades.value.some((item) => item.code === profile.grade)) return '请选择当前可用的年级。'
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
const pairText = computed(() => {
  const pair = detail.value?.pair
  if (!pair)
    return detail.value?.activity.phase === 'ended'
      ? '本次活动已结束，你没有获得配对结果。'
      : detail.value?.activity.phase === 'active'
        ? '暂未获得配对结果。若运营已发布结果，表示本次尚未匹配。'
        : '配对结果尚未发布，请留意通知。'
  if (pair.status === 'ended') return '本次配对已结束，对方资料和每日任务不再开放。'
  if (pair.status === 'draft') return '运营正在核对配对安排，结果发布后可查看。'
  if (!pair.accessible && pair.conversation_id) return '你们已配对，可以先打个招呼。'
  if (!pair.accessible) return '配对结果暂不可查看，请核对活动开始时间和当前资格。'
  return '你们已配对，开始认识彼此吧。'
})
function gradeLabel(code: string) {
  return grades.value.find((item) => item.code === code)?.label ?? code
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
        if (account.value?.version !== profile.version) consent.value = false
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
</script>
<template>
  <AppPage>
    <view v-if="gate" class="card"
      ><text>{{ gate }}</text
      ><navigator url="/pages/login/index" class="small-link">微信登录 ›</navigator></view
    >
    <text v-if="busy" class="notice">正在读取最新活动状态…</text>
    <template v-if="detail">
      <view class="card activity-summary">
        <view class="summary-heading">
          <text class="category-pill">{{ matchmakingPhaseLabel(detail.activity.phase) }}</text>
          <text class="muted">{{ detail.activity.days }} 天互动</text>
        </view>
        <text class="activity-title">{{ detail.activity.title }}</text>
        <text class="preserve-text">{{ detail.activity.description }}</text>
        <MatchmakingActivitySummary
          v-if="detail.activity.summary"
          :summary="detail.activity.summary"
        />
        <text class="schedule-title">活动日程</text>
        <view class="schedule"
          ><text>报名开始</text><text>{{ beijingTime(detail.activity.registration_opens_at) }}</text
          ><text>报名截止</text
          ><text>{{ beijingTime(detail.activity.registration_closes_at) }}</text
          ><text>最早结果发布</text><text>{{ beijingTime(detail.activity.results_at) }}</text
          ><text>活动开始</text><text>{{ beijingTime(detail.activity.starts_at) }}</text
          ><text>活动结束</text><text>{{ beijingTime(detail.activity.ends_at) }}</text></view
        >
        <text class="muted">以上时间均为北京时间。结果以运营实际发布为准。</text>
      </view>
      <view v-if="!verified && detail.activity.phase === 'registration'" class="card"
        ><text>报名需要通过平台学生认证。</text
        ><navigator url="/pages/verification/index" class="small-link"
          >查看学生认证 ›</navigator
        ></view
      >
      <view v-if="user.user?.penalty_notice" class="card"
        ><text>{{ user.user.penalty_notice }}</text
        ><navigator url="/pages/safety/index" class="small-link">查看警告与申诉 ›</navigator
        ><text>已报名用户可在本页退出本次活动。</text></view
      >
      <view class="card enrollment-card">
        <text class="section-title">我的报名</text><text>{{ enrollmentText }}</text>
        <text v-if="detail.enrollment?.reason" class="preserve-text">{{
          detail.enrollment.reason
        }}</text>
        <MatchmakingProfile
          v-if="detail.enrollment?.profile && !editing"
          :profile="detail.enrollment.profile"
          :grade-label="gradeLabel(detail.enrollment.profile.grade)"
          own
        />
        <text
          v-if="
            detail.enrollment &&
            !detail.enrollment.eligible &&
            detail.enrollment.status !== 'withdrawn'
          "
          class="muted"
          >当前不满足可配对条件，审核与账号资格恢复后重新核对。</text
        >
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
          class="muted"
          >报名截止、已有配对或当前资格受限时，不能修改报名资料。</text
        >
      </view>
      <view v-if="editing" class="card">
        <text class="section-title">确认个人资料</text>
        <text class="muted">报名使用当前账号资料，提交后保存本次报名的资料快照。</text>
        <template v-if="preview">
          <MatchmakingProfile :profile="preview" :grade-label="gradeLabel(preview.grade)" own />
          <checkbox-group class="enrollment-consent" @change="selectConsent">
            <label class="consent">
              <checkbox value="consent" :checked="consent" :disabled="locked" />
              <text
                >我已阅读活动说明，同意审核通过的资料和配对偏好向当前有效配对对象展示。退出或解除配对后停止访问。</text
              >
            </label>
          </checkbox-group>
          <button
            :disabled="locked || !canEdit"
            class="enrollment-submit"
            :loading="isPageActionPending('matchmaking-submit-enrollment')"
            @click="runPageAction(() => submit(), 'matchmaking-submit-enrollment')"
          >
            确认报名
          </button>
        </template>
        <text v-else class="muted">{{ profileProblem }}</text>
        <navigator
          v-if="!locked"
          :url="`/pages/settings/index?activity=${id}`"
          class="small-link profile-editor-link"
          >{{ preview ? '编辑个人资料' : '去完善个人资料' }} ›</navigator
        >
        <button :disabled="locked" @click="cancelEdit">取消</button>
      </view>
      <view
        v-if="detail.enrollment && detail.enrollment.status !== 'withdrawn'"
        class="card result-card"
      >
        <text class="section-title">配对结果</text><text>{{ pairText }}</text>
        <navigator
          v-if="detail.pair?.conversation_id"
          :url="`/pages/chat/index?id=${detail.pair.conversation_id}`"
          class="chat-link"
          >进入聊天 ›</navigator
        >
        <template v-if="detail.pair?.accessible && detail.pair.peer">
          <view class="score"
            ><text>{{ detail.pair.score }}</text
            ><text>推荐参考分</text></view
          >
          <MatchmakingProfile
            :profile="detail.pair.peer"
            :grade-label="gradeLabel(detail.pair.peer.grade)"
          />
          <text class="muted">相处从尊重彼此开始，请勿向他人转发对方的个人资料。</text>
        </template>
      </view>
      <view v-if="detail.pair?.accessible" class="card task-card">
        <text class="section-title">一起做点小事</text
        ><text class="muted">每日一项任务，记录的是你是否查看过。完成情况由你们自己交流。</text>
        <text v-if="!detail.tasks.length">每日任务尚未开放。</text>
        <view v-for="task in detail.tasks" :key="task.id" class="task-row">
          <view class="task-heading"
            ><text>第 {{ task.day_index }} 天</text
            ><text class="muted">{{
              task.opened_at ? '本人已查看' : task.body ? '可查看' : '待解锁'
            }}</text></view
          >
          <text class="muted">解锁：{{ beijingTime(task.unlocks_at) }}</text>
          <button
            :disabled="locked || !task.body"
            :loading="isPageActionPending('matchmaking-open-task-' + task.id)"
            @click="runPageAction(() => openTask(task), 'matchmaking-open-task-' + task.id)"
          >
            {{ expandedTask === task.id ? '收起任务' : task.body ? '查看任务' : '尚未到解锁时间' }}
          </button>
          <view v-if="expandedTask === task.id && task.body" class="task-body"
            ><text class="category-pill">{{
              task.kind === 'online' ? '线上互动' : '线下互动'
            }}</text
            ><text class="preserve-text">{{ task.body }}</text></view
          >
        </view>
      </view>
      <view v-if="canExit" class="card exit-card"
        ><text class="section-title">退出本次活动</text
        ><text class="muted">退出会解除当前配对，并停止访问本次活动的聊天、对方资料和任务。</text
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
    <view v-if="pending" class="card"
      ><text>上次操作结果尚未确认，已保留原始请求。请原样重试核实结果。</text
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
  </AppPage>
</template>
<style scoped>
.card {
  display: grid;
  gap: 24rpx;
  margin-bottom: 24rpx;
}
.activity-summary {
  padding-top: 28rpx;
  border-top: 5rpx solid var(--theme-teal);
}
.summary-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
}
.activity-title {
  font-size: 42rpx;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.schedule-title {
  font-size: 27rpx;
  font-weight: 600;
  border-top: 1rpx solid var(--theme-line);
  padding-top: 20rpx;
}
.preserve-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.muted {
  font-size: 24rpx;
  line-height: 1.7;
  opacity: 0.75;
}
.schedule {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14rpx 22rpx;
  font-size: 24rpx;
  line-height: 1.6;
}
.schedule text:nth-child(even) {
  text-align: right;
}
.score {
  display: flex;
  align-items: baseline;
  gap: 18rpx;
  color: var(--theme-teal);
}
.score text:first-child {
  font-size: 64rpx;
  font-weight: 700;
}
.task-row {
  border: 1rpx solid var(--theme-line);
  border-radius: 22rpx;
  padding: 22rpx;
  display: grid;
  gap: 16rpx;
}
.task-heading {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
}
.task-body {
  display: grid;
  gap: 18rpx;
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
.chat-link {
  color: var(--theme-teal);
  font-weight: 700;
  padding: 16rpx 0;
}
.exit-card input {
  border: 1rpx solid var(--theme-line);
  border-radius: 16rpx;
  padding: 22rpx;
}
</style>
