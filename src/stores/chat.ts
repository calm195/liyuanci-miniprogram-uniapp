import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import type { MessageAccepted, MessageStatus } from '@/types/chat'

// 跨页面只保留本次会话的发送回执与审核状态，不保存正文、令牌或长期缓存。
export const useChatStore = defineStore('chat', () => {
  const user = useUserStore()
  const receipts = ref<Record<string, MessageStatus[]>>({})
  let owner = ''
  let epoch = -1
  function clear() {
    receipts.value = {}
    owner = ''
    epoch = -1
  }
  function syncSession() {
    if (owner !== (user.user?.id || '') || epoch !== session.getEpoch()) {
      clear()
      owner = user.user?.id || ''
      epoch = session.getEpoch()
    }
  }
  function track(conversationId: string, accepted: MessageAccepted) {
    syncSession()
    const values = receipts.value[conversationId] || []
    if (!values.some((item) => item.message_id === accepted.message_id))
      receipts.value[conversationId] = [
        ...values,
        { message_id: accepted.message_id, status: 'pending', delivery_seq: null },
      ]
  }
  function update(conversationId: string, status: MessageStatus) {
    syncSession()
    const values = receipts.value[conversationId] || []
    receipts.value[conversationId] = values.map((item) =>
      item.message_id === status.message_id ? status : item,
    )
  }
  function remove(conversationId: string, id: string) {
    syncSession()
    receipts.value[conversationId] = (receipts.value[conversationId] || []).filter(
      (item) => item.message_id !== id,
    )
  }
  function forget(conversationId: string) {
    syncSession()
    delete receipts.value[conversationId]
  }
  watch([() => user.user?.id, () => session.getEpoch()], clear, { flush: 'sync' })
  return { receipts, syncSession, track, update, remove, forget }
})
