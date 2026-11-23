import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import type { WishLifecycleAction } from '@/api/wishes'

type Owner = { owner: string; epoch: number; key: string }
export type WishActionRecovery = Owner & {
  kind: 'wish'
  wish: { id: string; version: number }
  action: WishLifecycleAction
  rollback?: { target: 'matching' | 'published'; refresh_expiry: boolean }
}
export type ApplicationSubmitRecovery = Owner & {
  kind: 'apply'
  id: string
  version: number
  message: string
}
export type ApplicationManageRecovery = Owner & {
  kind: 'accept' | 'withdraw'
  application: { id: string; version: number }
  wishVersion?: number
}
export type ActionRecovery =
  WishActionRecovery | ApplicationSubmitRecovery | ApplicationManageRecovery

// 仅在本次账号会话的内存中保留原请求，页面重建可核实，退出或换会话即清除。
export const useActionRecoveryStore = defineStore('action-recovery', () => {
  const user = useUserStore()
  const commands = ref<Record<string, ActionRecovery>>({})
  function clear() {
    commands.value = {}
  }
  watch(() => session.getEpoch(), clear, { flush: 'sync' })
  watch(
    () => user.user?.id,
    (next, previous) => {
      if (previous && next !== previous) clear()
    },
    { flush: 'sync' },
  )
  function get(id: string) {
    const command = commands.value[id]
    return command && command.epoch === session.getEpoch() && command.owner === user.user?.id
      ? command
      : null
  }
  function save(id: string, command: ActionRecovery) {
    const existing = get(id)
    if (
      !session.getToken() ||
      !user.validated ||
      command.owner !== user.user?.id ||
      command.epoch !== session.getEpoch() ||
      (existing !== null && JSON.stringify(existing) !== JSON.stringify(command))
    )
      return false
    commands.value[id] = JSON.parse(JSON.stringify(command)) as ActionRecovery
    return true
  }
  function remove(id: string, key: string) {
    if (commands.value[id]?.key === key) delete commands.value[id]
  }
  return { get, save, remove }
})
