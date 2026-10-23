<script setup lang="ts">
import type { WishPublicContent } from '@/types/wish'
import { campuses, genders } from '@/types/wish'
defineProps<{ content: WishPublicContent; kind?: 'wish' | 'story' }>()
</script>
<template>
  <view class="content">
    <text class="body">{{ content.body }}</text>
    <text v-if="content.school_related">未经证实</text>
    <text v-if="content.notice_text">{{ content.notice_text }}</text>
    <navigator
      v-if="kind"
      :url="`/pages/report/index?kind=${kind}&id=${encodeURIComponent(content.id)}`"
      >举报此内容</navigator
    >
    <template v-if="content.author">
      <navigator :url="`/pages/public-profile/index?id=${encodeURIComponent(content.author.id)}`">{{
        content.author.nickname || '查看公开主页'
      }}</navigator>
      <navigator
        v-if="kind"
        :url="`/pages/settings/index?targetId=${encodeURIComponent(content.author.id)}&sourceId=${encodeURIComponent(content.id)}&sourceKind=${kind}`"
        >拉黑与隐私设置</navigator
      >
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
    </template>
  </view>
</template>
<style scoped>
text {
  display: block;
  margin-bottom: 20rpx;
}
.body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
