import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import type { ModuleConfig, Workspace } from '@/types/whispers'

// 只共享配置与本人动作，不跨页面保存正文、草稿或重试请求。
export const useWhispersStore = defineStore('whispers', () => {
  const user = useUserStore()
  const config = ref<ModuleConfig | null>(null)
  const workspace = ref<Workspace | null>(null)
  let generation = 0
  function clear() {
    generation++
    config.value = null
    workspace.value = null
  }
  async function refresh(includeWorkspace = true) {
    const current = ++generation
    const epoch = session.getEpoch()
    config.value = null
    workspace.value = null
    const active = () => current === generation && epoch === session.getEpoch()
    const result = await callWhisper('whisperConfigGet', {})
    if (!active()) return
    config.value = result
    if (!includeWorkspace || !session.getToken() || !result.enabled) return
    const own = await callWhisper('whisperWorkspaceGet', {})
    if (active()) workspace.value = own
  }
  watch([() => session.getEpoch(), () => user.user?.id], clear, { flush: 'sync' })
  return { config, workspace, refresh, clear }
})
