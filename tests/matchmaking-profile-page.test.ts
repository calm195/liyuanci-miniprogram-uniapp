import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import { matchmakingID } from '../src/utils/matchmaking.ts'

async function setup(fail = false) {
  const form = ref({ preferred_campuses: [] as string[], preferred_mbti: [] as string[] })
  const dirty = ref(false),
    pending = ref<null | { key: string }>(null),
    error = ref('')
  const saved: unknown[] = [],
    navigation: string[] = []
  const hooks: Record<string, (query?: Record<string, string>) => unknown> = {}
  const runtime = await loadRuntime(
    pageScript(new URL('../src/pages/matchmaking/profile.vue', import.meta.url)) +
      '\nexport { edit,saveForm,returnToActivity,activity }',
    {
      matchmakingID,
      useMatchmakingProfile: () => ({
        page: {
          user: { validated: true, user: { nickname: '合成昵称' }, refresh: async () => {} },
          busy: ref(false),
          writing: ref(false),
          pending,
          error,
          notice: ref(''),
          gate: ref(''),
          actionTicket: () => () => true,
        },
        traitSelections: ref([]),
        personalTraitSelections: ref([]),
        form,
        locked: ref(false),
        dirty,
        save: async (manual: boolean) => {
          if (!dirty.value && !pending.value) return
          saved.push({ manual, ...form.value })
          if (fail) {
            pending.value = { key: 'original-request' }
            error.value = '结果未知'
          } else {
            dirty.value = false
            pending.value = null
            error.value = ''
          }
        },
        refreshDraft: async () => {},
        load: async () => {},
      }),
      onLoad: (fn: () => unknown) => {
        hooks.load = fn
      },
      onShow: (fn: () => unknown) => {
        hooks.show = fn
      },
      onHide: (fn: () => unknown) => {
        hooks.hide = fn
      },
      onUnload: (fn: () => unknown) => {
        hooks.unload = fn
      },
      uni: {
        navigateBack: ({ fail }: { fail: () => void }) => fail(),
        redirectTo: ({ url }: { url: string }) => navigation.push(url),
      },
    },
  )
  const activity = '10000000-0000-4000-8000-000000000001'
  hooks.load?.({ activity })
  hooks.show?.()
  await settle()
  return { runtime, form, dirty, pending, saved, navigation, hooks, activity }
}
test('独立包分配资料页自动保存偏好，保存后返回原活动', async () => {
  const s = await setup()
  s.dirty.value = true
  s.runtime.edit({ preferred_campuses: ['wushan'], preferred_mbti: ['INFP'] })
  await new Promise((resolve) => setTimeout(resolve, 650))
  assert.deepEqual(s.saved, [
    { manual: false, preferred_campuses: ['wushan'], preferred_mbti: ['INFP'] },
  ])
  await s.runtime.returnToActivity()
  assert.deepEqual(s.navigation, [`/pages/matchmaking/detail?id=${s.activity}`])
})
test('独立包分配资料页保存结果未知时阻止返回，允许手动重试', async () => {
  const s = await setup(true)
  s.dirty.value = true
  await s.runtime.returnToActivity()
  assert.deepEqual(s.navigation, [])
  assert.equal(s.pending.value?.key, 'original-request')
  await s.runtime.saveForm()
  assert.equal(s.saved.length, 2)
  assert.equal(s.pending.value?.key, 'original-request')
})
