<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import type { ReportCreate, PublicPost, PublicComment } from '@/types/whispers'
const module = useWhispersStore()
const id = ref('')
const kind = ref('')
const postId = ref('')
const target = ref<PublicPost | PublicComment | null>(null)
const typeCode = ref('')
const page = useWhisperPage(() => {
  target.value = null
  typeCode.value = ''
})
const { busy, writing, error, notice, retryReady } = page
async function resolve(active: () => boolean) {
  if (!session.getToken()) throw new Error('请登录后提交举报。')
  await module.refresh(false)
  if (!active()) return
  if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
  if (kind.value !== 'whisper_post' && kind.value !== 'whisper_comment')
    throw new Error('举报来源无效。')
  const post = await callWhisper('whisperPostGet', {
    path: { post_id: kind.value === 'whisper_post' ? id.value : postId.value },
  })
  if (!active()) return
  if (post.id !== (kind.value === 'whisper_post' ? id.value : postId.value))
    throw new Error('举报来源目标不匹配。')
  if (kind.value === 'whisper_post') {
    target.value = post
    return
  }
  let cursor: string | undefined
  const seen = new Set<string>()
  while (active()) {
    const list = await callWhisper('whisperCommentsList', {
      path: { post_id: post.id },
      query: { limit: 20, ...(cursor ? { cursor } : {}) },
    })
    if (!active()) return
    const item = list.items.find(
      (item) =>
        item.id === id.value &&
        item.post_id === post.id &&
        item.parent_content_version === post.content_version,
    )
    if (item) {
      target.value = item
      return
    }
    if (list.next_cursor === null) break
    if (list.next_cursor === cursor || seen.has(list.next_cursor))
      throw new Error('举报来源分页异常，请刷新。')
    seen.add(list.next_cursor)
    cursor = list.next_cursor
  }
  throw new Error('举报来源当前不可读取。')
}
async function load() {
  await page.read(resolve)
}
async function submit() {
  if (busy.value || writing.value || retryReady.value) return
  // 发送前重新核对公开来源及当前正文版本，不接受路由正文、昵称或作者引用。
  await page.read(resolve, true)
  const item = target.value
  const projection = kind.value === 'whisper_post' ? 'PublicPost' : 'PublicComment'
  if (!item || !canWhisperAction(projection, item, 'whisperReportCreate')) {
    error.value = '当前来源不允许举报。'
    return
  }
  if (!module.config?.report_types.some((item) => item.code === typeCode.value)) {
    error.value = '请选择当前可用的举报类型。'
    return
  }
  const source: ReportCreate['source'] = {
    kind: kind.value as ReportCreate['source']['kind'],
    id: item.id,
    content_version: item.content_version,
  }
  await page.write(
    'whisperReportCreate',
    {
      data: {
        source,
        type_code: typeCode.value,
      },
      key: whisperKey(),
    },
    () => {
      target.value = null
      typeCode.value = ''
      notice.value = '举报已受理，处理结果以实际审核为准。'
    },
    load,
  )
}
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
  kind.value = typeof query?.kind === 'string' ? query.kind : ''
  postId.value = typeof query?.postId === 'string' ? query.postId : ''
})
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">举报树洞内容</text
    ><button :disabled="busy || writing || retryReady" @click="runPageAction(load)">
      重新核对来源
    </button>
    <view v-if="target" class="card"
      ><text>已读取当前公开来源。举报仅提交内容引用与版本。</text
      ><button
        v-for="item in module.config?.report_types || []"
        :key="item.code"
        :disabled="busy || writing || retryReady"
        @click="runPageAction(() => (typeCode = item.code))"
      >
        {{ typeCode === item.code ? '已选：' : '' }}{{ item.label }}</button
      ><text v-if="!module.config?.report_types.length">举报类型资料尚不可用，不能提交。</text
      ><button :disabled="busy || writing || retryReady" @click="runPageAction(submit)">
        提交举报
      </button></view
    >
    <button v-if="retryReady" :disabled="writing" @click="runPageAction(page.retry)">
      使用原请求重试</button
    ><text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
