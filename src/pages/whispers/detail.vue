<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import WhisperPostEditor from '@/components/WhisperPostEditor.vue'
import { useWhisperPostEditor } from '@/composables/use-whisper-post-editor'
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { session } from '@/utils/session'
import { callWhisper } from '@/api/whispers'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { mergeWhisperPage, whisperStates } from '@/utils/whisper-content'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import type { OwnerPost, PublicPost, PublicComment } from '@/types/whispers'
const module = useWhispersStore()
const id = ref('')
const editing = ref(false)
const manage = ref(false)
const editor = useWhisperPostEditor()
const ownerPost = ref<OwnerPost | null>(null)
const post = ref<PublicPost | null>(null)
const comments = ref<PublicComment[]>([])
const cursor = ref<string | null>(null)
const commentsError = ref('')
const seen = new Set<string>()
function clear() {
  editing.value = false
  ownerPost.value = null
  clearPublic()
}
function clearPublic() {
  post.value = null
  comments.value = []
  cursor.value = null
  commentsError.value = ''
  seen.clear()
}
const page = useWhisperPage(clear)
const { busy, writing, error, notice, retryReady } = page
async function edit() {
  if ((!ownerPost.value && !post.value?.viewer_is_author) || editor.locked.value) return
  editor.id.value = id.value
  await editor.load()
  if (editor.record.value) {
    manage.value = true
    editing.value = true
    ownerPost.value = null
    clearPublic()
    error.value = ''
  } else error.value = editor.error.value
}
async function cancelEdit() {
  if (!editing.value || editor.locked.value) return
  editor.page.reset()
  editing.value = false
  await load()
}
async function load(more = false) {
  if (more && (!post.value || !cursor.value)) return
  const previous = more ? cursor.value! : undefined
  const context = post.value
  await page.read(async (active) => {
    if (!more) await module.refresh()
    if (!active()) return
    if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
    if (manage.value && !more) {
      if (!session.getToken()) throw new Error('请登录后查看自己的心事。')
      const result = await callWhisper('whisperOwnPostGet', { path: { post_id: id.value } })
      if (!active()) return
      if (result.id !== id.value) throw new Error('帖子目标不匹配，请重新打开。')
      ownerPost.value = result
      if (result.status !== 'published') {
        clearPublic()
        return
      }
    }
    const result = await callWhisper('whisperPostGet', { path: { post_id: id.value } })
    if (!active()) return
    if (result.id !== id.value) throw new Error('帖子目标不匹配，请重新打开。')
    if (
      more &&
      context &&
      (context.version !== result.version ||
        context.comments_epoch !== result.comments_epoch ||
        context.content_version !== result.content_version)
    )
      throw new Error('原帖上下文已变化，请刷新重新读取评论。')
    post.value = result
    try {
      const list = await callWhisper('whisperCommentsList', {
        path: { post_id: id.value },
        query: { limit: 20, ...(previous ? { cursor: previous } : {}) },
      })
      if (!active()) return
      if (
        list.items.some(
          (item) =>
            item.post_id !== result.id || item.parent_content_version !== result.content_version,
        )
      )
        throw new Error('评论与原帖正文版本不匹配，请刷新。')
      if (!more) seen.clear()
      const merged = mergeWhisperPage(more ? comments.value : [], list, previous, seen)
      comments.value = merged.items
      cursor.value = merged.cursor
      commentsError.value = ''
    } catch (failure) {
      if (!active()) return
      // 父帖失效或上下文冲突不能保留旧正文；其他评论错误只影响评论区。
      if (
        failure &&
        typeof failure === 'object' &&
        'statusCode' in failure &&
        [401, 403, 404, 409].includes(Number(failure.statusCode))
      )
        throw failure
      comments.value = []
      cursor.value = null
      commentsError.value = '评论暂不可读取，请刷新后重试。'
    }
  }, more)
}
async function hug(active: boolean) {
  const target = post.value
  if (
    !target ||
    target.viewer_is_author ||
    !target.my_hug ||
    !canWhisperAction('PublicPost', target, 'whisperHugSet')
  )
    return
  await page.write(
    'whisperHugSet',
    {
      path: { post_id: target.id },
      data: {
        active,
        expected_post_version: target.version,
        expected_hug_version: target.my_hug.version,
      },
      key: whisperKey(),
    },
    (result) => {
      if (result.post_id !== target.id || post.value?.id !== target.id)
        throw new Error('抱抱回执目标不匹配，请刷新。')
      // 总数和本人状态均采用权威回执，不用本地加减推算。
      post.value = { ...post.value, hug_count: result.hug_count, my_hug: result.my_hug }
      notice.value = result.my_hug.active ? '已送出抱抱。' : '已取消抱抱。'
    },
    () => load(),
  )
}
async function block(comment?: PublicComment) {
  if (comment && !comments.value.includes(comment)) return
  const target = comment ?? post.value
  if (
    !target ||
    target.viewer_is_author ||
    !canWhisperAction('Workspace', module.workspace, 'interactionBlockCreate')
  )
    return
  await page.write(
    'interactionBlockCreate',
    {
      data: {
        source: {
          kind: comment ? 'whisper_comment' : 'whisper_post',
          id: target.id,
          content_version: target.content_version,
        },
      },
      key: whisperKey(),
    },
    () => {
      clear()
      notice.value = '屏蔽请求已受理，可在个人设置管理屏蔽记录。'
    },
    () => load(),
  )
}
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
  manage.value = query?.manage === '1'
})
page.onRefresh(() => (editing.value ? editor.load(true) : load()))
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text v-if="editing || post || ownerPost" class="title">{{
      (editing ? editor.record.value?.title : (post?.title ?? ownerPost?.title)) || '未命名悄悄话'
    }}</text>
    <view v-if="editing" class="edit-section">
      <button
        :disabled="editor.locked.value"
        :loading="isPageActionPending('whisper-own-edit-cancel')"
        @click="runPageAction(cancelEdit, 'whisper-own-edit-cancel')"
      >
        取消编辑
      </button>
      <WhisperPostEditor :editor="editor" />
    </view>
    <view v-else-if="!post && ownerPost" class="card">
      <text>{{ whisperStates[ownerPost.status] }}</text>
      <text v-if="ownerPost.body" class="whitespace-pre-wrap">{{ ownerPost.body }}</text>
      <text v-if="ownerPost.review_result?.reason" class="notice">{{
        ownerPost.review_result.reason
      }}</text>
      <text v-if="ownerPost.review_result?.revision_suggestion" class="notice">{{
        ownerPost.review_result.revision_suggestion
      }}</text>
    </view>
    <view v-if="post && !editing" class="card"
      ><WhisperContent :content="post" hide-title /><text
        >暖评 {{ post.comment_count }} · 抱抱 {{ post.hug_count }}</text
      >
      <navigator
        v-if="post.comments_open && canWhisperAction('PublicPost', post, 'whisperCommentCreate')"
        :url="`/pages/whispers/comment-editor?postId=${encodeURIComponent(post.id)}`"
        >写暖评</navigator
      >
      <button
        v-if="
          !post.viewer_is_author &&
          post.my_hug &&
          canWhisperAction('PublicPost', post, 'whisperHugSet')
        "
        :disabled="busy || writing || retryReady"
        :loading="isPageActionPending('pages-whispers-detail-button-2')"
        @click="runPageAction(() => hug(!post!.my_hug!.active), 'pages-whispers-detail-button-2')"
      >
        {{ post.my_hug.active ? '取消抱抱' : '抱抱' }}
      </button>
      <view class="moderation-actions">
        <navigator
          v-if="
            !post.viewer_is_author && canWhisperAction('PublicPost', post, 'whisperReportCreate')
          "
          class="moderation-link"
          :url="`/pages/whispers/report?kind=whisper_post&id=${encodeURIComponent(post.id)}`"
          >举报</navigator
        >
        <button
          v-if="
            !post.viewer_is_author &&
            canWhisperAction('Workspace', module.workspace, 'interactionBlockCreate')
          "
          class="moderation-link"
          :disabled="busy || writing || retryReady"
          :loading="isPageActionPending('pages-whispers-detail-button-3')"
          @click="runPageAction(() => block(), 'pages-whispers-detail-button-3')"
        >
          屏蔽发布者
        </button>
      </view>
      <text v-if="!post.comments_open">评论已关闭，已公开合规评论仅供阅读。</text>
    </view>
    <button
      v-if="!editing && (ownerPost?.allowed_actions.length || post?.viewer_is_author)"
      :disabled="busy || writing || retryReady || editor.locked.value"
      :loading="isPageActionPending('whisper-own-edit')"
      @click="runPageAction(edit, 'whisper-own-edit')"
    >
      {{
        post?.viewer_is_author || ownerPost?.allowed_actions.includes('whisperPostUpdate')
          ? '编辑'
          : '管理帖子'
      }}
    </button>
    <view v-for="comment in editing ? [] : comments" :key="comment.id" class="card"
      ><WhisperContent :content="comment" /><view class="moderation-actions"
        ><navigator
          v-if="canWhisperAction('PublicComment', comment, 'whisperReportCreate')"
          class="moderation-link"
          :url="`/pages/whispers/report?kind=whisper_comment&id=${encodeURIComponent(comment.id)}&postId=${encodeURIComponent(comment.post_id)}`"
          >举报</navigator
        ><button
          v-if="
            !comment.viewer_is_author &&
            canWhisperAction('Workspace', module.workspace, 'interactionBlockCreate')
          "
          class="moderation-link"
          :disabled="busy || writing || retryReady"
          :loading="isPageActionPending('pages-whispers-detail-button-4' + ':' + comment.id)"
          @click="
            runPageAction(() => block(comment), 'pages-whispers-detail-button-4' + ':' + comment.id)
          "
        >
          屏蔽发布者
        </button></view
      ></view
    >
    <text v-if="!editing && post && !comments.length && !busy && !commentsError"
      >当前页暂无公开暖评。</text
    >
    <button
      v-if="cursor"
      :disabled="busy || writing || retryReady"
      :loading="isPageActionPending('pages-whispers-detail-button-5')"
      @click="runPageAction(() => load(true), 'pages-whispers-detail-button-5')"
    >
      加载下一页暖评</button
    ><text v-if="commentsError" class="error">{{ commentsError }}</text>
    <button
      v-if="retryReady"
      :disabled="writing"
      :loading="isPageActionPending('pages-whispers-detail-button-6')"
      @click="runPageAction(page.retry, 'pages-whispers-detail-button-6')"
    >
      使用原请求重试</button
    ><text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
<style scoped>
.moderation-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24rpx;
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--theme-line);
}
.edit-section {
  margin-top: 24rpx;
}
</style>
