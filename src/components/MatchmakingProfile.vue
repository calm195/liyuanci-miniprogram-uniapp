<script setup lang="ts">
import type { MatchmakingProfile } from '@/types/matchmaking'
import { campuses, genders } from '@/types/wish'
const props = defineProps<{
  profile: MatchmakingProfile
  gradeLabel: string
  own?: boolean
  compact?: boolean
  status?: string
}>()
function preferredCampusLabel() {
  return props.profile.preferred_campuses?.length
    ? props.profile.preferred_campuses
        .map((code) => campuses.find((item) => item.value === code)?.label || code)
        .join('、')
    : '不限校区'
}
</script>
<template>
  <view class="match-profile" :class="{ compact }">
    <view v-if="compact" class="profile-identity"
      ><view class="profile-letter">{{ profile.name.slice(0, 1) }}</view
      ><view
        ><text class="content-text profile-name">{{ profile.name }}</text
        ><text class="content-text profile-caption"
          >{{ profile.age }} 岁 · {{ profile.height }} cm · {{ profile.weight }} 斤<text
            v-if="profile.mbti"
            class="content-text"
          >
            · {{ profile.mbti }}</text
          ></text
        ></view
      ><text v-if="status" class="content-text profile-status">{{ status }}</text></view
    >
    <template v-else>
      <text class="content-text profile-name">{{ profile.name }}</text>
      <text class="content-text"
        >{{ genders.find((item) => item.value === profile.gender)?.label }} ·
        {{ campuses.find((item) => item.value === profile.campus)?.label }} ·
        {{ profile.grade_label || gradeLabel }}</text
      >
    </template>
    <text v-if="compact" class="content-text profile-note"
      >{{ campuses.find((item) => item.value === profile.campus)?.label }} ·
      {{ profile.grade_label || gradeLabel }}</text
    >
    <view v-if="!compact" class="profile-facts">
      <text class="content-text">{{ profile.age }} 岁</text
      ><text class="content-text">{{ profile.height }} cm</text
      ><text class="content-text">{{ profile.weight }} 斤</text
      ><text v-if="profile.mbti" class="content-text">{{ profile.mbti }}</text>
    </view>
    <view v-if="profile.personal_traits?.length" class="profile-facts">
      <text v-if="!compact" class="content-text">个人特质</text
      ><text v-for="trait in profile.personal_traits" :key="trait" class="content-text">{{
        trait
      }}</text>
    </view>
    <view v-if="profile.ideal_traits?.length" class="profile-facts">
      <text class="content-text profile-fact-label">理想型特质</text
      ><text v-for="trait in profile.ideal_traits" :key="trait" class="content-text">{{
        trait
      }}</text>
    </view>
    <text v-if="own" class="content-text profile-note"
      >期望校区：{{ preferredCampusLabel() }}；期望 MBTI：{{
        profile.preferred_mbti?.length ? profile.preferred_mbti.join('、') : '不限'
      }}。</text
    >
    <text class="content-text profile-introduction">{{ profile.introduction }}</text>
    <text v-if="profile.wechat" class="content-text" user-select>微信号：{{ profile.wechat }}</text>
    <text v-if="own" class="content-text profile-note"
      >期待年龄 {{ profile.age_min }}–{{ profile.age_max }} 岁，身高 {{ profile.height_min }}–{{
        profile.height_max
      }}
      cm，体重 {{ profile.weight_min }}–{{ profile.weight_max }} 斤。</text
    >
  </view>
</template>
<style scoped>
.content-text {
  margin: 0;
}
.profile-identity {
  display: flex;
  gap: 24rpx;
  align-items: center;
}
.profile-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  color: var(--match-accent);
  background: var(--match-soft);
  font-size: 36rpx;
}
.profile-caption {
  display: block;
  color: var(--theme-muted);
  font-size: 24rpx;
}
.profile-caption text {
  display: inline;
}
.profile-status {
  margin-left: auto;
  flex-shrink: 0;
  padding: 6rpx 16rpx;
  border-radius: 12rpx;
  color: var(--match-accent);
  background: var(--match-soft);
  font-size: 22rpx;
}
.compact .profile-name {
  font-size: 32rpx;
  line-height: 1.5;
}
.compact .profile-facts {
  gap: 12rpx;
}
.compact .profile-facts text {
  padding: 12rpx 24rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 40rpx;
  font-size: 24rpx;
}
.compact .profile-introduction {
  margin-top: 24rpx;
  padding: 28rpx 0;
  border-top: 1rpx solid var(--theme-line);
  font-size: 28rpx;
}
.compact.match-profile {
  display: block;
  line-height: 1.6;
}
.compact .profile-note {
  display: block;
  margin-top: 24rpx;
}
.compact .profile-facts {
  margin: 20rpx 0;
}
.compact .profile-facts .profile-fact-label {
  align-self: center;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--theme-muted);
}
.profile-caption {
  line-height: 1.6;
}
.match-profile {
  display: grid;
  gap: 18rpx;
  line-height: 1.7;
}
.profile-name {
  font-size: 36rpx;
  font-weight: 700;
}
.profile-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.profile-facts text {
  background: var(--theme-surface);
  padding: 8rpx 18rpx;
  border-radius: 18rpx;
}
.profile-introduction {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.profile-note {
  font-size: 24rpx;
  opacity: 0.75;
}
</style>
