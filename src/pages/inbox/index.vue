<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { listConversations, listNotifications, readNotification } from '@/api/chat'
import { notificationDestination } from '@/utils/chat'
import type { AppNotification, Conversation } from '@/types/chat'

const user = useUserStore()
const tab = ref<'conversations' | 'notifications'>('notifications')
const conversations = ref<Conversation[]>([])
const notifications = ref<AppNotification[]>([])
const cursor = ref<string | null>(null)
const usedCursors = new Set<string>()
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const notice = ref('')
const readEpoch = ref(-1)
const readOwner = ref('')
let visible = false
let generation = 0
let writeGeneration = 0
const scoped = computed(
  () =>
    readEpoch.value === session.getEpoch() && readOwner.value === user.user?.id && user.validated,
)
const conversationRows = computed(() => (scoped.value ? conversations.value : []))
const notificationRows = computed(() => (scoped.value ? notifications.value : []))
const unreadCount = computed(() => notificationRows.value.filter((item) => !item.read).length)
function checkCursor(next: unknown) {
  // 游标仅在当前读取链内使用；重复或畸形值停止翻页，刷新后重新建立读取链。
  if (next === null) return
  if (typeof next !== 'string' || !next || usedCursors.has(next))
    throw new Error('分页游标异常，请刷新后重试')
  usedCursors.add(next)
}
function clear() {
  conversations.value = []
  notifications.value = []
  cursor.value = null
  usedCursors.clear()
  readEpoch.value = -1
  readOwner.value = ''
}
async function load(more = false) {
  if (more && (busy.value || !scoped.value || !cursor.value)) return
  const current = ++generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const mode = tab.value
  const nextCursor = more ? cursor.value! : undefined
  const isCurrent = () =>
    visible &&
    current === generation &&
    epoch === session.getEpoch() &&
    owner === user.user?.id &&
    mode === tab.value
  if (!more) {
    cursor.value = null
    usedCursors.clear()
  }
  error.value = ''
  if (config.useMock || !owner || !session.getToken()) {
    error.value = config.useMock ? '聊天与通知需连接真实服务。' : '请登录后查看聊天与通知。'
    return
  }
  busy.value = true
  try {
    await user.refresh(false, true)
    if (!isCurrent()) return
    if (mode === 'conversations') {
      const page = await listConversations(nextCursor)
      if (!isCurrent()) return
      checkCursor(page.next_cursor)
      conversations.value = [
        ...(more ? conversations.value : []),
        ...page.items.filter(
          (item) => !more || !conversations.value.some((old) => old.id === item.id),
        ),
      ]
      cursor.value = page.next_cursor
    } else {
      const page = await listNotifications(nextCursor)
      if (!isCurrent()) return
      checkCursor(page.next_cursor)
      notifications.value = [
        ...(more ? notifications.value : []),
        ...page.items.filter(
          (item) => !more || !notifications.value.some((old) => old.id === item.id),
        ),
      ]
      cursor.value = page.next_cursor
    }
    readEpoch.value = epoch
    readOwner.value = owner
  } catch {
    if (!isCurrent()) return
    clear()
    error.value = '读取失败，请刷新当前资格后重试。'
  } finally {
    if (visible && current === generation) busy.value = false
  }
}
async function markRead(notification: AppNotification) {
  if (
    busy.value ||
    writing.value ||
    !scoped.value ||
    !notifications.value.includes(notification) ||
    notification.read ||
    !Number.isSafeInteger(notification.version) ||
    notification.version < 1
  )
    return
  const current = generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const writeId = ++writeGeneration
  const isCurrent = () =>
    visible &&
    current === generation &&
    epoch === session.getEpoch() &&
    owner === user.user?.id &&
    writeId === writeGeneration
  writing.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await readNotification(
      notification,
      `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    if (!isCurrent()) return
    if (result.id !== notification.id || typeof result.read !== 'boolean')
      throw new Error('通知回执不匹配')
    notifications.value = notifications.value.map((item) => (item === notification ? result : item))
    notice.value = '通知已标记为已读。'
  } catch (failure) {
    if (!isCurrent()) return
    clear()
    if (failure instanceof RequestError && failure.statusCode === 409) {
      await load()
      if (visible && epoch === session.getEpoch() && writeId === writeGeneration)
        notice.value = '通知状态已变化，已重新读取，请手动确认。'
    } else error.value = '标记未完成，请刷新通知后重试。'
  } finally {
    if (writeId === writeGeneration) writing.value = false
  }
}
function leave() {
  visible = false
  generation++
  writeGeneration++
  clear()
  busy.value = false
  writing.value = false
  notice.value = ''
  error.value = ''
}
watch(
  () => user.user?.id,
  () => {
    if (readOwner.value && readOwner.value !== user.user?.id) {
      generation++
      writeGeneration++
      clear()
      busy.value = false
      writing.value = false
      error.value = '会话已变化，请重新读取。'
    }
  },
  { flush: 'sync' },
)
onLoad((query) => {
  tab.value = query?.view === 'conversations' ? 'conversations' : 'notifications'
})
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
onPullDownRefresh(async () => {
  try {
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage>
    <text class="title">{{ tab === 'conversations' ? '聊天' : '通知中心' }}</text>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
    <text v-if="busy">加载中…</text>
    <template v-if="tab === 'conversations'">
      <text v-if="scoped && !busy && !conversationRows.length">暂无可访问会话</text>
      <navigator
        v-for="conversation in conversationRows"
        :key="conversation.id"
        class="card"
        :url="`/pages/chat/index?id=${encodeURIComponent(conversation.id)}`"
      >
        <text>{{ conversation.wish_title || '未命名心愿' }}</text>
        <text>{{ conversation.can_write ? '可聊天' : '只读' }}</text>
      </navigator>
    </template>
    <template v-else>
      <text v-if="scoped">已加载通知中有 {{ unreadCount }} 条未读</text>
      <text v-if="scoped && !busy && !notificationRows.length">暂无通知</text>
      <view v-for="notification in notificationRows" :key="notification.id" class="card">
        <text>{{ notification.read ? '已读' : '未读' }}</text>
        <text>{{ notification.notice || '这条通知的详情暂不可查看。' }}</text>
        <navigator
          v-if="notificationDestination(notification)"
          :url="notificationDestination(notification)?.url || ''"
        >
          {{ notificationDestination(notification)?.label }}
        </navigator>
        <text v-else class="subtitle">关联内容暂不可打开。</text>
        <button
          v-if="!notification.read"
          :disabled="busy || writing"
          :loading="isPageActionPending('pages-inbox-index-button-6' + ':' + notification.id)"
          @click="
            runPageAction(
              () => markRead(notification),
              'pages-inbox-index-button-6' + ':' + notification.id,
            )
          "
        >
          标为已读
        </button>
      </view>
    </template>
    <button
      v-if="scoped && cursor"
      :disabled="busy || writing"
      :loading="isPageActionPending('pages-inbox-index-button-7')"
      @click="runPageAction(() => load(true), 'pages-inbox-index-button-7')"
    >
      加载下一页
    </button>
    <AppNotice :message="notice" kind="info" />
    <AppNotice :message="error" kind="error" />
  </AppPage>
</template>
