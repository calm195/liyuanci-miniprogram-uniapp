<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { PublicPost } from '@/types/whispers'
import { session } from '@/utils/session'
import { canWhisperAction } from '@/utils/whispers'

const props = defineProps<{
  post: PublicPost
  disabled?: boolean
  toggle: (id: string) => Promise<void>
}>()
const active = computed(() => props.post.my_hug?.active === true)
const actionable = computed(() => {
  // 读取会话代次使登录完成后的读权限和写权限一起更新。
  session.getEpoch()
  return (
    !props.post.viewer_is_author &&
    (!session.getToken() ||
      (!!props.post.my_hug && canWhisperAction('PublicPost', props.post, 'whisperHugSet')))
  )
})
</script>
<template>
  <button
    v-if="actionable"
    class="whisper-hug"
    :class="{ active }"
    :aria-label="active ? '取消抱抱' : '抱抱'"
    :aria-pressed="active"
    :disabled="disabled"
    :loading="isPageActionPending('whisper-hug:' + post.id)"
    @click.stop="runPageAction(() => toggle(post.id), 'whisper-hug:' + post.id)"
  >
    <AppIcon name="heart" :active="active" :size="30" />
    <text>抱抱 {{ post.hug_count }}</text>
  </button>
  <view v-else class="whisper-hug">
    <AppIcon name="heart" :size="30" />
    <text>抱抱 {{ post.hug_count }}</text>
  </view>
</template>
<style scoped>
.whisper-hug {
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
button.whisper-hug::after {
  border: 0;
}
.whisper-hug.active {
  color: var(--theme-teal);
  font-weight: 650;
}
.whisper-hug text {
  margin: 0;
}
</style>
