import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import type { MatchmakingCommand } from '@/types/matchmaking'

// 只保存在当前账号的内存中；页面退出不丢失未知结果，也不把个人资料写入本机存储。
export const useMatchmakingStore = defineStore('matchmaking', () => {
  const user = useUserStore()
  const commands = ref<Record<string, MatchmakingCommand>>({})
  function clearAll() {
    commands.value = {}
  }
  watch(() => session.getEpoch(), clearAll, { flush: 'sync' })
  watch(
    () => user.user?.id,
    (next, previous) => {
      if (previous && next !== previous) clearAll()
    },
    { flush: 'sync' },
  )
  function get(activityId: string): MatchmakingCommand | null {
    return commands.value[activityId] ?? null
  }
  function save(command: MatchmakingCommand) {
    if (!session.getToken() || !user.validated || !user.user || get(command.activityId)) return
    if (command.kind === 'profile')
      commands.value[command.activityId] = {
        ...command,
        input: { ...command.input, profile: { ...command.input.profile } },
      }
    else if (command.kind === 'withdraw')
      commands.value[command.activityId] = { ...command, input: { ...command.input } }
    else if (command.kind === 'enroll')
      commands.value[command.activityId] = { ...command, input: { ...command.input } }
    else commands.value[command.activityId] = { ...command, input: {} }
  }
  function remove(activityId: string) {
    delete commands.value[activityId]
  }
  return { get, save, remove }
})
