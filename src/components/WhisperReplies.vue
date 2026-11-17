<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import CommentThread from '@/components/CommentThread.vue'
import CommentActionBar from '@/components/CommentActionBar.vue'
import CommentReplies from '@/components/CommentReplies.vue'
import WhisperCommentEditor from '@/components/WhisperCommentEditor.vue'
import type { useWhisperCommentEditor } from '@/composables/use-whisper-comment-editor'
import { callWhisper } from '@/api/whispers'
import type { PublicComment, PublicPost } from '@/types/whispers'
import { session } from '@/utils/session'
const props = defineProps<{
  post: PublicPost
  root: PublicComment
  reportUrl?: string
  canBlock?: boolean
  blockDisabled?: boolean
  blockLoading?: boolean
  editor?: ReturnType<typeof useWhisperCommentEditor>
}>()
const emit = defineEmits<{ reply: [rootId: string, replyId: string]; block: [] }>()
const items = ref<PublicComment[]>([])
const cursor = ref<string | null>(null)
const loaded = ref(false)
const repliesExpanded = ref(false)
const busy = ref(false)
const error = ref('')
let generation = 0
let visible = true
function clear() {
  generation++
  items.value = []
  cursor.value = null
  loaded.value = false
  repliesExpanded.value = false
  busy.value = false
  error.value = ''
}
watch(
  () => [props.root.id, props.post.content_version, props.post.comments_epoch, session.getEpoch()],
  clear,
  { flush: 'sync' },
)
onUnmounted(clear)
onUnmounted(() => {
  if (props.editor?.anchor.value.startsWith(props.root.id + ':')) props.editor.setAnchor('')
})
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
function editingReply(id: string) {
  return (
    !!props.editor?.expanded.value &&
    props.editor.rootId.value === props.root.id &&
    props.editor.replyId.value === id
  )
}
function editorHere(id: string) {
  return editingReply(id) && props.editor?.anchor.value === `${props.root.id}:${id}`
}
watch(
  () => [
    props.editor?.expanded.value,
    props.editor?.rootId.value,
    props.editor?.replyId.value,
    props.editor?.anchor.value,
    ...items.value.map((item) => item.id),
  ],
  () => {
    const editor = props.editor
    if (!editor) return
    const target = editor.replyId.value
    if (
      editingReply(target) &&
      (target === props.root.id || items.value.some((item) => item.id === target))
    ) {
      const key = `${props.root.id}:${target}`
      if (editor.anchor.value !== key) editor.setAnchor(key)
    } else if (editor.anchor.value.startsWith(props.root.id + ':')) editor.setAnchor('')
  },
  { immediate: true },
)

watch(
  () => [props.editor?.expanded.value, props.editor?.rootId.value, props.editor?.replyId.value],
  async () => {
    const target = props.editor?.replyId.value
    if (!target || target === props.root.id || !editingReply(target)) return
    repliesExpanded.value = true
    const seen = new Set<string>()
    // 旧回复链接也展开至目标所在分页；请求仍经过原有代次与会话检查。
    while (
      visible &&
      editingReply(target) &&
      !busy.value &&
      !items.value.some((item) => item.id === target)
    ) {
      if (cursor.value && seen.has(cursor.value)) {
        error.value = '回复列表已变化，请重新读取。'
        break
      }
      if (cursor.value) seen.add(cursor.value)
      await load()
      if (error.value || !cursor.value) break
    }
  },
  { immediate: true },
)
async function toggleReplies() {
  repliesExpanded.value = !repliesExpanded.value
  if (!repliesExpanded.value) {
    // 收起楼内列表同时收起其中的输入框；文字与未知请求仍由原控制器保留。
    const editor = props.editor
    if (editor && editor.rootId.value === props.root.id && editor.replyId.value !== props.root.id)
      editor.close()
    return
  }
  if (!loaded.value && !busy.value) await load()
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
  <view class="whisper-replies">
    <CommentActionBar
      :can-reply="!!canReply(root)"
      :can-expand="!!(root.reply_count || loaded || error)"
      :expanded="repliesExpanded"
      :reply-count="root.reply_count || items.length"
      :report-url="reportUrl"
      :can-block="canBlock"
      :block-disabled="blockDisabled"
      :block-loading="blockLoading"
      @reply="emit('reply', root.id, root.id)"
      @toggle="toggleReplies"
      @block="emit('block')"
    />
    <WhisperCommentEditor v-if="editor && editorHere(root.id)" :editor="editor" />
    <CommentReplies
      :expanded="repliesExpanded"
      :loading="busy"
      :has-more="!!cursor"
      :retry="!!error"
      @more="load"
    >
      <CommentThread
        v-for="item in items"
        :key="item.id"
        nested
        :label="item.identity.label"
        :body="item.body"
        :author="item.identity.is_author"
        :reply-to="item.reply_to_label"
        :time="item.published_at"
        :tags="item.identity.tags"
        ><template #actions>
          <CommentActionBar
            :can-reply="!!canReply(item)"
            :report-url="
              item.allowed_actions.includes('whisperReportCreate')
                ? `/pages/whispers/report?kind=whisper_comment&id=${encodeURIComponent(item.id)}&postId=${encodeURIComponent(post.id)}`
                : undefined
            "
            @reply="emit('reply', root.id, item.id)"
          />
        </template>
        <WhisperCommentEditor v-if="editor && editorHere(item.id)" :editor="editor" />
      </CommentThread>
    </CommentReplies>
    <AppNotice :message="error" kind="error" />
  </view>
</template>
<style scoped>
.whisper-replies :deep(.inline-comment-editor) {
  margin-left: -84rpx;
}
.whisper-replies :deep(.comment-thread.nested .inline-comment-editor) {
  margin-left: -104rpx;
  margin-right: -20rpx;
}
.whisper-replies {
  margin-top: 4rpx;
}
</style>
