import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { reactive, ref } from 'vue'
import { createPinia, defineStore } from 'pinia'
import { loadRuntime, profileDraftStore, settle } from './support/page-runtime.ts'
import { parseMatchmakingPreferences } from '../src/utils/matchmaking.ts'

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const preferences = {
  age: 21,
  age_min: 18,
  age_max: 25,
  height: 175,
  height_min: 150,
  height_max: 190,
  weight: 130,
  weight_min: 90,
  weight_max: 160,
  wechat: '',
  introduction: '原有资料',
  ideal_traits: [],
  personal_traits: [],
  preferred_campuses: [],
  preferred_mbti: [],
}

test('包分配保存中继续编辑后离页，重建页面仍保留较新草稿且只原样重试未知请求', async () => {
  const epoch = ref(1)
  const session = { getEpoch: () => epoch.value, getToken: () => 'synthetic-token' }
  const user = reactive({
    user: { id: 'synthetic-owner', verification: 'verified', penalty_notice: '' },
    validated: true,
  })
  const pinia = createPinia()
  const stores = await loadRuntime(source('stores/matchmaking.ts'), {
    defineStore,
    session,
    useUserStore: () => user,
  })
  const useMatchmakingStore = () => stores.useMatchmakingStore(pinia)
  const useProfileDraftStore = await profileDraftStore({ session, user })
  const writes: unknown[] = []
  let release: (() => void) | undefined
  let saved = { ...preferences }
  let version = 1
  let slow = true
  let failRead = false
  const writeMatchmaking = async (command: { input: { profile: typeof preferences } }) => {
    writes.push(JSON.parse(JSON.stringify(command)))
    if (slow)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    saved = JSON.parse(JSON.stringify(command.input.profile))
    version++
  }
  async function page() {
    const hooks: { show: (() => void)[]; hide: (() => void)[]; unload: (() => void)[] } = {
      show: [],
      hide: [],
      unload: [],
    }
    const lifecycle = {
      onShow: (fn: () => void) => hooks.show.push(fn),
      onHide: (fn: () => void) => hooks.hide.push(fn),
      onUnload: (fn: () => void) => hooks.unload.push(fn),
    }
    const scope = await loadRuntime(source('composables/use-matchmaking-page.ts'), {
      ...lifecycle,
      session,
      config: { useMock: false },
      useUserStore: () => user,
      useMatchmakingStore,
      writeMatchmaking,
      RequestError: class extends Error {},
    })
    const module = await loadRuntime(source('composables/use-matchmaking-profile.ts'), {
      ...lifecycle,
      ...scope,
      useProfileDraftStore,
      parseMatchmakingPreferences,
      matchmakingKey: () => `key-${writes.length}`,
      getMatchmakingAccountProfile: async () => {
        if (failRead) throw new Error('合成回读失败')
        return { version, profile: structuredClone(saved) }
      },
    })
    const editor = module.useMatchmakingProfile()
    hooks.show.forEach((fn) => fn())
    await editor.load()
    return {
      editor,
      hide: () => hooks.hide.forEach((fn) => fn()),
      unload: () => hooks.unload.forEach((fn) => fn()),
    }
  }
  const first = await page()
  first.editor.form.value.introduction = '提交中的资料'
  const inFlight = first.editor.save(true)
  await settle()
  first.editor.form.value.introduction = '提交期间更新的资料'
  first.hide()
  first.unload()
  release?.()
  await inFlight
  assert.equal(first.editor.form.value, null)
  const next = await page()
  assert.equal(next.editor.form.value.introduction, '提交期间更新的资料')
  assert.equal(next.editor.page.pending.value.key, 'key-0')
  await next.editor.save(false)
  assert.equal(writes.length, 1)
  slow = false
  await next.editor.save(true)
  assert.deepEqual(writes[1], writes[0])
  assert.equal(
    writes.length,
    3,
    JSON.stringify({
      error: next.editor.page.error.value,
      dirty: next.editor.dirty.value,
      form: next.editor.form.value,
      saved,
    }),
  )
  assert.equal(
    (writes[2] as { input: { profile: { introduction: string } } }).input.profile.introduction,
    '提交期间更新的资料',
  )
  assert.equal(saved.introduction, '提交期间更新的资料')
  assert.equal(useProfileDraftStore().readMatchmaking(), null)
  // 提交成功后回读失败也保留保存期间较新输入，刷新可恢复。
  next.editor.form.value.introduction = '第二轮提交'
  slow = true
  const secondSave = next.editor.save(true)
  await settle()
  next.editor.form.value.introduction = '回读失败仍需保留的资料'
  failRead = true
  release?.()
  await secondSave
  assert.equal(next.editor.form.value, null)
  assert.equal(useProfileDraftStore().readMatchmaking().introduction, '回读失败仍需保留的资料')
  failRead = false
  await next.editor.load()
  assert.equal(next.editor.form.value.introduction, '回读失败仍需保留的资料')
  assert.equal(next.editor.dirty.value, true)
})

test('账号内存草稿与未知请求按账号和会话代次隔离', async () => {
  const epoch = ref(1)
  const user = reactive({ user: { id: 'first' } as { id: string } | null })
  const store = (
    await profileDraftStore({
      session: { getEpoch: () => epoch.value, getToken: () => 'synthetic-token' },
      user,
    })
  )()
  const pending = {
    input: { nickname: '本人', hide_identity_tags: false, expected_version: 1 },
    key: 'original-key',
  }
  store.saveCommon({ values: { enrollment_year: 2025 }, pending })
  store.saveMatchmaking(preferences)
  assert.equal(store.readCommon().pending.key, 'original-key')
  user.user = { id: 'second' }
  assert.equal(store.readCommon(), null)
  assert.equal(store.readMatchmaking(), null)
  store.saveMatchmaking(preferences)
  epoch.value++
  assert.equal(store.readMatchmaking(), null)
})
