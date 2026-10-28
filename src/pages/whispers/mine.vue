<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import { mergeWhisperPage, whisperStates } from '@/utils/whisper-content'
import type { OwnerPost, OwnerComment } from '@/types/whispers'
const module = useWhispersStore()
const tab = ref<'posts' | 'comments'>('posts')
const posts = ref<OwnerPost[]>([])
const comments = ref<OwnerComment[]>([])
const cursor = ref<string | null>(null)
const ready = ref(false)
const seen = new Set<string>()
function clear() {
  posts.value = []
  comments.value = []
  cursor.value = null
  ready.value = false
  seen.clear()
}
const page = useWhisperPage(clear)
const { busy, writing, error, notice, retryReady } = page
async function load(more = false) {
  if (more && !cursor.value) return
  const previous = more ? cursor.value! : undefined
  const selected = tab.value
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后查看自己的记录。')
    if (!more) await module.refresh()
    if (!active()) return
    if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
    const query = { limit: 20, ...(previous ? { cursor: previous } : {}) }
    if (selected === 'posts') {
      const result = await callWhisper('whisperOwnPostsList', { query })
      if (!active()) return
      const merged = mergeWhisperPage(more ? posts.value : [], result, previous, seen)
      posts.value = merged.items
      cursor.value = merged.cursor
    } else {
      const result = await callWhisper('whisperOwnCommentsList', { query })
      if (!active()) return
      const merged = mergeWhisperPage(more ? comments.value : [], result, previous, seen)
      comments.value = merged.items
      cursor.value = merged.cursor
    }
    ready.value = true
  }, more)
}
async function switchTab(value: 'posts' | 'comments') {
  if (busy.value || writing.value || retryReady.value || tab.value === value) return
  tab.value = value
  await load()
}
async function withdraw(comment: OwnerComment) {
  if (
    !comments.value.includes(comment) ||
    !canWhisperAction('OwnerComment', comment, 'whisperCommentWithdraw')
  )
    return
  await page.write(
    'whisperCommentWithdraw',
    {
      path: { comment_id: comment.id },
      data: { expected_version: comment.version },
      key: whisperKey(),
    },
    (result) => {
      if (result.id !== comment.id) throw new Error('返回的评论目标不匹配，请刷新。')
      comments.value = comments.value.map((item) => (item.id === result.id ? result : item))
      notice.value = '评论已撤回，不会自动恢复。'
    },
    () => load(),
  )
}
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <navigator url="/pages/capsules/index">我的时光胶囊</navigator>
    <text class="title">我的树洞记录</text>
    <navigator url="/pages/whispers/editor">写一篇树洞</navigator
    ><navigator url="/pages/whispers/nickname">树洞昵称</navigator>
    <button
      :disabled="busy || writing || retryReady"
      @click="runPageAction(() => switchTab('posts'))"
    >
      {{ tab === 'posts' ? '已选：我的帖子' : '我的帖子' }}
    </button>
    <button
      :disabled="busy || writing || retryReady"
      @click="runPageAction(() => switchTab('comments'))"
    >
      {{ tab === 'comments' ? '已选：我的评论' : '我的评论' }}
    </button>
    <button :disabled="busy || writing || retryReady" @click="runPageAction(() => load())">
      刷新状态
    </button>
    <view v-for="post in posts" :key="post.id" class="card"
      ><text>{{ whisperStates[post.status] }}</text
      ><text v-if="post.body" class="whitespace-pre-wrap">{{ post.body }}</text
      ><text v-if="post.review_result?.reason">原因：{{ post.review_result.reason }}</text
      ><text v-if="post.review_result?.revision_suggestion"
        >建议：{{ post.review_result.revision_suggestion }}</text
      ><navigator :url="`/pages/whispers/editor?id=${encodeURIComponent(post.id)}`"
        >查看与管理</navigator
      ></view
    >
    <view v-for="comment in comments" :key="comment.id" class="card">
      <text>{{ whisperStates[comment.status] }}</text
      ><text v-if="comment.body" class="whitespace-pre-wrap">{{ comment.body }}</text>
      <text v-if="comment.review_result?.reason">原因：{{ comment.review_result.reason }}</text
      ><text v-if="comment.review_result?.revision_suggestion"
        >建议：{{ comment.review_result.revision_suggestion }}</text
      >
      <navigator
        v-if="comment.post_id && canWhisperAction('OwnerComment', comment, 'whisperCommentUpdate')"
        :url="`/pages/whispers/comment-editor?id=${encodeURIComponent(comment.id)}`"
        >读取当前上下文并修改暖评</navigator
      >
      <navigator
        v-if="comment.post_id"
        :url="`/pages/whispers/detail?id=${encodeURIComponent(comment.post_id)}`"
        >重新读取原帖</navigator
      ><text v-else>原帖不可用，旧评论不会恢复到原串。</text>
      <view v-if="comment.recovery_body"
        ><text>已完成受控脱敏的安全候选：</text
        ><text class="whitespace-pre-wrap">{{ comment.recovery_body }}</text
        ><text>如需再次表达，请另选当前公开帖子重新填写并提交新评论，不会自动迁移。</text></view
      >
      <navigator v-if="comment.recovery_body" url="/pages/whispers/index"
        >另选帖子，重新填写新暖评</navigator
      >
      <button
        v-if="canWhisperAction('OwnerComment', comment, 'whisperCommentWithdraw')"
        :disabled="busy || writing || retryReady"
        @click="runPageAction(() => withdraw(comment))"
      >
        撤回评论
      </button>
    </view>
    <text v-if="ready && !posts.length && !comments.length && !busy">当前页暂无记录。</text>
    <button
      v-if="cursor"
      :disabled="busy || writing || retryReady"
      @click="runPageAction(() => load(true))"
    >
      加载下一页
    </button>
    <button v-if="retryReady" :disabled="writing" @click="runPageAction(page.retry)">
      使用原请求重试</button
    ><text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
