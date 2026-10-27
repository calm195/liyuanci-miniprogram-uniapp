<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { mergeWhisperPage } from '@/utils/whisper-content'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import type { Notification, Capsule } from '@/types/whispers'
const items = ref<Notification[]>([])
const cursor = ref<string | null>(null)
const ready = ref(false)
const capsule = ref<Capsule | null>(null)
const capsuleNotice = ref<Notification | null>(null)
const seen = new Set<string>()
const page = useWhisperPage(() => {
  items.value = []
  cursor.value = null
  ready.value = false
  capsule.value = null
  capsuleNotice.value = null
  seen.clear()
})
const { busy, writing, error, notice, retryReady } = page
const locked = computed(() => busy.value || writing.value || retryReady.value)
const unread = computed(() => items.value.filter((item) => !item.read).length)
const capsuleStates: Record<Capsule['status'], string> = {
  scanning: '安全扫描中',
  review_pending: '等待人工审核',
  locked: '尚未解锁',
  unlocked: '已解锁',
  rejected: '未通过审核',
  isolated: '安全隔离中',
  cancelled: '已取消',
  deleted: '已删除',
}
async function load(more = false) {
  if (more && !cursor.value) return
  const previous = more ? cursor.value! : undefined
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后查看本人模块通知。')
    const result = await callWhisper('whisperNotificationsList', {
      query: { limit: 20, ...(previous ? { cursor: previous } : {}) },
    })
    if (!active()) return
    const merged = mergeWhisperPage(more ? items.value : [], result, previous, seen)
    items.value = merged.items
    cursor.value = merged.cursor
    ready.value = true
  }, more)
}
async function markRead(item: Notification) {
  if (
    locked.value ||
    !items.value.includes(item) ||
    item.read ||
    !canWhisperAction('Notification', item, 'whisperNotificationRead')
  )
    return
  await page.write(
    'whisperNotificationRead',
    {
      path: { notification_id: item.id },
      data: { expected_version: item.version },
      key: whisperKey(),
    },
    (result) => {
      if (
        result.id !== item.id ||
        result.target_kind !== item.target_kind ||
        result.target_id !== item.target_id ||
        result.comment_id !== item.comment_id ||
        result.kind !== item.kind
      )
        throw new Error('通知回执目标不匹配，请刷新。')
      items.value = items.value.map((old) => (old.id === result.id ? result : old))
    },
    () => load(),
  )
}
async function open(reference: Notification) {
  if (locked.value) return
  const item = items.value.find((row) => row.id === reference.id)
  if (!item) return
  capsule.value = null
  capsuleNotice.value = null
  // 通知只作来源引用；重验当前对象，不把通知文案当作旧正文回显。
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后读取通知目标。')
    if (item.kind === 'whisper_comment' && item.target_kind === 'post' && item.comment_id) {
      const parent = await callWhisper('whisperPostGet', { path: { post_id: item.target_id } })
      if (!active()) return
      if (parent.id !== item.target_id) throw new Error('通知目标当前不可访问。')
      let next: string | undefined
      const visited = new Set<string>()
      while (active()) {
        const list = await callWhisper('whisperCommentsList', {
          path: { post_id: parent.id },
          query: { limit: 20, ...(next ? { cursor: next } : {}) },
        })
        if (!active()) return
        if (
          list.items.some(
            (comment) =>
              comment.id === item.comment_id &&
              comment.post_id === parent.id &&
              comment.parent_content_version === parent.content_version,
          )
        ) {
          uni.navigateTo({ url: `/pages/whispers/detail?id=${encodeURIComponent(parent.id)}` })
          return
        }
        if (list.next_cursor === null) break
        if (list.next_cursor === next || visited.has(list.next_cursor))
          throw new Error('通知来源分页异常，请刷新。')
        visited.add(list.next_cursor)
        next = list.next_cursor
      }
      throw new Error('通知中的暖评当前不可访问，请刷新查看最新进展。')
    }
    if (
      item.kind === 'whisper_capsule_unlocked' &&
      item.target_kind === 'capsule' &&
      item.comment_id === null
    ) {
      const current = await callWhisper('whisperCapsuleGet', {
        path: { capsule_id: item.target_id },
      })
      if (!active()) return
      if (current.id !== item.target_id) throw new Error('通知目标当前不可访问。')
      capsule.value = current
      capsuleNotice.value = item
      return
    }
    throw new Error('通知来源与目标不匹配，已停止跳转。')
  }, true)
}
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">悄悄鲤通知</text>
    <navigator url="/pages/whispers/mine">我的记录</navigator>
    <navigator url="/pages/safety/index">警告与申诉</navigator>
    <navigator url="/pages/care/index">本人关怀与援助</navigator>
    <button :disabled="locked" @click="runPageAction(() => load())">刷新通知</button>
    <text v-if="ready">已加载通知中 {{ unread }} 条未读</text>
    <text v-if="ready && !items.length && !busy">当前页暂无模块通知。</text>
    <view v-for="item in items" :key="item.id" class="card">
      <text>{{ item.kind === 'whisper_comment' ? '树洞有暖评进展' : '本人胶囊有新进展' }}</text>
      <text>{{ item.read ? '已读' : '未读' }}</text>
      <button :disabled="locked" @click="runPageAction(() => open(item))">
        重验并查看当前内容
      </button>
      <button
        v-if="!item.read && canWhisperAction('Notification', item, 'whisperNotificationRead')"
        :disabled="locked"
        @click="runPageAction(() => markRead(item))"
      >
        标为已读
      </button>
    </view>
    <button v-if="cursor" :disabled="locked" @click="runPageAction(() => load(true))">
      加载下一页
    </button>
    <view v-if="capsule" class="card">
      <text>本人胶囊当前状态：{{ capsuleStates[capsule.status] }}</text>
      <text>预约时间（UTC）：{{ capsule.unlock_at }}</text>
      <text>服务端时间（UTC）：{{ capsule.server_now }}</text>
      <text
        v-if="capsule.status === 'unlocked' && capsule.body !== null"
        class="whitespace-pre-wrap"
        >{{ capsule.body }}</text
      >
      <text v-else>当前不能读取正文，以重新读取的服务端状态为准。</text>
      <button
        v-if="capsuleNotice"
        :disabled="locked"
        @click="runPageAction(() => open(capsuleNotice!))"
      >
        重新读取此胶囊
      </button>
    </view>
    <button v-if="retryReady" :disabled="writing" @click="runPageAction(page.retry)">
      使用原请求重试
    </button>
    <text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
