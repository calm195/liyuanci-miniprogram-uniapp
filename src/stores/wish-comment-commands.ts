import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import type { WishComment, WishCommentInput } from '@/types/interactions'

export type CommentCommand = { input: WishCommentInput; key: string; id?: string; version?: number }
export type CommentControlCommand =
  | { kind: 'withdraw'; comment: WishComment; key: string }
  | { kind: 'setting'; wishId: string; version: number; open: boolean; key: string }
export type CommentRecovery = {
  pending: CommentCommand | null
  control: CommentControlCommand | null
}

// 未知写入仅保留在当前会话内存，页面重建可核实原请求；不落盘保存评论正文。
export const useWishCommentCommands = defineStore('wish-comment-commands', () => {
  const user = useUserStore()
  const commands = ref<Record<string, CommentRecovery>>({})
  const clear = () => {
    commands.value = {}
  }
  watch(() => session.getEpoch(), clear, { flush: 'sync' })
  watch(
    () => user.user?.id,
    (next, old) => {
      if (old && next !== old) clear()
    },
    { flush: 'sync' },
  )
  function get(id: string) {
    return commands.value[id] ?? null
  }
  function remove(id: string) {
    delete commands.value[id]
  }
  function save(id: string, value: CommentRecovery) {
    if (!session.getToken() || !user.isLoggedIn) return
    if (!value.pending && !value.control) {
      remove(id)
      return
    }
    commands.value[id] = JSON.parse(JSON.stringify(value)) as CommentRecovery
  }
  return { get, save, remove }
})
