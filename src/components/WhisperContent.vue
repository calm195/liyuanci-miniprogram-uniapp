<script setup lang="ts">
import IdentityTags from '@/components/IdentityTags.vue'
import type { PublicPost, PublicComment } from '@/types/whispers'
defineProps<{ content: PublicPost | PublicComment; hideTitle?: boolean }>()
</script>
<template>
  <view>
    <text v-if="!hideTitle && 'title' in content" class="whisper-title">{{
      content.title || '未命名悄悄话'
    }}</text>
    <view class="whisper-identity"
      ><text>{{ content.identity.label }}</text
      ><text v-if="content.identity.is_author" class="author-tag">帖主</text></view
    >
    <IdentityTags :tags="content.identity.tags" />
    <text class="whitespace-pre-wrap break-words">{{ content.body }}</text>
    <text v-if="content.school_related" class="notice">{{ content.notice_text }}</text>
  </view>
</template>

<style scoped>
.whisper-title {
  display: block;
  font-size: 34rpx;
  line-height: 1.5;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.whisper-identity {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  color: var(--theme-muted);
}
.author-tag {
  padding: 4rpx 14rpx;
  color: var(--theme-teal);
  background: var(--theme-mint);
  border-radius: 12rpx;
}
</style>
