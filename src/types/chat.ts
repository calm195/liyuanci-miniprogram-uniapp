export interface Conversation {
  id: string
  version: number
  can_write: boolean
  write_epoch: number
}
export interface ConversationPage {
  items: Conversation[]
  next_cursor: string | null
}
// 服务端返回的原始消息：时间字段是带时区标记的 UTC 字符串，只在接口层流转。
export interface RawDeliveredMessage {
  viewer_is_sender?: boolean
  message_id: string
  delivery_seq: number
  submitted_at: string
  delivered_at: string
  body: string
}
export interface RawMessagesPage {
  items: RawDeliveredMessage[]
  next_after_seq: number
}
// 页面使用的消息：展示文本已在接口层换算为北京时间，原始值另存供比较与计算。
export interface DeliveredMessage {
  viewer_is_sender?: boolean
  message_id: string
  delivery_seq: number
  body: string
  submittedAtText: string
  submittedAtRaw: string
  deliveredAtText: string
  deliveredAtRaw: string
}
export interface MessagesPage {
  items: DeliveredMessage[]
  next_after_seq: number
}
export interface MessageAccepted {
  message_id: string
  status: 'pending_scan'
  delivery_seq: null
}
export interface MessageStatus {
  message_id: string
  status: 'pending' | 'rejected' | 'cancelled' | 'delivered'
  delivery_seq: number | null
  review_result?: {
    decision: 'pending' | 'approved' | 'rejected'
    content_version: number
    reason?: string
    revision_suggestion?: string
  }
}
export interface AppNotification {
  id: string
  version: number
  kind: string
  read: boolean
  target_ref?: string
  notice?: string
}
export interface NotificationPage {
  items: AppNotification[]
  next_cursor: string | null
}
export const messageStatusLabels = {
  pending: '审核中，尚未送达',
  rejected: '审核未通过',
  cancelled: '已取消，不会重新送达',
  delivered: '已送达',
} as const
