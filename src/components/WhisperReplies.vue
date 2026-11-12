<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import CommentThread from '@/components/CommentThread.vue'
import { callWhisper } from '@/api/whispers'
import type { PublicComment, PublicPost } from '@/types/whispers'
import { session } from '@/utils/session'
const props = defineProps<{ post: PublicPost; root: PublicComment }>()
const items = ref<PublicComment[]>([])
const cursor = ref<string | null>(null)
const loaded = ref(false)
const busy = ref(false)
const error = ref('')
let generation = 0
let visible = true
function clear() {
  generation++
  items.value = []
  cursor.value = null
  loaded.value = false
  busy.value = false
  error.value = ''
}
watch(
  () => [props.root.id, props.post.content_version, props.post.comments_epoch, session.getEpoch()],
  clear,
  { flush: 'sync' },
)
onUnmounted(clear)
onHide(() => {
  visible = false
  clear()
})
onShow(() => {
  visible = true
})
function canReply(item: PublicComment) {
  return (
    props.post.comments_open &&
    item.body &&
    !(item.body === '该评论已删除' && item.identity.label === '已删除')
  )
}
function replyUrl(item: PublicComment) {
  return `/pages/whispers/comment-editor?postId=${encodeURIComponent(props.post.id)}&rootId=${encodeURIComponent(props.root.id)}&replyId=${encodeURIComponent(item.id)}`
}
async function load() {
  if (!visible || busy.value || (loaded.value && !cursor.value)) return
  const current = generation
  const epoch = session.getEpoch()
  const previous = cursor.value
  busy.value = true
  try {
    const result = await callWhisper('whisperCommentsList', {
      path: { post_id: props.post.id },
      query: { root_comment_id: props.root.id, ...(cursor.value ? { cursor: cursor.value } : {}) },
    })
    if (!visible || current !== generation || epoch !== session.getEpoch()) return
    if (
      result.items.some(
        (item) =>
          item.post_id !== props.post.id ||
          item.parent_content_version !== props.post.content_version ||
          item.root_comment_id !== props.root.id,
      ) ||
      (previous && result.next_cursor === previous)
    )
      throw new Error('回复上下文已变化')
    items.value = [
      ...items.value,
      ...result.items.filter((item) => !items.value.some((old) => old.id === item.id)),
    ]
    cursor.value = result.next_cursor
    loaded.value = true
    error.value = ''
  } catch {
    if (current === generation) error.value = '楼内回复暂不可读取，请重试。'
  } finally {
    if (current === generation) busy.value = false
  }
}
</script>
<template>
  <view class="whisper-replies"
    ><navigator v-if="canReply(root)" :url="replyUrl(root)" class="reply-link">回复</navigator
    ><button v-if="!loaded && root.reply_count" :disabled="busy" @click="load">
      展开 {{ root.reply_count }} 条回复</button
    ><CommentThread
      v-for="item in items"
      :key="item.id"
      nested
      :label="item.identity.label"
      :body="item.body"
      :author="item.identity.is_author"
      :reply-to="item.reply_to_label"
      :time="item.published_at"
      ><template #actions
        ><navigator v-if="canReply(item)" :url="replyUrl(item)" class="reply-link">回复</navigator
        ><navigator
          v-if="item.allowed_actions.includes('whisperReportCreate')"
          :url="`/pages/whispers/report?kind=whisper_comment&id=${encodeURIComponent(item.id)}&postId=${encodeURIComponent(post.id)}`"
          class="reply-link"
          >举报</navigator
        ></template
      ></CommentThread
    ><button v-if="cursor || error" :disabled="busy" @click="load">
      {{ error ? '重试读取' : '更多回复' }}</button
    ><AppNotice :message="error" kind="error"
  /></view>
</template>
<style scoped>
.whisper-replies {
  margin-top: 16rpx;
}
.reply-link {
  color: var(--theme-teal);
  font-size: 24rpx;
}
.whisper-replies button {
  font-size: 24rpx;
  padding: 8rpx 20rpx;
  min-height: 56rpx;
  background: var(--theme-bg);
  color: var(--theme-teal);
}
</style>
