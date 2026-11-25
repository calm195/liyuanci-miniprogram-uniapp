<script setup lang="ts">
import IdentityTags from '@/components/IdentityTags.vue'
import type { OwnerPost, PublicPost } from '@/types/whispers'
defineProps<{ content: PublicPost | OwnerPost; preview?: boolean; feed?: boolean }>()
</script>
<template>
  <view class="whisper-content">
    <template v-if="preview && feed">
      <text class="whisper-post-title feed-title">{{ content.title || '未命名悄悄话' }}</text>
      <text v-if="!('identity' in content) || content.viewer_is_author" class="whisper-byline">
        帖主
      </text>
      <IdentityTags v-else :tags="content.identity.tags" byline />
    </template>
    <view v-else-if="preview" class="preview-heading">
      <text class="whisper-post-title">{{ content.title || '未命名悄悄话' }}</text>
      <text v-if="!('identity' in content) || content.viewer_is_author" class="author-tag"
        >帖主</text
      >
      <IdentityTags v-else :tags="content.identity.tags" compact />
    </view>
    <template v-else>
      <text class="whisper-post-title detail-title" role="heading">{{
        content.title || '未命名悄悄话'
      }}</text>
      <text v-if="'identity' in content" class="whisper-byline">{{ content.identity.label }}</text>
    </template>
    <text v-if="content.body" class="whisper-body" :class="{ 'whisper-preview-body': preview }">{{
      content.body
    }}</text>
    <text v-if="'school_related' in content && content.school_related" class="ui-state">{{
      content.notice_text
    }}</text>
  </view>
</template>
<style scoped>
.whisper-content {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  min-width: 0;
}
.preview-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12rpx;
}
.whisper-post-title {
  display: block;
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  color: var(--theme-ink);
  font-size: 34rpx;
  line-height: 1.45;
  font-weight: 680;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.feed-title,
.detail-title {
  flex: none;
}
.detail-title {
  font-size: 46rpx;
  font-weight: 700;
}
.whisper-byline {
  margin: 0;
  color: var(--theme-muted);
  font-size: 24rpx;
}
.preview-heading .author-tag {
  flex-shrink: 0;
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
  margin: 0;
  color: var(--theme-ink);
  font-size: 30rpx;
  line-height: 1.68;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.whisper-preview-body {
  color: var(--theme-muted);
  font-size: 28rpx;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
