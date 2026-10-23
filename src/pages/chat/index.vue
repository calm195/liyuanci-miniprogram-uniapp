<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useChatStore } from '@/stores/chat'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { findConversation, listMessages, sendMessage, getMessageStatus } from '@/api/chat'
import { canWriteConversation, mergeMessages, isMessageStatus } from '@/utils/chat'
import { createVisiblePoller } from '@/utils/visible-poller'
import { messageStatusLabels } from '@/types/chat'
import type { Conversation, DeliveredMessage } from '@/types/chat'

const user = useUserStore()
const store = useChatStore()
const id = ref('')
const conversation = ref<Conversation | null>(null)
const messages = ref<DeliveredMessage[]>([])
const afterSeq = ref(0)
const hasMore = ref(false)
const draft = ref('')
const reading = ref(false)
const sending = ref(false)
const error = ref('')
const notice = ref('')
const readEpoch = ref(-1)
const readOwner = ref('')
const attempt = ref<{
  body: string
  client_message_id: string
  expected_write_epoch: number
  key: string
} | null>(null)
let visible = false
let generation = 0
const currentConversation = computed(() =>
  readEpoch.value === session.getEpoch() && readOwner.value === user.user?.id && user.validated
    ? conversation.value
    : null,
)
const timeline = computed(() => (currentConversation.value ? messages.value : []))
const outgoing = computed(() => (currentConversation.value ? store.receipts[id.value] || [] : []))
const canSend = computed(
  () =>
    !config.useMock &&
    canWriteConversation(user.user, user.validated, currentConversation.value, id.value),
)
function current(visit: number, epoch: number, owner: string | undefined) {
  return visible && generation === visit && epoch === session.getEpoch() && owner === user.user?.id
}
function clearProjection() {
  conversation.value = null
  messages.value = []
  afterSeq.value = 0
  hasMore.value = false
  readEpoch.value = -1
  readOwner.value = ''
}
async function refresh(force = false) {
  if (reading.value || (sending.value && !force) || !visible) return
  const visit = generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const isCurrent = () => current(visit, epoch, owner)
  if (config.useMock || !id.value || !session.getToken() || !owner) {
    clearProjection()
    error.value = config.useMock
      ? '聊天需连接真实服务，请关闭合成演示模式。'
      : '请登录后从当前会话列表进入聊天。'
    return
  }
  reading.value = true
  try {
    await user.refresh(false)
    if (!isCurrent()) return
    store.syncSession()
    const target = await findConversation(id.value, isCurrent)
    if (!isCurrent()) return
    if (!target) {
      store.forget(id.value)
      clearProjection()
      draft.value = ''
      attempt.value = null
      error.value = '当前会话不存在或已不可访问。'
      return
    }
    const page = await listMessages(id.value, afterSeq.value)
    if (!isCurrent()) return
    const merged = mergeMessages(messages.value, page, afterSeq.value)
    messages.value = merged.items
    afterSeq.value = merged.afterSeq
    hasMore.value = page.items.length === 50
    conversation.value = target
    readEpoch.value = epoch
    readOwner.value = owner
    error.value = ''
    // 本人审核状态不参与送达游标；慢审后到只会在后续增量页中按最终序号出现。
    for (const receipt of [...(store.receipts[id.value] || [])]) {
      if (!isCurrent()) return
      if (messages.value.some((item) => item.message_id === receipt.message_id)) {
        store.remove(id.value, receipt.message_id)
        continue
      }
      if (receipt.status !== 'pending') continue
      const result = await getMessageStatus(receipt.message_id)
      if (!isCurrent()) return
      if (!isMessageStatus(result, receipt.message_id)) throw new Error('消息状态异常，请重新读取')
      store.update(id.value, result)
    }
  } catch (failure) {
    if (!isCurrent()) return
    clearProjection()
    if (failure instanceof RequestError && [401, 403, 404].includes(failure.statusCode)) {
      store.forget(id.value)
      attempt.value = null
      draft.value = ''
    }
    error.value = '消息读取失败，已暂停发送，请刷新当前资格与会话。'
  } finally {
    if (visible && generation === visit) reading.value = false
  }
}
async function send(retry = false) {
  if (sending.value || reading.value || !canSend.value) return
  if (!retry && attempt.value) return
  if (!retry && !draft.value.trim()) {
    error.value = '请填写消息内容'
    return
  }
  const target = currentConversation.value!
  if (!retry) {
    attempt.value = {
      body: draft.value,
      client_message_id: `message-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      expected_write_epoch: target.write_epoch,
      key: `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }
  }
  const input = attempt.value
  if (!input) return
  if (input.expected_write_epoch !== target.write_epoch) {
    attempt.value = null
    error.value = '会话权限已变化，请核对消息与当前状态后重新发送。'
    return
  }
  const visit = generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const isCurrent = () => current(visit, epoch, owner)
  sending.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await sendMessage(
      id.value,
      {
        client_message_id: input.client_message_id,
        body: input.body,
        expected_write_epoch: input.expected_write_epoch,
      },
      input.key,
    )
    if (!isCurrent()) return
    if (!result.message_id || result.status !== 'pending_scan' || result.delivery_seq !== null)
      throw new Error('发送回执尚未确认')
    store.track(id.value, result)
    draft.value = ''
    attempt.value = null
    notice.value = '消息已受理，审核通过并送达后才会进入聊天记录。'
    await refresh(true)
  } catch (failure) {
    if (!isCurrent()) return
    if (failure instanceof RequestError && failure.statusCode >= 400 && failure.statusCode < 500) {
      attempt.value = null
      clearProjection()
      if ([401, 403, 404].includes(failure.statusCode)) {
        draft.value = ''
        store.forget(id.value)
      }
      await refresh(true)
      if (isCurrent())
        error.value =
          failure.statusCode === 409
            ? '会话状态已变化，已重新读取，请确认后手动发送。'
            : '发送未完成，请核对当前权限与消息后重试。'
    } else error.value = '发送结果尚未确认。重试会复用同一次消息标识，请勿另发相同内容。'
  } finally {
    if (visible && generation === visit) sending.value = false
  }
}
async function abandonAttempt() {
  if (sending.value || !attempt.value) return
  const visit = generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const pending = attempt.value
  const confirmed = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: '放弃本次重试',
      content: '原消息可能已受理。请先核对聊天记录与审核状态，避免重复发送。',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  )
  if (confirmed && current(visit, epoch, owner) && attempt.value === pending) attempt.value = null
}
function leave() {
  visible = false
  generation++
  poller.stop()
  clearProjection()
  draft.value = ''
  attempt.value = null
  sending.value = false
  reading.value = false
  error.value = ''
  notice.value = ''
}
const poller = createVisiblePoller(() => refresh())
watch(
  () => user.user?.id,
  () => {
    if (readOwner.value && readOwner.value !== user.user?.id) {
      generation++
      poller.stop()
      clearProjection()
      draft.value = ''
      attempt.value = null
      sending.value = false
      reading.value = false
      error.value = '会话已变化，请重新进入聊天。'
    }
  },
  { flush: 'sync' },
)
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
})
onShow(() => {
  visible = true
  generation++
  store.syncSession()
  poller.start()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <view class="page">
    <text class="title">匿名聊天</text>
    <navigator url="/pages/inbox/index">聊天与通知</navigator>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
    <text v-if="currentConversation">{{ canSend ? '当前可发送消息' : '当前会话只读' }}</text>
    <button :disabled="reading || sending" @click="refresh()">刷新聊天</button>
    <view v-for="message in timeline" :key="message.message_id" class="card">
      <text class="body">{{ message.body }}</text>
      <text class="secondary">送达时间：{{ message.delivered_at }}</text>
    </view>
    <text v-if="currentConversation && !timeline.length && !reading">暂无已送达消息</text>
    <button v-if="hasMore && currentConversation" :disabled="reading || sending" @click="refresh()">
      继续读取消息
    </button>
    <view v-if="outgoing.length" class="card">
      <text>我的发送状态</text>
      <view v-for="(receipt, index) in outgoing" :key="receipt.message_id">
        <text>消息 {{ index + 1 }}：{{ messageStatusLabels[receipt.status] }}</text>
        <text v-if="receipt.review_result?.reason"
          >驳回原因：{{ receipt.review_result.reason }}</text
        >
        <text v-if="receipt.review_result?.revision_suggestion"
          >修改建议：{{ receipt.review_result.revision_suggestion }}</text
        >
      </view>
    </view>
    <view v-if="currentConversation" class="card">
      <textarea
        v-model="draft"
        :maxlength="-1"
        :disabled="!canSend || sending || !!attempt"
        placeholder="发送文字消息"
      />
      <button v-if="!attempt" :disabled="!canSend || reading || sending" @click="send()">
        发送
      </button>
      <template v-else>
        <text>发送结果未确认，请重试或先核对聊天记录。</text>
        <button :disabled="!canSend || reading || sending" @click="send(true)">
          重试同一条消息
        </button>
        <button :disabled="sending" @click="abandonAttempt">放弃本次重试</button>
      </template>
    </view>
    <text v-if="notice" class="notice">{{ notice }}</text>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>
<style scoped>
.page {
  padding: 32rpx;
}
.title {
  font-size: 40rpx;
  font-weight: bold;
}
.card {
  padding: 24rpx;
  margin-top: 24rpx;
  background: white;
  border-radius: 20rpx;
}
text {
  display: block;
  margin: 16rpx 0;
}
.body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.secondary {
  color: #667085;
  font-size: 24rpx;
}
textarea {
  width: 100%;
}
button {
  margin-top: 16rpx;
}
.notice {
  background: #fff1cc;
  padding: 20rpx;
}
.error {
  color: #b42318;
}
</style>
