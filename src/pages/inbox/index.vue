<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed, ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { listConversations, listNotifications, readNotification } from '@/api/chat'
import { notificationConversation } from '@/utils/chat'
import type { AppNotification, Conversation } from '@/types/chat'

const user = useUserStore()
const tab = ref<'conversations' | 'notifications'>('conversations')
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
  if (!more) clear()
  error.value = ''
  if (config.useMock || !owner || !session.getToken()) {
    error.value = config.useMock ? '聊天与通知需连接真实服务。' : '请登录后查看聊天与通知。'
    return
  }
  busy.value = true
  try {
    await user.refresh(false)
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
function selectTab(value: 'conversations' | 'notifications') {
  if (writing.value || busy.value || value === tab.value) return
  tab.value = value
  notice.value = ''
  void load()
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
function openNotification(notification: AppNotification) {
  if (busy.value || writing.value || !scoped.value || !notifications.value.includes(notification))
    return
  const target = notificationConversation(notification)
  // 只构造本端固定路由；聊天页再读本人列表与目标消息，不展示通知快照。
  if (target) uni.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(target)}` })
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
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <AppPage>
    <text class="title">聊天与通知</text>
    <navigator url="/pages/safety/index">警告与申诉</navigator>
    <navigator url="/pages/care/index">关怀与援助</navigator>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
    <view class="flex flex-wrap gap-3">
      <button :disabled="busy || writing" @click="runPageAction(() => selectTab('conversations'))">
        聊天
      </button>
      <button :disabled="busy || writing" @click="runPageAction(() => selectTab('notifications'))">
        通知
      </button>
    </view>
    <button :disabled="busy || writing" @click="runPageAction(() => load())">刷新</button>
    <text v-if="busy">加载中…</text>
    <template v-if="tab === 'conversations'">
      <text v-if="scoped && !busy && !conversationRows.length">暂无可访问会话</text>
      <navigator
        v-for="(conversation, index) in conversationRows"
        :key="conversation.id"
        class="card"
        :url="`/pages/chat/index?id=${encodeURIComponent(conversation.id)}`"
      >
        <text>匿名会话 {{ index + 1 }}</text>
        <text>{{ conversation.can_write ? '可聊天' : '只读' }}</text>
      </navigator>
    </template>
    <template v-else>
      <text v-if="scoped">已加载通知中有 {{ unreadCount }} 条未读</text>
      <text v-if="scoped && !busy && !notificationRows.length">暂无通知</text>
      <view v-for="notification in notificationRows" :key="notification.id" class="card">
        <navigator
          v-if="notification.kind === 'penalty_notice' && notification.target_ref"
          :url="`/pages/safety/index?tab=appeals&penaltyId=${encodeURIComponent(notification.target_ref)}&notificationId=${encodeURIComponent(notification.id)}`"
          >查看警告或对此处罚申诉</navigator
        >
        <navigator
          v-if="notification.kind === 'appeal_result'"
          url="/pages/safety/index?tab=appeals"
          >查看当前申诉结果</navigator
        >
        <navigator
          v-if="notification.kind === 'crisis_care' && notification.target_ref"
          :url="`/pages/care/index?id=${encodeURIComponent(notification.target_ref)}`"
          >查看关怀与援助资料</navigator
        >
        <text>{{ notification.read ? '已读' : '未读' }}</text>
        <text>{{ notification.notice || '有新进展，请查看相关页面。' }}</text>
        <button
          v-if="notificationConversation(notification)"
          :disabled="busy || writing"
          @click="runPageAction(() => openNotification(notification))"
        >
          打开聊天
        </button>
        <button
          v-if="notification.kind === 'message_reviewed'"
          :disabled="busy || writing"
          @click="runPageAction(() => selectTab('conversations'))"
        >
          查看聊天列表
        </button>
        <button
          v-if="!notification.read"
          :disabled="busy || writing"
          @click="runPageAction(() => markRead(notification))"
        >
          标为已读
        </button>
      </view>
    </template>
    <button
      v-if="scoped && cursor"
      :disabled="busy || writing"
      @click="runPageAction(() => load(true))"
    >
      加载下一页
    </button>
    <text v-if="notice" class="notice">{{ notice }}</text>
    <text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
