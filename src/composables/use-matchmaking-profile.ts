import { computed, ref } from 'vue'
import { getMatchmakingAccountProfile } from '@/api/matchmaking'
import { useMatchmakingPage } from '@/composables/use-matchmaking-page'
import { matchmakingKey, parseMatchmakingPreferences } from '@/utils/matchmaking'
import type { MatchmakingPreferences } from '@/types/matchmaking'

export function useMatchmakingProfile() {
  const profileScope = 'account-profile'
  const version = ref(0)
  const form = ref<MatchmakingPreferences | null>(null)
  const page = useMatchmakingPage(
    () => {
      form.value = null
      version.value = 0
    },
    () => profileScope,
    false,
  )
  const { busy, writing, pending, error } = page
  const locked = computed(() => busy.value || writing.value || !!pending.value)

  function initialPreferences(): MatchmakingPreferences {
    return {
      age: 0,
      age_min: 18,
      age_max: 30,
      height: 0,
      height_min: 150,
      height_max: 200,
      weight: 0,
      weight_min: 80,
      weight_max: 180,
      wechat: '',
      introduction: '',
    }
  }
  async function load() {
    await page.read(async (active) => {
      const command = pending.value
      if (command?.kind === 'profile') {
        version.value = command.input.expected_version
        form.value = { ...command.input.profile }
        return
      }
      const result = await getMatchmakingAccountProfile()
      if (!active()) return
      version.value = result.version
      form.value = result.profile
        ? parseMatchmakingPreferences(result.profile)
        : initialPreferences()
    })
  }
  async function save() {
    if (!form.value || locked.value) return
    try {
      const profile = parseMatchmakingPreferences(form.value)
      await page.write(
        {
          kind: 'profile',
          activityId: profileScope,
          key: matchmakingKey(),
          input: { expected_version: version.value, profile },
        },
        load,
      )
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '请检查个人资料。'
    }
  }
  return {
    page,
    form,
    locked,
    save,
    load,
  }
}
