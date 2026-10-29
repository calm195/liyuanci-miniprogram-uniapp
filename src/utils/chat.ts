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
  // 仅聊天送达通知的目标是会话；其他类型不将不透明引用猜作会话或URL。
  return notification.kind === 'message_delivered' && notification.target_ref
    ? notification.target_ref
    : null
}
