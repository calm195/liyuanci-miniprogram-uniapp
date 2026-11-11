import { computed, ref } from 'vue'
import { getMatchmakingAccountProfile } from '@/api/matchmaking'
import { useMatchmakingPage } from '@/composables/use-matchmaking-page'
import { matchmakingKey, parseMatchmakingPreferences } from '@/utils/matchmaking'
import type { MatchmakingPreferences, MatchmakingTraitSelection } from '@/types/matchmaking'

export function useMatchmakingProfile() {
  const profileScope = 'account-profile'
  const version = ref(0)
  const saved = ref('')
  const traitSelections = ref<MatchmakingTraitSelection[]>([])
  const personalTraitSelections = computed(() =>
    traitSelections.value.filter((item) => item.purpose === 'personal'),
  )
  const idealTraitSelections = computed(() =>
    traitSelections.value.filter((item) => (item.purpose ?? 'ideal') === 'ideal'),
  )
  const form = ref<MatchmakingPreferences | null>(null)
  const rejectedTraits = new Set<string>()
  const page = useMatchmakingPage(
    () => {
      form.value = null
      version.value = 0
      saved.value = ''
      traitSelections.value = []
      rejectedTraits.clear()
    },
    () => profileScope,
    false,
  )
  const { busy, writing, pending, error } = page
  const locked = computed(() => busy.value || writing.value || !!pending.value)

  const dirty = computed(() => !!form.value && JSON.stringify(form.value) !== saved.value)

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
      ideal_traits: [],
      personal_traits: [],
    }
  }
  // 刷新与写入回读后仍可保留新输入，但明确驳回的旧标签不能随草稿恢复。
  function withoutRejected(draft: MatchmakingPreferences): MatchmakingPreferences {
    return {
      ...draft,
      ...(draft.ideal_traits === undefined
        ? {}
        : { ideal_traits: draft.ideal_traits.filter((name) => !rejectedTraits.has(name)) }),
      ...(draft.personal_traits === undefined
        ? {}
        : { personal_traits: draft.personal_traits.filter((name) => !rejectedTraits.has(name)) }),
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
      // 仅使用明确的审核结论，不把响应中缺少的词条误认为驳回，以免丢失新输入。
      for (const item of result.trait_selections ?? []) {
        if (item.status === 'rejected') rejectedTraits.add(item.name)
        else rejectedTraits.delete(item.name)
      }
      // 兼容旧服务返回的驳回词条；已驳回的选择不再进入表单或后续保存。
      traitSelections.value = (result.trait_selections ?? []).filter(
        (item) => item.status !== 'rejected',
      )
      if (result.trait_selections) {
        form.value.ideal_traits = idealTraitSelections.value.map((item) => item.name)
        form.value.personal_traits = personalTraitSelections.value.map((item) => item.name)
      } else {
        form.value.personal_traits ??= []
      }
      saved.value = JSON.stringify(form.value)
    })
  }
  async function refreshDraft() {
    if (locked.value) return
    const draft = dirty.value ? form.value : null
    const active = page.actionTicket()
    await load()
    if (active() && form.value && draft && !pending.value) form.value = withoutRejected(draft)
  }
  async function save(manual: boolean) {
    const active = page.actionTicket()
    async function reloadAfterSave(submitted: string) {
      const newer = JSON.stringify(form.value) !== submitted ? form.value : null
      await load()
      if (active() && form.value && newer) form.value = withoutRejected(newer)
    }
    if (pending.value?.kind === 'profile' && manual) {
      const submitted = JSON.stringify(pending.value.input.profile)
      await page.retry(() => reloadAfterSave(submitted))
      if (!active() || error.value) return
    }
    if (!form.value || !dirty.value || locked.value) return
    const submitted = JSON.stringify(form.value)
    try {
      const profile = parseMatchmakingPreferences(withoutRejected(form.value))
      await page.write(
        {
          kind: 'profile',
          activityId: profileScope,
          key: matchmakingKey(),
          input: { expected_version: version.value, profile },
        },
        () => reloadAfterSave(submitted),
      )
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '请检查包分配资料。'
    }
  }
  return {
    page,
    traitSelections: idealTraitSelections,
    personalTraitSelections,
    form,
    locked,
    dirty,
    save,
    refreshDraft,
    load,
  }
}
