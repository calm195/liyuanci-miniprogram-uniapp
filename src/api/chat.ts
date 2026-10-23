import { request } from '@/utils/request'
import type {
  ConversationPage,
  MessageAccepted,
  MessageStatus,
  MessagesPage,
  NotificationPage,
  AppNotification,
} from '@/types/chat'

const cursorQuery = (cursor?: string) => (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '')
export const listConversations = (cursor?: string) =>
  request<ConversationPage>({ url: `/me/conversations${cursorQuery(cursor)}` })
// 不从路由或通知推导会话权限；逐页查找当前本人列表中的精确会话。
export async function findConversation(id: string, isCurrent: () => boolean = () => true) {
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    if (!isCurrent()) return null
    const page = await listConversations(cursor)
    if (!isCurrent()) return null
    const conversation = page.items.find((item) => item.id === id)
    if (conversation) return conversation
    if (!page.next_cursor) return null
    if (seen.has(page.next_cursor)) throw new Error('会话列表游标异常，请重新读取')
    seen.add(page.next_cursor)
    cursor = page.next_cursor
  } while (cursor)
  return null
}
export const listMessages = (id: string, afterSeq = 0) =>
  request<MessagesPage>({
    url: `/conversations/${encodeURIComponent(id)}/messages?after_seq=${afterSeq}&limit=50`,
  })
export function sendMessage(
  id: string,
  input: { client_message_id: string; body: string; expected_write_epoch: number },
  key: string,
) {
  return request<MessageAccepted>({
    url: `/conversations/${encodeURIComponent(id)}/messages`,
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
}
export const getMessageStatus = (id: string) =>
  request<MessageStatus>({ url: `/me/messages/${encodeURIComponent(id)}/status` })
export const listNotifications = (cursor?: string) =>
  request<NotificationPage>({ url: `/me/notifications${cursorQuery(cursor)}` })
export const readNotification = (notification: AppNotification, key: string) =>
  request<AppNotification>({
    url: `/me/notifications/${encodeURIComponent(notification.id)}/read`,
    method: 'POST',
    data: { expected_version: notification.version },
    header: { 'Idempotency-Key': key },
  })
