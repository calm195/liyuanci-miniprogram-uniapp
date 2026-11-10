import { computed, ref } from 'vue'
import { getMatchmakingAccountProfile } from '@/api/matchmaking'
import { useMatchmakingPage } from '@/composables/use-matchmaking-page'
import { matchmakingKey, matchmakingMbtis, parseMatchmakingProfileDraft } from '@/utils/matchmaking'
import type { MatchmakingProfileDraft } from '@/types/matchmaking'

export function useMatchmakingProfile() {
  const profileScope = 'account-profile'
  const version = ref(0)
  const form = ref<MatchmakingProfileDraft | null>(null)
  const page = useMatchmakingPage(
    () => {
      form.value = null
      version.value = 0
    },
    () => profileScope,
    false,
  )
  const { user, busy, writing, pending, error, notice } = page
  const grades = computed(() => user.user?.grade_options ?? [])
  const locked = computed(() => busy.value || writing.value || !!pending.value)
  const types = ['', ...matchmakingMbtis]
  const typeLabels = ['未设置', ...matchmakingMbtis]
  const assessmentURL = 'https://www.16personalities.com/ch/人格测试'

  function initialProfile(): MatchmakingProfileDraft {
    const identity = user.user?.identity_tags
    const gender = identity?.gender
    const campus = identity?.campus
    return {
      name: (user.user?.nickname ?? '').slice(0, 32),
      gender: gender === 'female' || gender === 'male' ? gender : '',
      education: '',
      grade: identity?.grade ?? '',
      campus:
        campus === 'wushan' || campus === 'university_town' || campus === 'international'
          ? campus
          : '',
      mbti: '',
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
      consent: false,
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
      form.value = result.profile ?? initialProfile()
    })
  }
  function selectPersonality(event: { detail: { value: string | number } }) {
    const mbti = types[Number(event.detail.value)]
    if (!locked.value && form.value && mbti !== undefined) form.value = { ...form.value, mbti }
  }
  function copyAssessment() {
    const current = page.actionTicket()
    uni.setClipboardData({
      data: assessmentURL,
      showToast: false,
      success: () => {
        if (current()) notice.value = '链接已复制，可在浏览器中打开。'
      },
      fail: () => {
        if (current()) error.value = '复制失败，可长按选中网址。'
      },
    })
  }
  async function save() {
    if (!form.value || locked.value) return
    try {
      const profile = parseMatchmakingProfileDraft({ ...form.value, consent: false })
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
    grades,
    locked,
    types,
    typeLabels,
    assessmentURL,
    selectPersonality,
    copyAssessment,
    save,
    load,
  }
}
