<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import { ref, computed, watch } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import MatchmakingActivitySummary from '@/components/MatchmakingActivitySummary.vue'
import { listMatchmaking, listPublicMatchmaking } from '@/api/matchmaking'
import { useMatchmakingPage } from '@/composables/use-matchmaking-page'
import { matchmakingPhaseLabel } from '@/utils/matchmaking'
import { beijingTime } from '@/utils/capsules'
import { session } from '@/utils/session'
import type { MatchmakingActivity } from '@/types/matchmaking'

const activities = ref<MatchmakingActivity[]>([])
const total = ref(0)
const currentPage = ref(1)
const page = useMatchmakingPage(
  () => {
    activities.value = []
    total.value = 0
    currentPage.value = 1
  },
  { allowGuest: true },
)
const { busy, error, notice, gate } = page
const more = computed(() => activities.value.length < total.value)
async function load(append = false) {
  const next = append ? currentPage.value + 1 : 1
  await page.read(async (active, guest) => {
    const result = await (guest ? listPublicMatchmaking(next) : listMatchmaking(next))
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
useLoginRefresh(() => load())
watch(
  () => session.getEpoch(),
  () => {
    if (!session.getToken()) void load()
  },
)
</script>
<template>
  <AppPage responsive-padding>
    <view class="activity-letter">
      <PageHeading
        kicker="包分配 · 认真认识一个人"
        title="包分配"
        illustration="entry-buddy"
        description="用完整的资料介绍自己，和新朋友一起完成每日小任务。"
      >
        <navigator class="ui-link" url="/pages/matchmaking/profile">我的配对资料 ›</navigator>
      </PageHeading>
    </view>
    <view v-if="gate" class="ui-state"
      ><text>{{ gate }}</text></view
    >
    <view v-else-if="!busy && !error && !activities.length" class="ui-state"
      ><text class="ui-section-title">暂时没有可查看的活动</text
      ><text class="ui-meta">新的包分配活动发布后，会出现在这里。</text></view
    >
    <text v-if="busy" class="notice">正在读取活动…</text>
    <navigator
      v-for="activity in activities"
      :key="activity.id"
      :url="`/pages/matchmaking/detail?id=${activity.id}`"
      class="ui-section activity-card"
    >
      <view class="activity-card-head">
        <text class="phase-pill" :class="{ 'phase-live': activity.phase === 'registration' }">
          {{ matchmakingPhaseLabel(activity.phase) }}
        </text>
        <text class="ui-meta">{{ activity.days }} 天互动</text>
      </view>
      <text class="ui-section-title">{{ activity.title }}</text>
      <text class="ui-copy activity-description">{{ activity.description }}</text>
      <MatchmakingActivitySummary v-if="activity.summary" :summary="activity.summary" compact />
      <view class="activity-card-foot">
        <text class="ui-meta">
          {{ activity.phase === 'ended' ? '结束' : '报名截止' }} ·
          {{
            beijingTime(
              activity.phase === 'ended' ? activity.ends_at : activity.registration_closes_at,
            )
          }}
        </text>
        <text class="ui-link">查看活动 ›</text>
      </view>
    </navigator>
    <button
      v-if="more"
      class="ui-button"
      :disabled="busy"
      :loading="isPageActionPending('matchmaking-list-more')"
      @click="runPageAction(() => load(true), 'matchmaking-list-more')"
    >
      查看更多活动
    </button>
    <button
      v-if="error"
      class="ui-button"
      :disabled="busy"
      :loading="isPageActionPending('matchmaking-list-refresh')"
      @click="runPageAction(() => load(), 'matchmaking-list-refresh')"
    >
      重新读取活动
    </button>
    <text class="ui-meta">匹配分数仅供参考，相处从尊重彼此开始。</text>
    <AppNotice :message="error" kind="error" /><AppNotice :message="notice" kind="info" />
  </AppPage>
</template>
<style scoped>
.activity-letter {
  padding: 32rpx;
  border-radius: 32rpx;
  background: var(--theme-peach);
  margin-bottom: 24rpx;
}
.activity-card-head,
.activity-card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.activity-card-head {
  margin-bottom: 16rpx;
}
.activity-card-foot {
  margin-top: 24rpx;
  border-top: 1rpx solid var(--theme-line);
  padding-top: 16rpx;
}
.activity-description {
  margin-top: 12rpx;
  color: var(--theme-muted);
}
.phase-pill {
  display: block;
  margin: 0;
  padding: 6rpx 16rpx;
  border-radius: 12rpx;
  background: var(--theme-canvas);
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.phase-live {
  background: var(--theme-mint);
  color: var(--theme-teal);
}
</style>
