<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { mergeWhisperPage } from '@/utils/whisper-content'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import type { PublicPost, PublicComment } from '@/types/whispers'
const module = useWhispersStore()
const id = ref('')
const post = ref<PublicPost | null>(null)
const comments = ref<PublicComment[]>([])
const cursor = ref<string | null>(null)
const commentsError = ref('')
const seen = new Set<string>()
function clear() {
  post.value = null
  comments.value = []
  cursor.value = null
  commentsError.value = ''
  seen.clear()
}
const page = useWhisperPage(clear)
const { busy, writing, error, notice, retryReady } = page
async function load(more = false) {
  if (more && (!post.value || !cursor.value)) return
  const previous = more ? cursor.value! : undefined
  const context = post.value
  await page.read(async (active) => {
    if (!more) await module.refresh(false)
    if (!active()) return
    if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
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
  const projection = comment ? 'PublicComment' : 'PublicPost'
  if (!target || !canWhisperAction(projection, target, 'interactionBlockCreate')) return
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
})
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">树洞详情</text
    ><button :disabled="busy || writing || retryReady" @click="runPageAction(() => load())">
      刷新当前内容
    </button>
    <view v-if="post" class="card"
      ><WhisperContent :content="post" /><text
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
        @click="runPageAction(() => hug(!post!.my_hug!.active))"
      >
        {{ post.my_hug.active ? '取消抱抱' : '抱抱' }}
      </button>
      <navigator
        v-if="post.viewer_is_author"
        :url="`/pages/whispers/editor?id=${encodeURIComponent(post.id)}`"
        >管理我的帖子</navigator
      >
      <navigator
        v-if="canWhisperAction('PublicPost', post, 'whisperReportCreate')"
        :url="`/pages/whispers/report?kind=whisper_post&id=${encodeURIComponent(post.id)}`"
        >举报此内容</navigator
      >
      <button
        v-if="canWhisperAction('PublicPost', post, 'interactionBlockCreate')"
        :disabled="busy || writing || retryReady"
        @click="runPageAction(() => block())"
      >
        屏蔽此内容的发布者
      </button>
      <text v-if="!post.comments_open">评论已关闭，已公开合规评论仅供阅读。</text>
    </view>
    <view v-for="comment in comments" :key="comment.id" class="card"
      ><WhisperContent :content="comment" /><navigator
        v-if="canWhisperAction('PublicComment', comment, 'whisperReportCreate')"
        :url="`/pages/whispers/report?kind=whisper_comment&id=${encodeURIComponent(comment.id)}&postId=${encodeURIComponent(comment.post_id)}`"
        >举报此暖评</navigator
      ><button
        v-if="canWhisperAction('PublicComment', comment, 'interactionBlockCreate')"
        :disabled="busy || writing || retryReady"
        @click="runPageAction(() => block(comment))"
      >
        屏蔽此暖评的发布者
      </button></view
    >
    <text v-if="post && !comments.length && !busy && !commentsError">当前页暂无公开暖评。</text>
    <button
      v-if="cursor"
      :disabled="busy || writing || retryReady"
      @click="runPageAction(() => load(true))"
    >
      加载下一页暖评</button
    ><text v-if="commentsError" class="error">{{ commentsError }}</text>
    <button v-if="retryReady" :disabled="writing" @click="runPageAction(page.retry)">
      使用原请求重试</button
    ><text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
