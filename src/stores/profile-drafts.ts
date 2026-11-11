import { defineStore } from 'pinia'
import { watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import type { MatchmakingPreferences } from '@/types/matchmaking'
import type { ProfileUpdate } from '@/types/settings'

export interface CommonProfileDraft {
  values: Partial<ProfileUpdate>
  pending: { input: ProfileUpdate; key: string } | null
}

// 草稿与未知结果只保存在当前账号内存中；页面销毁仍可恢复，退出会话立即清除。
export const useProfileDraftStore = defineStore('profile-drafts', () => {
  const user = useUserStore()
  let common: CommonProfileDraft | null = null
  let matchmaking: MatchmakingPreferences | null = null
  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }
  function clear() {
    common = null
    matchmaking = null
  }
  watch(() => session.getEpoch(), clear, { flush: 'sync' })
  watch(
    () => user.user?.id,
    (next, previous) => {
      if (previous && next !== previous) clear()
    },
    { flush: 'sync' },
  )
  return {
    readCommon: () => (common ? clone(common) : null),
    saveCommon: (value: CommonProfileDraft | null) => {
      common = value && session.getToken() && user.user ? clone(value) : null
    },
    readMatchmaking: () => (matchmaking ? clone(matchmaking) : null),
    saveMatchmaking: (value: MatchmakingPreferences | null) => {
      matchmaking = value && session.getToken() && user.user ? clone(value) : null
    },
  }
})
