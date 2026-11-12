<script setup lang="ts">
import type { WishPublicContent } from '@/types/wish'
import { campuses, genders } from '@/types/wish'
defineProps<{
  content: WishPublicContent
  kind?: 'wish' | 'story'
  compact?: boolean
  readOnly?: boolean
}>()
</script>
<template>
  <view class="content">
    <text class="content-body" :class="{ 'content-preview': compact }">{{ content.body }}</text>
    <view v-if="content.school_related || content.notice_text" class="content-notices">
      <text v-if="content.school_related">未经证实</text>
      <text v-if="content.notice_text">{{ content.notice_text }}</text>
    </view>
    <view v-if="content.author" class="content-meta">
      <navigator
        v-if="!readOnly && content.author.id && content.author.profile_available !== false"
        class="content-author"
        :url="`/pages/public-profile/index?id=${encodeURIComponent(content.author.id)}`"
        >{{ content.author.nickname || '查看公开主页' }}</navigator
      >
      <text v-else-if="content.author.nickname">{{ content.author.nickname }}</text>
      <text v-if="content.author.identity_tags?.campus"
        >校区：{{
          campuses.find((item) => item.value === content.author?.identity_tags?.campus)?.label
        }}</text
      >
      <text v-if="content.author.identity_tags?.gender"
        >性别：{{
          genders.find((item) => item.value === content.author?.identity_tags?.gender)?.label
        }}</text
      >
      <text v-if="content.author.identity_tags?.grade"
        >年级：{{ content.author.identity_tags.grade }}</text
      >
    </view>
    <view v-if="kind && !readOnly" class="content-actions">
      <navigator
        class="moderation-link"
        :url="`/pages/report/index?kind=${kind}&id=${encodeURIComponent(content.id)}`"
        >举报此内容</navigator
      >
      <navigator
        v-if="content.author"
        class="moderation-link"
        :url="`/pages/blacklist/index?targetId=${encodeURIComponent(content.author.id)}&sourceId=${encodeURIComponent(content.id)}&sourceKind=${kind}`"
        >屏蔽发布者</navigator
      >
      <slot name="actions" />
    </view>
  </view>
</template>

<style scoped>
.content-body {
  display: block;
  color: var(--theme-ink);
  font-size: 28rpx;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.content-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}
.content-notices,
.content-meta,
.content-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8rpx 20rpx;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--theme-muted);
}
.content-author {
  color: var(--theme-teal);
  font-weight: 600;
}
</style>
