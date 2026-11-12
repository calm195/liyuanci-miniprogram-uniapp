import type { UserInfo } from '../types/api.ts'
import type {
  Conversation,
  DeliveredMessage,
  MessagesPage,
  AppNotification,
  MessageStatus,
} from '../types/chat.ts'

export function canWriteConversation(
  me: UserInfo | null,
  validated: boolean,
  conversation: Conversation | null,
  target: string,
): boolean {
  return (
    !!me &&
    validated &&
    me.verification === 'verified' &&
    !!conversation &&
    conversation.id === target &&
    conversation.can_write === true &&
    Number.isSafeInteger(conversation.version) &&
    conversation.version > 0 &&
    Number.isSafeInteger(conversation.write_epoch) &&
    conversation.write_epoch >= 0
  )
}
export function mergeMessages(previous: DeliveredMessage[], page: MessagesPage, afterSeq: number) {
  let last = afterSeq
  const ids = new Set(previous.map((item) => item.message_id))
  for (const item of page.items) {
    if (
      !item.message_id ||
      ids.has(item.message_id) ||
      !Number.isSafeInteger(item.delivery_seq) ||
      item.delivery_seq <= last
    )
      throw new Error('消息送达顺序异常，请重新读取')
    ids.add(item.message_id)
    last = item.delivery_seq
  }
  // 空页保持原位置；只接受本页实际末条序号，绝不用提交时间或审核状态推进。
  if (page.next_after_seq !== last) throw new Error('消息增量位置异常，请重新读取')
  return { items: page.items.length ? [...previous, ...page.items] : previous, afterSeq: last }
}
export function isMessageStatus(value: MessageStatus, id: string): boolean {
  return (
    value.message_id === id &&
    ['pending', 'rejected', 'cancelled', 'delivered'].includes(value.status) &&
    (value.status === 'delivered'
      ? Number.isSafeInteger(value.delivery_seq) && value.delivery_seq! > 0
      : value.delivery_seq === null)
  )
}
export function notificationConversation(notification: AppNotification): string | null {
  // 旧送达通知没有目标类型；消息审核必须由服务端确认并返回可访问的会话。
  return (notification.kind === 'message_delivered' ||
    (notification.kind === 'message_reviewed' && notification.target_kind === 'conversation')) &&
    notification.target_ref
    ? notification.target_ref
    : null
}

export function notificationDestination(notification: AppNotification) {
  const ref = encodeURIComponent(notification.target_ref || '')
  const conversation = notificationConversation(notification)
  if (conversation) {
    return { url: `/pages/chat/index?id=${encodeURIComponent(conversation)}`, label: '打开聊天' }
  }
  if (notification.kind === 'message_reviewed') {
    return { url: '/pages/inbox/index?view=conversations', label: '查看聊天列表' }
  }
  if (!ref) return null
  if (notification.kind === 'crisis_care') {
    return { url: `/pages/care/index?id=${ref}`, label: '查看援助资源' }
  }
  if (notification.kind === 'penalty_notice') {
    return {
      url: `/pages/safety/index?penaltyId=${ref}&notificationId=${encodeURIComponent(notification.id)}`,
      label: '查看账号处置',
    }
  }
  if (notification.kind === 'appeal_result') {
    return { url: '/pages/safety/index?tab=appeals', label: '查看申诉结果' }
  }
  switch (notification.target_kind) {
    case 'wish':
      return { url: `/pages/wish-detail/index?id=${ref}`, label: '查看心愿' }
    case 'matchmaking':
      return { url: `/pages/matchmaking/detail?id=${ref}`, label: '查看包分配活动' }
    case 'wish_applications':
      return { url: `/pages/applications/index?wishId=${ref}`, label: '查看应愿申请' }
    case 'my_application':
      return { url: `/pages/applications/index?applicationId=${ref}`, label: '查看申请结果' }
    case 'post':
      return { url: `/pages/whispers/detail?id=${ref}`, label: '查看悄悄话与暖评' }
    case 'capsule':
      return { url: `/pages/capsules/detail?id=${ref}`, label: '查看时光胶囊' }
    default:
      return null
  }
}
