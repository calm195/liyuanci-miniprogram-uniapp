<script setup lang="ts">
import { useUnreadStore } from '@/stores/unread'
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
const opening = ref(false)
const error = ref('')
const notice = ref('')
const readEpoch = ref(-1)
const readOwner = ref('')
let visible = false
let generation = 0
let writeGeneration = 0
const readAttempts = new Map<string, { version: number; key: string; running: boolean }>()
let readFeedback = ''
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
function canRead(notification: AppNotification) {
  return (
    !busy.value &&
    !writing.value &&
    scoped.value &&
    notifications.value.includes(notification) &&
    Number.isSafeInteger(notification.version) &&
    notification.version > 0
  )
}
async function completeRead(
  notification: AppNotification,
  epoch: number,
  owner: string | undefined,
) {
  const sameSession = () => epoch === session.getEpoch() && owner === user.user?.id
  if (!sameSession() || notification.read) return
  let input = readAttempts.get(notification.id)
  if (input?.running) return
  if (!input) {
    input = {
      version: notification.version,
      key: `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      running: false,
    }
    readAttempts.set(notification.id, input)
  }
  const current = generation
  const writeId = ++writeGeneration
  const isCurrent = () =>
    visible && current === generation && sameSession() && writeId === writeGeneration
  input.running = true
  writing.value = true
  try {
    const result = await readNotification(
      { id: notification.id, version: input.version },
      input.key,
      true,
    )
    if (!sameSession()) return
    if (
      result.id !== notification.id ||
      result.read !== true ||
      !Number.isSafeInteger(result.version) ||
      result.version < input.version
    )
      throw new Error('通知回执不匹配')
    readAttempts.delete(notification.id)
    void useUnreadStore().refresh()
    readFeedback = ''
    if (!isCurrent()) return
    notifications.value = notifications.value.map((item) =>
      item.id === result.id && item.version <= result.version ? result : item,
    )
    notice.value = '通知已标记为已读。'
  } catch (failure) {
    if (!sameSession()) return
    const conflict = failure instanceof RequestError && failure.statusCode === 409
    if (
      failure instanceof RequestError &&
      failure.statusCode >= 400 &&
      failure.statusCode < 500 &&
      ![408, 429].includes(failure.statusCode)
    )
      readAttempts.delete(notification.id)
    readFeedback = conflict
      ? '通知状态已变化，请刷新后手动确认。'
      : '已读状态尚未确认，可返回通知中心重试。'
    if (!isCurrent()) return
    if (failure instanceof RequestError && [401, 403, 404].includes(failure.statusCode)) clear()
    if (conflict) {
      await load()
      if (visible && sameSession() && writeId === writeGeneration)
        notice.value = '通知状态已变化，已重新读取，请手动确认。'
    } else error.value = readFeedback
  } finally {
    input.running = false
    if (writeId === writeGeneration) writing.value = false
  }
}
async function markRead(notification: AppNotification) {
  if (!canRead(notification) || notification.read) return
  error.value = ''
  notice.value = ''
  await completeRead(notification, session.getEpoch(), user.user?.id)
}
async function openNotification(notification: AppNotification) {
  const destination = notificationDestination(notification)
  if (opening.value || !canRead(notification) || !destination) return
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const sameSession = () => epoch === session.getEpoch() && owner === user.user?.id
  opening.value = true
  error.value = ''
  try {
    const opened = await new Promise<boolean>((resolve) =>
      uni.navigateTo({
        url: destination.url,
        success: () => resolve(true),
        fail: () => resolve(false),
      }),
    )
    if (!sameSession()) return
    // 导航成功后原页面可能已隐藏，使用点击时的本人通知继续写入；失败跳转不消除未读。
    if (opened) await completeRead(notification, epoch, owner)
    else if (visible) error.value = '暂时无法打开，请重试。'
  } finally {
    if (sameSession()) opening.value = false
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
  [() => user.user?.id, () => session.getEpoch()],
  () => {
    readAttempts.clear()
    readFeedback = ''
    opening.value = false
    generation++
    writeGeneration++
    clear()
    busy.value = false
    writing.value = false
    error.value = '会话已变化，请重新读取。'
  },
  { flush: 'sync' },
)
onLoad((query) => {
  tab.value = query?.view === 'conversations' ? 'conversations' : 'notifications'
  uni.setNavigationBarTitle({ title: tab.value === 'conversations' ? '聊天' : '通知中心' })
})
onShow(() => {
  visible = true
  notice.value = readFeedback
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
        class="card conversation-card"
        :url="`/pages/chat/index?id=${encodeURIComponent(conversation.id)}`"
      >
        <view class="conversation-heading">
          <text class="conversation-title">{{ conversation.wish_title || '未命名心愿' }}</text>
          <text class="read-state" :class="{ unread: conversation.has_unread === true }">{{
            conversation.has_unread === true
              ? '未读'
              : conversation.has_unread === false
                ? '已读'
                : '状态待同步'
          }}</text>
        </view>
        <text class="conversation-preview">{{
          conversation.latest_message
            ? `${conversation.latest_message.viewer_is_sender ? '我：' : ''}${conversation.latest_message.body}`
            : conversation.latest_message === null
              ? '暂无消息'
              : '最新消息待同步'
        }}</text>
      </navigator>
    </template>
    <template v-else>
      <text v-if="scoped">已加载通知中有 {{ unreadCount }} 条未读</text>
      <text v-if="scoped && !busy && !notificationRows.length">暂无通知</text>
      <view
        v-for="notification in notificationRows"
        :key="notification.id"
        class="card notification-card"
      >
        <text class="read-state" :class="{ unread: !notification.read }">{{
          notification.read ? '已读' : '未读'
        }}</text>
        <view class="notification-content">
          <text class="notification-text">{{
            notification.notice || '这条通知的详情暂不可查看。'
          }}</text>
          <button
            v-if="notificationDestination(notification)"
            class="notification-jump"
            :aria-label="notificationDestination(notification)?.label"
            :disabled="busy || writing || opening"
            @click="
              runPageAction(
                () => openNotification(notification),
                `notification-open-${notification.id}`,
              )
            "
          >
            <text aria-hidden="true">→</text>
          </button>
        </view>
        <text v-if="!notificationDestination(notification)" class="subtitle"
          >关联内容暂不可打开。</text
        >
        <button
          v-if="!notification.read"
          class="mark-read"
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

<style scoped>
.page .conversation-card {
  color: var(--theme-ink);
}
.page .notification-card {
  display: flex;
  flex-direction: column;
}
.conversation-heading,
.notification-content {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.page .conversation-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 34rpx;
  font-weight: 700;
}
.page .read-state {
  flex-shrink: 0;
  margin: 0;
  color: var(--theme-muted);
  font-size: 24rpx;
}
.page .read-state.unread {
  color: var(--theme-brand);
  font-weight: 600;
}
.page .conversation-preview {
  margin: 14rpx 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--theme-muted);
  font-size: 28rpx;
  text-align: right;
}
.page .notification-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.page .notification-jump {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  min-height: 88rpx;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--theme-teal);
  font-size: 40rpx;
}
.page .notification-jump text {
  margin: 0;
}
.page .notification-jump::after {
  border: 0;
}
.page .mark-read {
  align-self: flex-end;
  min-height: 56rpx;
  line-height: 56rpx;
  border: 0;
  width: auto;
  margin: 12rpx 0 0 auto;
  padding: 0 20rpx;
  background: transparent;
  color: var(--theme-muted);
  font-size: 24rpx;
}
</style>
