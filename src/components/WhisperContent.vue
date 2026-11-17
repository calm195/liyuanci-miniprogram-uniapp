<script setup lang="ts">
import IdentityTags from '@/components/IdentityTags.vue'
import type { PublicPost, PublicComment } from '@/types/whispers'
defineProps<{ content: PublicPost | PublicComment; hideTitle?: boolean; preview?: boolean }>()
</script>
<template>
  <view class="whisper-content">
    <view class="whisper-identity"
      ><text class="ui-meta">{{ content.identity.label }}</text
      ><text v-if="content.identity.is_author" class="author-tag">帖主</text></view
    >
    <IdentityTags :tags="content.identity.tags" />
    <text v-if="!hideTitle && 'title' in content" class="ui-section-title">{{
      content.title || '未命名悄悄话'
    }}</text>
    <text class="ui-copy whisper-body" :class="{ 'whisper-preview-body': preview }">{{
      content.body
    }}</text>
    <text v-if="content.school_related" class="ui-state">{{ content.notice_text }}</text>
  </view>
</template>
<style scoped>
.whisper-content {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  min-width: 0;
}
.whisper-identity {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14rpx;
}
.author-tag {
  margin: 0;
  padding: 4rpx 14rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--theme-teal);
  background: var(--theme-mint);
  border-radius: 12rpx;
}
.whisper-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.whisper-preview-body {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
