<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import ContentStats from '@/components/ContentStats.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import WhisperHugButton from '@/components/WhisperHugButton.vue'
import type { PublicPost } from '@/types/whispers'

const props = defineProps<{
  post: PublicPost
  disabled?: boolean
  hug: (id: string) => Promise<void>
}>()
const url = computed(() => `/pages/whispers/detail?id=${encodeURIComponent(props.post.id)}`)
</script>
<template>
  <view class="whisper-feed-card">
    <navigator class="whisper-content-link" hover-class="tap-feedback" :url="url">
      <WhisperContent :content="post" preview feed />
    </navigator>
    <view class="whisper-feed-actions">
      <WhisperHugButton :post="post" :disabled="disabled" :toggle="hug" />
      <navigator class="whisper-feed-action" :url="url">
        <AppIcon name="chat" :size="28" />
        <text>暖评 {{ post.comment_count }}</text>
      </navigator>
      <ContentStats v-if="post.view_count !== undefined" :views="post.view_count" />
      <button class="whisper-feed-action whisper-share" open-type="share" :data-post-id="post.id">
        <AppIcon name="send" :size="28" />
        <text>分享</text>
      </button>
    </view>
  </view>
</template>
<style scoped>
.whisper-feed-card {
  min-width: 0;
  padding: 28rpx;
  border: 1px solid var(--theme-line);
  border-radius: 34rpx;
  background: var(--theme-surface);
}
.whisper-feed-card .whisper-content-link {
  display: block;
  margin: 0;
  color: var(--theme-ink);
}
.whisper-feed-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 16rpx;
  margin-top: 18rpx;
  padding-top: 6rpx;
  border-top: 1px solid var(--theme-line);
}
.whisper-feed-actions .whisper-feed-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  min-width: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.45;
  white-space: nowrap;
}
.whisper-feed-action text {
  margin: 0;
}
.whisper-feed-actions .whisper-share {
  margin-left: auto;
  color: var(--theme-teal);
  font-weight: 650;
}
.whisper-share::after {
  border: 0;
}
</style>
