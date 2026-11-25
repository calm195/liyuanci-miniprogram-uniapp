<script setup lang="ts">
import { useLogin, useLoginRefresh } from '@/composables/use-login'
import { useWhisperCommentEditor } from '@/composables/use-whisper-comment-editor'
import WhisperCommentPanel from '@/components/WhisperCommentPanel.vue'
import WhisperHugButton from '@/components/WhisperHugButton.vue'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import AppIcon from '@/components/AppIcon.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import FavoriteButton from '@/components/FavoriteButton.vue'
import { useContentView } from '@/composables/use-content-view'
import WhisperPostEditor from '@/components/WhisperPostEditor.vue'
import { useWhisperPostEditor } from '@/composables/use-whisper-post-editor'
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { session } from '@/utils/session'
import { callWhisper } from '@/api/whispers'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { useWhisperHug } from '@/composables/use-whisper-hug'
import { mergeWhisperPage, whisperStates } from '@/utils/whisper-content'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import type { OwnerPost, PublicPost, PublicComment } from '@/types/whispers'
const { requestLogin } = useLogin()
const commentEditor = useWhisperCommentEditor()
let pendingComment: { id?: string; rootId?: string; replyId?: string } | null = null
const module = useWhispersStore()
const recordView = useContentView('whisper_post')
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
const hugCelebrating = ref(false)
const hugSparks = [
  { x: -100, y: -138, angle: -34, size: 42 },
  { x: 8, y: -172, angle: 6, size: 52 },
  { x: 116, y: -119, angle: 31, size: 36 },
  { x: 154, y: -14, angle: 50, size: 44 },
  { x: 88, y: 85, angle: 24, size: 32 },
  { x: -65, y: 106, angle: -24, size: 34 },
  { x: -151, y: -22, angle: -52, size: 44 },
]
let hugTimer: ReturnType<typeof globalThis.setTimeout> | undefined
function stopHugCelebration() {
  if (hugTimer !== undefined) globalThis.clearTimeout(hugTimer)
  hugTimer = undefined
  hugCelebrating.value = false
}
function clear() {
  stopHugCelebration()
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
const page = useWhisperPage(clear, () => {
  if (!manage.value) void load()
})
const { busy, writing, error, notice, retryReady, readStatus } = page
const actionsLocked = computed(() => busy.value || writing.value || retryReady.value)
const unavailable = computed(() => readStatus.value === 403 || readStatus.value === 404)
const canBlock = computed(() =>
  canWhisperAction('Workspace', module.workspace, 'interactionBlockCreate'),
)
const canReportPost = computed(
  () =>
    !!post.value &&
    !post.value.viewer_is_author &&
    canWhisperAction('PublicPost', post.value, 'whisperReportCreate'),
)
const canBlockPost = computed(() => !!post.value && !post.value.viewer_is_author && canBlock.value)
const canWriteComment = computed(
  () =>
    !!post.value?.comments_open &&
    (canWhisperAction('PublicPost', post.value, 'whisperCommentCreate') || !session.getToken()),
)
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
    if (!more && !manage.value) void recordView(result.id)
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
async function openComment(rootId = '', replyId = '', commentId = '') {
  const target = post.value?.id
  if (!target || editing.value) return
  if (!session.getToken()) {
    requestLogin(async () => {
      await load()
      if (post.value?.id === target) await openComment(rootId, replyId, commentId)
    })
    return
  }
  await commentEditor.open({ postId: target, rootId, replyId, id: commentId })
}
const hug = useWhisperHug(
  page,
  (targetId) => (post.value?.id === targetId ? post.value : null),
  (updated, wasActive) => {
    post.value = updated
    stopHugCelebration()
    if (!wasActive && updated.my_hug?.active) {
      hugCelebrating.value = true
      hugTimer = globalThis.setTimeout(stopHugCelebration, 1000)
    }
  },
  () => load(),
)
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
function scrollToComments() {
  void uni.pageScrollTo({ selector: '#whisper-comments', duration: 200 })
}
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
  manage.value = query?.manage === '1'
  if (query?.compose === '1')
    pendingComment = {
      id: typeof query.commentId === 'string' ? query.commentId : '',
      rootId: typeof query.rootId === 'string' ? query.rootId : '',
      replyId: typeof query.replyId === 'string' ? query.replyId : '',
    }
})
page.onRefresh(() => (editing.value ? editor.load(true) : load()))
onShow(() => {
  void load().then(async () => {
    const pending = pendingComment
    pendingComment = null
    if (pending && post.value) await openComment(pending.rootId, pending.replyId, pending.id)
  })
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <view v-if="hugCelebrating" class="hug-firework" aria-hidden="true">
      <text class="hug-firework-center">♥</text>
      <text
        v-for="spark in hugSparks"
        :key="spark.x"
        class="hug-firework-spark"
        :style="{
          '--spark-x': spark.x + 'rpx',
          '--spark-y': spark.y + 'rpx',
          '--spark-angle': spark.angle + 'deg',
          fontSize: spark.size + 'rpx',
        }"
        >♥</text
      >
    </view>
    <view v-if="editing" class="edit-section">
      <PageHeading title="编辑心事" />
      <button
        class="ui-button"
        :disabled="editor.locked.value"
        :loading="isPageActionPending('whisper-own-edit-cancel')"
        @click="runPageAction(cancelEdit, 'whisper-own-edit-cancel')"
      >
        取消编辑
      </button>
      <WhisperPostEditor :editor="editor" />
    </view>
    <view v-else class="whisper-detail">
      <template v-if="post">
        <view class="whisper-detail-card">
          <WhisperContent :content="post" />
          <view class="post-interactions">
            <WhisperHugButton :post="post" :toggle="hug" :disabled="actionsLocked" />
            <button class="post-action" @click="scrollToComments">
              <AppIcon name="chat" :size="28" /><text>评论 {{ post.comment_count }}</text>
            </button>
            <view class="post-favorite">
              <FavoriteButton
                kind="whisper_post"
                :target-id="post.id"
                :favorited="post.favorited"
                compact
              />
            </view>
          </view>
        </view>
        <view id="whisper-comments">
          <WhisperCommentPanel
            :post="post"
            :comments="comments"
            :editor="commentEditor"
            :can-write="canWriteComment"
            :can-block="canBlock"
            :has-more="!!cursor"
            :loading="busy"
            :disabled="actionsLocked"
            :error="commentsError"
            :open-comment="openComment"
            :load-more="() => load(true)"
            :reload="() => load()"
            :block="block"
          />
        </view>
        <view v-if="canReportPost || canBlockPost" class="moderation-actions">
          <navigator
            v-if="canReportPost"
            class="ui-link moderation-link"
            :url="`/pages/whispers/report?kind=whisper_post&id=${encodeURIComponent(post.id)}`"
            >举报</navigator
          >
          <button
            v-if="canBlockPost"
            class="moderation-link"
            :disabled="actionsLocked"
            :loading="isPageActionPending('whisper-block-author')"
            @click="runPageAction(() => block(), 'whisper-block-author')"
          >
            屏蔽发布者
          </button>
        </view>
      </template>
      <view v-else-if="ownerPost" class="whisper-detail-card whisper-detail-status">
        <text class="whisper-status-title" role="heading">{{
          ownerPost.title || '这条心事暂时无法查看'
        }}</text>
        <text class="ui-meta">{{ whisperStates[ownerPost.status] }}</text>
        <text v-if="ownerPost.body" class="ui-copy whitespace-pre-wrap">{{ ownerPost.body }}</text>
        <text v-if="ownerPost.review_result?.reason" class="ui-meta notice">{{
          ownerPost.review_result.reason
        }}</text>
        <text v-if="ownerPost.review_result?.revision_suggestion" class="ui-meta notice">{{
          ownerPost.review_result.revision_suggestion
        }}</text>
      </view>
      <template v-else-if="unavailable">
        <view class="whisper-detail-card">
          <text class="whisper-status-title" role="heading">这条心事暂时无法查看</text>
        </view>
        <navigator url="/pages/whispers/index" open-type="switchTab" class="ui-button">
          返回悄悄话列表
        </navigator>
      </template>
      <view v-else-if="busy" class="whisper-detail-card">
        <text class="ui-state">正在加载这条心事…</text>
      </view>
      <template v-else-if="error || notice">
        <view class="whisper-detail-card">
          <text class="whisper-status-title" role="heading">暂时无法打开这条心事</text>
        </view>
        <button
          v-if="error && !retryReady"
          class="ui-button"
          :loading="isPageActionPending('whisper-detail-reload')"
          @click="runPageAction(() => load(), 'whisper-detail-reload')"
        >
          重新读取
        </button>
        <navigator url="/pages/whispers/index" open-type="switchTab" class="ui-button">
          返回悄悄话列表
        </navigator>
      </template>
      <button
        v-if="ownerPost?.allowed_actions.length || post?.viewer_is_author"
        class="ui-button"
        :disabled="actionsLocked || editor.locked.value"
        :loading="isPageActionPending('whisper-own-edit')"
        @click="runPageAction(edit, 'whisper-own-edit')"
      >
        {{
          post?.viewer_is_author || ownerPost?.allowed_actions.includes('whisperPostUpdate')
            ? '编辑心事'
            : '管理帖子'
        }}
      </button>
    </view>
    <button
      v-if="retryReady"
      class="ui-button"
      :disabled="writing"
      :loading="isPageActionPending('whisper-detail-retry')"
      @click="runPageAction(page.retry, 'whisper-detail-retry')"
    >
      使用原请求重试
    </button>
    <AppNotice :message="notice" kind="info" />
    <AppNotice v-if="!unavailable" :message="error" kind="error" />
  </AppPage>
</template>
<style scoped>
.whisper-detail,
.whisper-detail-status {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  min-width: 0;
}
.whisper-detail-card {
  min-width: 0;
  padding: 28rpx;
  border: 1px solid var(--theme-line);
  border-radius: 34rpx;
  background: var(--theme-surface);
}
.whisper-status-title {
  margin: 0;
  color: var(--theme-ink);
  font-size: 36rpx;
  font-weight: 680;
  overflow-wrap: anywhere;
}
.post-interactions {
  display: grid;
  grid-template-columns: max-content max-content minmax(0, 1fr);
  align-items: start;
  gap: 10rpx;
  margin-top: 28rpx;
  padding-top: 8rpx;
  border-top: 1px solid var(--theme-line);
}
.post-favorite {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}
button.post-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  min-width: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0 4rpx;
  border: 0;
  background: transparent;
  color: var(--theme-muted);
  font-size: 24rpx;
  white-space: nowrap;
}
button.post-action::after {
  border: 0;
}
.post-action text {
  margin: 0;
}
.hug-firework {
  position: fixed;
  z-index: 1100;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}
.hug-firework-center,
.hug-firework-spark {
  position: absolute;
  display: block;
  line-height: 1;
  text-shadow: 0 0 16rpx #ffb54f;
}
.hug-firework-center {
  color: #ff6846;
  font-size: 92rpx;
  animation: hug-heart-pop 950ms ease-out both;
}
.hug-firework-spark {
  color: #ffad36;
  animation: hug-spark-fly 950ms ease-out both;
}
.hug-firework-spark:nth-child(2n) {
  color: #ff6c66;
}
@keyframes hug-heart-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.35);
  }
  28% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.14);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -95%) scale(0.85);
  }
}
@keyframes hug-spark-fly {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.2);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) translate(var(--spark-x), var(--spark-y))
      rotate(var(--spark-angle)) scale(0.85);
  }
}
.moderation-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24rpx;
  padding: 0 8rpx;
}
.moderation-actions .moderation-link {
  display: flex;
  align-items: center;
  width: auto;
  min-height: 44px;
  margin: 0;
  padding: 0 4rpx;
  border: 0;
  background: transparent;
  color: var(--theme-muted);
  font-size: 24rpx;
}
.moderation-actions button::after {
  border: 0;
}
</style>
