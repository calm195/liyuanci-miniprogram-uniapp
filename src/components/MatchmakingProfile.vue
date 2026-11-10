<script setup lang="ts">
import type { MatchmakingProfile } from '@/types/matchmaking'
import { campuses, genders } from '@/types/wish'
defineProps<{ profile: MatchmakingProfile; gradeLabel: string; own?: boolean }>()
</script>
<template>
  <view class="match-profile">
    <text class="profile-name">{{ profile.name }}</text>
    <text
      >{{ genders.find((item) => item.value === profile.gender)?.label }} ·
      {{ campuses.find((item) => item.value === profile.campus)?.label }} · {{ gradeLabel }}</text
    >
    <view class="profile-facts">
      <text>{{ profile.age }} 岁</text><text>{{ profile.height }} cm</text
      ><text>{{ profile.weight }} 斤</text><text v-if="profile.mbti">{{ profile.mbti }}</text>
    </view>
    <text class="profile-introduction">{{ profile.introduction }}</text>
    <text v-if="profile.wechat" user-select>微信号：{{ profile.wechat }}</text>
    <text v-if="own" class="profile-note"
      >期待年龄 {{ profile.age_min }}–{{ profile.age_max }} 岁，身高 {{ profile.height_min }}–{{
        profile.height_max
      }}
      cm，体重 {{ profile.weight_min }}–{{ profile.weight_max }} 斤。</text
    >
  </view>
</template>
<style scoped>
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
