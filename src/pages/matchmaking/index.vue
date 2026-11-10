<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import AppIcon from '@/components/AppIcon.vue'
import MatchmakingActivitySummary from '@/components/MatchmakingActivitySummary.vue'
import { listMatchmaking } from '@/api/matchmaking'
import { useMatchmakingPage } from '@/composables/use-matchmaking-page'
import { matchmakingPhaseLabel } from '@/utils/matchmaking'
import { beijingTime } from '@/utils/capsules'
import type { MatchmakingActivity } from '@/types/matchmaking'

const activities = ref<MatchmakingActivity[]>([])
const total = ref(0)
const currentPage = ref(1)
const page = useMatchmakingPage(() => {
  activities.value = []
  total.value = 0
  currentPage.value = 1
})
const { busy, error, notice, gate, user } = page
const more = computed(() => activities.value.length < total.value)
async function load(append = false) {
  const next = append ? currentPage.value + 1 : 1
  await page.read(async (active) => {
    const result = await listMatchmaking(next)
    if (!active()) return
    if (append && result.items.some((item) => activities.value.some((old) => old.id === item.id)))
      throw new Error('活动列表已变化，请下拉刷新后继续。')
    activities.value = append ? [...activities.value, ...result.items] : result.items
    total.value = result.total
    currentPage.value = next
    if (append && !result.items.length && more.value)
      throw new Error('活动列表已变化，请重新刷新。')
  })
}
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
    <view class="activity-hero">
      <view class="hero-icon"><AppIcon name="heart" :size="34" /></view>
      <text class="hero-title">遇见一位新朋友</text>
      <text class="hero-copy">用个人资料报名，和搭档一起完成每日小任务。</text>
    </view>
    <view v-if="gate" class="card"
      ><text>{{ gate }}</text
      ><navigator v-if="!user.isLoggedIn" url="/pages/login/index" class="small-link"
        >微信登录 ›</navigator
      ></view
    >
    <view v-else-if="!busy && !error && !activities.length" class="card empty-state"
      ><text>暂时没有可查看的活动</text><text>新的包分配活动发布后，会出现在这里。</text></view
    >
    <text v-if="busy" class="notice">正在读取活动…</text>
    <navigator
      v-for="activity in activities"
      :key="activity.id"
      :url="`/pages/matchmaking/detail?id=${activity.id}`"
      class="card activity-card"
    >
      <view class="activity-card-head">
        <text class="phase-pill" :class="{ 'phase-live': activity.phase === 'registration' }">
          {{ matchmakingPhaseLabel(activity.phase) }}
        </text>
        <text class="activity-meta">{{ activity.days }} 天互动</text>
      </view>
      <text class="section-title">{{ activity.title }}</text>
      <text class="description">{{ activity.description }}</text>
      <MatchmakingActivitySummary v-if="activity.summary" :summary="activity.summary" />
      <view class="activity-card-foot">
        <text class="activity-meta">
          {{ activity.phase === 'ended' ? '结束' : '报名截止' }} ·
          {{
            beijingTime(
              activity.phase === 'ended' ? activity.ends_at : activity.registration_closes_at,
            )
          }}
        </text>
        <text class="small-link">查看活动 ›</text>
      </view>
    </navigator>
    <button
      v-if="more"
      :disabled="busy"
      :loading="isPageActionPending('matchmaking-list-more')"
      @click="runPageAction(() => load(true), 'matchmaking-list-more')"
    >
      查看更多活动
    </button>
    <button
      v-if="error"
      :disabled="busy"
      :loading="isPageActionPending('matchmaking-list-refresh')"
      @click="runPageAction(() => load(), 'matchmaking-list-refresh')"
    >
      重新读取活动
    </button>
    <text class="page-footnote">匹配分数仅供参考，相处从尊重彼此开始。</text>
    <AppNotice :message="error" kind="error" /><AppNotice :message="notice" kind="info" />
  </AppPage>
</template>
<style scoped>
.activity-hero {
  display: grid;
  gap: 14rpx;
  margin: 12rpx 0 28rpx;
  padding: 30rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 32rpx;
  background: var(--theme-mint);
}
.hero-icon {
  display: grid;
  place-items: center;
  width: 76rpx;
  height: 76rpx;
  border-radius: 24rpx;
  color: var(--theme-teal);
  background: var(--theme-surface);
}
.hero-title {
  font-size: 44rpx;
  line-height: 1.2;
  font-weight: 700;
}
.hero-copy {
  font-size: 26rpx;
  line-height: 1.65;
  opacity: 0.8;
}
.activity-card {
  display: grid;
  gap: 16rpx;
  margin-bottom: 24rpx;
  color: var(--theme-ink);
}
.activity-card-head,
.activity-card-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.activity-card-foot {
  border-top: 1rpx solid var(--theme-line);
  padding-top: 16rpx;
}
.phase-pill {
  font-size: 23rpx;
  font-weight: 600;
  padding: 7rpx 16rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--theme-line);
}
.phase-live {
  color: var(--theme-teal);
  border-color: var(--theme-teal);
  background: var(--theme-mint);
}
.description {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.activity-meta {
  font-size: 24rpx;
  color: var(--theme-muted);
}
.empty-state {
  display: grid;
  gap: 20rpx;
}
</style>
