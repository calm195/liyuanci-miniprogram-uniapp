import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { loadRuntime } from './support/page-runtime.ts'

async function setup() {
  setActivePinia(createPinia())
  const hooks: Record<string, (() => void)[]> = { show: [], hide: [], unload: [], unmount: [] }
  const user = reactive({
    user: null as null | { id: string; verification: string },
    validated: false,
  })
  const events: string[] = []
  let epoch = 1
  const entryModule = await loadRuntime(
    readFileSync(new URL('../src/stores/entry.ts', import.meta.url), 'utf8'),
    {
      defineStore,
      useUserStore: () => user,
      session: { getEpoch: () => 1 },
      RequestError: Error,
      getModuleGuide: async () => ({ version: 0, acknowledged_version: 0, modules: [] }),
      acknowledgeGuide: async () => ({}),
      uni: { $emit: (event: string) => events.push(event) },
    },
  )
  const entry = entryModule.useEntryStore()
  const loginModule = await loadRuntime(
    readFileSync(new URL('../src/composables/use-login.ts', import.meta.url), 'utf8'),
    {
      useEntryStore: () => entry,
      useUserStore: () => user,
      session: { getEpoch: () => epoch, getToken: () => 'synthetic-token' },
      uni: { $emit: (event: string) => events.push(event) },
      onShow: (fn: () => void) => hooks.show!.push(fn),
      onHide: (fn: () => void) => hooks.hide!.push(fn),
      onUnload: (fn: () => void) => hooks.unload!.push(fn),
      onUnmounted: (fn: () => void) => hooks.unmount!.push(fn),
    },
  )
  return { entry, user, events, hooks, gate: loginModule.useLogin(), changeSession: () => epoch++ }
}

test('已登录时离页或换会话，不续接旧页面排队的动作', async () => {
  const s = await setup()
  s.user.user = { id: 'synthetic-a', verification: 'verified' }
  s.user.validated = true
  let continued = 0
  s.gate.requestLogin(() => continued++)
  s.hooks.hide!.forEach((fn) => fn())
  s.hooks.show!.forEach((fn) => fn())
  await Promise.resolve()
  assert.equal(continued, 0)
  s.gate.requestLogin(() => continued++)
  s.changeSession()
  await Promise.resolve()
  assert.equal(continued, 0)
  s.gate.requestLogin(() => continued++)
  await Promise.resolve()
  assert.equal(continued, 1)
})

test('当前页登录成功只续接一次，取消保留当前页面，失败可重试', async () => {
  const s = await setup()
  let continued = 0
  s.gate.requestLogin(() => {
    continued++
  })
  assert.equal(s.entry.loginVisible, true)
  assert.equal(await s.entry.completeLogin(), false)
  assert.equal(continued, 0)
  assert.equal(s.entry.loginVisible, true)
  s.entry.cancelLogin()
  s.user.user = { id: 'synthetic-student', verification: 'unverified' }
  s.user.validated = true
  await s.entry.completeLogin()
  assert.equal(continued, 0)
  s.user.validated = false
  s.gate.requestLogin(() => {
    continued++
  })
  s.user.validated = true
  assert.equal(await s.entry.completeLogin(), true)
  await s.entry.completeLogin()
  assert.equal(continued, 1)
  assert.equal(s.entry.loginVisible, false)
  assert.ok(s.events.includes('auth:ready'))
})

test('登录等待中离开再返回及换账号不续接旧动作', async () => {
  const s = await setup()
  let continued = 0
  s.gate.requestLogin(() => {
    continued++
  })
  s.hooks.hide!.forEach((fn) => fn())
  s.hooks.show!.forEach((fn) => fn())
  s.user.user = { id: 'synthetic-a', verification: 'verified' }
  s.user.validated = true
  await s.entry.completeLogin()
  assert.equal(continued, 0)
  s.user.validated = false
  s.gate.requestLogin(() => {
    continued++
  })
  s.user.user = { id: 'synthetic-b', verification: 'verified' }
  s.user.validated = true
  await s.entry.completeLogin()
  assert.equal(continued, 0)
})

test('登录续接完成目标读取后再刷新页面，重复完成不重放续接', async () => {
  const s = await setup()
  let finish!: () => void
  let reads = 0
  s.gate.requestLogin(async () => {
    reads++
    await new Promise<void>((resolve) => {
      finish = resolve
    })
  })
  s.user.user = { id: 'synthetic-student', verification: 'verified' }
  s.user.validated = true
  const completing = s.entry.completeLogin()
  assert.equal(reads, 1)
  assert.deepEqual(s.events, [])
  finish()
  await completing
  assert.deepEqual(s.events, ['auth:ready'])
  await s.entry.completeLogin()
  assert.equal(reads, 1)
})
