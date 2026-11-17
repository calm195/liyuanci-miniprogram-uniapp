<script setup lang="ts">
import { computed } from 'vue'
import MatchmakingProfile from '@/components/MatchmakingProfile.vue'
import { matchmakingResultState } from '@/utils/matchmaking'
import { beijingTime } from '@/utils/capsules'
import type { MatchmakingDetail } from '@/types/matchmaking'
const props = defineProps<{ detail: MatchmakingDetail; gradeLabel: string }>()
const state = computed(() => matchmakingResultState(props.detail))
const copy = computed(() => {
  switch (state.value) {
    case 'not_enrolled':
      return {
        label: '相遇的第一步',
        title: '把期待，交给这次相遇',
        description: '完善资料，认真写下你的期待，再确认报名。',
      }
    case 'pending_review':
      return {
        label: '资料审核中',
        title: '你的来信，我们收到了',
        description: '资料正在审核，请留意状态更新。你可以在下方查看本次报名。',
      }
    case 'waiting':
      return {
        label: '等待相遇',
        title: '把期待，留给相遇',
        description: '你已报名成功，结果公布后会在这里告诉你。',
      }
    case 'paired':
      return {
        label: '已配对',
        title: '这封来信，有了回音',
        description: props.detail.pair?.accessible
          ? '慢慢认识彼此，从一句问候开始。'
          : '相遇已经安排好，资料与任务将按活动时间和当前资格开放。',
      }
    case 'unmatched':
      return {
        label: '本次未配对',
        title: '这次，把缘分留给下一次',
        description: '本次结果已公布，暂时没有合适的配对。',
      }
    default:
      return {
        label: '这段旅程已结束',
        title: '谢谢你，认真参与这次相遇',
        description: '活动或配对已结束，愿这段经历留下温柔的回忆。',
      }
  }
})
const showPeer = computed(
  () => state.value === 'paired' && props.detail.pair?.accessible && !!props.detail.pair.peer,
)
</script>
<template>
  <view class="result-experience" :class="`result-${state}`" :data-result-state="state">
    <view class="result-introduction"
      ><text class="content-text result-label">{{ detail.activity.title }}</text
      ><text class="content-text result-title">{{ copy.title }}</text
      ><text class="content-text result-description">{{ copy.description }}</text></view
    >
    <view v-if="showPeer && detail.pair?.peer" class="peer-card">
      <MatchmakingProfile
        :profile="detail.pair.peer"
        :grade-label="gradeLabel"
        compact
        :status="copy.label"
      />
      <text class="content-text score-label"
        >推荐分 {{ detail.pair.score }} · 按当前规则评分，不表示匹配概率</text
      >
      <navigator
        v-if="detail.pair.conversation_id"
        :url="`/pages/chat/index?id=${detail.pair.conversation_id}`"
        class="result-chat"
        >和 TA 聊聊</navigator
      >
      <view class="pair-timeline"
        ><view
          ><text class="content-text">相遇开始</text
          ><text class="content-text">{{ beijingTime(detail.activity.starts_at) }}</text></view
        ><view
          ><text class="content-text">相伴 {{ detail.activity.days }} 天</text
          ><text class="content-text">{{ beijingTime(detail.activity.ends_at) }} 结束</text></view
        ></view
      >
      <text class="content-text peer-note">请尊重彼此，不向他人转发对方的个人资料。</text>
    </view>
    <view v-else-if="state === 'waiting'" class="peer-card"
      ><text class="content-text section-title">安心等待，好好生活</text
      ><text class="content-text peer-note">公布时间仅供参考，以实际发布结果为准。</text
      ><view class="waiting-time"
        ><text class="content-text">最早公布时间</text
        ><text class="content-text">{{ beijingTime(detail.activity.results_at) }}</text></view
      ></view
    >
    <view v-else-if="state === 'unmatched' || state === 'ended'" class="peer-card"
      ><text class="content-text section-title">{{
        state === 'unmatched' ? '下一次，继续期待' : '这段旅程已结束'
      }}</text
      ><text class="content-text peer-note">{{
        state === 'unmatched'
          ? '可以更新你的资料，或看看下一场活动。'
          : '已结束的配对不再展示对方资料、聊天入口与任务。'
      }}</text
      ><navigator v-if="state === 'unmatched'" url="/pages/matchmaking/profile" class="result-chat"
        >完善资料</navigator
      ><navigator
        url="/pages/matchmaking/index"
        :class="state === 'ended' ? 'result-chat' : 'result-link'"
        >查看其他活动 ›</navigator
      ></view
    >
    <navigator
      v-if="!showPeer && state === 'paired' && detail.pair?.conversation_id"
      :url="`/pages/chat/index?id=${detail.pair.conversation_id}`"
      class="result-chat"
      >和 TA 聊聊</navigator
    >
  </view>
</template>
<style scoped>
.content-text {
  margin: 0;
}
.result-experience {
  margin-bottom: 24rpx;
}
.result-introduction {
  position: relative;
  overflow: hidden;
  padding: 48rpx 40rpx;
  margin-bottom: 24rpx;
  border-radius: 32rpx;
  background: var(--match-soft);
  color: var(--match-ink);
}
.result-introduction::after {
  content: '';
  position: absolute;
  top: -20rpx;
  right: -24rpx;
  width: 144rpx;
  height: 96rpx;
  border: 2rpx solid var(--match-accent);
  border-radius: 10rpx;
  transform: rotate(-20deg);
  opacity: 0.18;
}
.result-label {
  display: block;
  margin-bottom: 12rpx;
  color: var(--match-accent);
  font-size: 24rpx;
  letter-spacing: 4rpx;
  line-height: 1.6;
}
.result-title {
  display: block;
  margin-bottom: 16rpx;
  color: var(--match-ink);
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.35;
}
.result-description {
  display: block;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.waiting-time {
  display: grid;
  gap: 8rpx;
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--theme-line);
  font-size: 26rpx;
}
.waiting-time > text:first-child {
  color: var(--theme-muted);
  font-size: 24rpx;
}
.result-link {
  margin-top: 24rpx;
  padding: 12rpx 0;
  color: var(--match-accent);
  font-size: 26rpx;
}
.peer-card {
  padding: 32rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 32rpx;
  background: var(--theme-surface);
}
.peer-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 24rpx;
  color: var(--match-accent);
  font-size: 24rpx;
}
.score-label {
  display: block;
  margin: 32rpx 0 24rpx;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.score-number {
  font-size: 36rpx;
  font-weight: 700;
}
.peer-note {
  display: block;
  margin-top: 24rpx;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.result-chat {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  margin: 24rpx 0 0;
  padding: 20rpx 36rpx;
  border-radius: 24rpx;
  background: var(--match-accent);
  color: var(--match-on-accent);
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.6;
}
.pair-timeline {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 24rpx;
  padding: 24rpx 0 0;
  border-top: 1rpx solid var(--theme-line);
  font-size: 24rpx;
}
.pair-timeline > view {
  display: grid;
  gap: 0;
}
.pair-timeline > view:last-child {
  text-align: right;
}
.pair-timeline > view > text:last-child {
  color: var(--theme-muted);
  font-size: 24rpx;
}
</style>
