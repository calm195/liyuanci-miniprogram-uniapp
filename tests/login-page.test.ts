import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript } from './support/page-runtime.ts'

async function setup() {
  const hooks: Record<string, () => void> = {}
  let resolve!: () => void
  let calls = 0
  let navigations = 0
  const entry = reactive({ loginVisible: true, clear() {}, async showGuide() {} })
  const user = reactive({
    busy: false,
    isLoggedIn: false,
    validated: false,
    async login() {
      if (user.busy) return
      calls++
      user.busy = true
      await new Promise<void>((done) => (resolve = done))
      user.isLoggedIn = true
      user.validated = true
      user.busy = false
    },
  })
  Object.assign(globalThis, { uni: { reLaunch: () => navigations++ } })
  const page = await loadRuntime(
    pageScript(new URL('../src/components/EntryPrompts.vue', import.meta.url)) +
      '\nexport { login, loginError };',
    {
      config: { useMock: false },
      defineProps: () => ({}),
      defineEmits: () => () => {},
      useEntryStore: () => entry,
      useUserStore: () => user,
      onShow: (fn: () => void) => (hooks.show = fn),
      onHide: (fn: () => void) => (hooks.hide = fn),
      onUnload: (fn: () => void) => (hooks.unload = fn),
    },
  )
  hooks.show?.()
  return {
    page,
    entry,
    hooks,
    user,
    resolve: () => resolve(),
    calls: () => calls,
    navigations: () => navigations,
  }
}

test('登录弹窗重复点击串行，完成后保留当前深链页面', async () => {
  const s = await setup()
  const pending = s.page.login()
  await s.page.login()
  assert.equal(s.calls(), 1)
  assert.equal(s.navigations(), 0)
  s.resolve()
  await pending
  assert.equal(s.navigations(), 0)
  assert.equal(s.entry.loginVisible, false)
})

test('REQ-002/018：登录中离开再返回，旧响应不能导航或恢复旧错误', async () => {
  const s = await setup()
  const pending = s.page.login()
  s.hooks.hide?.()
  s.hooks.show?.()
  s.resolve()
  await pending
  assert.equal(s.navigations(), 0)
  assert.equal(s.page.loginError.value, '')
})
