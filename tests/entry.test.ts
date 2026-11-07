import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { loadRuntime } from './support/page-runtime.ts'

async function setup() {
  setActivePinia(createPinia())
  let epoch = 1
  const user = reactive({
    validated: true,
    user: { id: 'guide-owner', verification: 'unverified' },
  })
  let reads = 0
  let resolve: ((value: unknown) => void) | undefined
  let delayed = false
  let ackFails = false
  let ackStatus = 0
  const snapshot = {
    version: 3,
    modules: [{ module: 'wishes', title: '许愿池', body: '发布心愿前先完成认证。' }],
    acknowledged_version: 0,
  }
  const { useEntryStore } = await loadRuntime(
    readFileSync(new URL('../src/stores/entry.ts', import.meta.url), 'utf8'),
    {
      defineStore,
      RequestError: Error,
      useUserStore: () => user,
      session: { getEpoch: () => epoch },
      uni: { showToast() {} },
      getModuleGuide: async () => {
        reads++
        if (delayed)
          return new Promise((done) => {
            resolve = done
          })
        return structuredClone(snapshot)
      },
      acknowledgeGuide: async (version: number) => {
        assert.ok(Number.isSafeInteger(version))
        if (ackStatus) throw Object.assign(new Error('合成版本冲突'), { statusCode: ackStatus })
        if (ackFails) throw new Error('合成断网')
        return { ...snapshot, acknowledged_version: version }
      },
    },
  )
  return {
    store: useEntryStore(),
    user,
    snapshot,
    reads: () => reads,
    delay() {
      delayed = true
    },
    resolve() {
      resolve!(snapshot)
    },
    switchAccount() {
      epoch++
      user.user.id = 'guide-other'
    },
    conflictAck(value: boolean) {
      ackStatus = value ? 409 : 0
    },
    failAck(value: boolean) {
      ackFails = value
    },
  }
}

test('认证后自动展示已发布说明，确认版本按账号保存，个人中心可重读', async () => {
  const s = await setup()
  await s.store.showGuide()
  assert.equal(s.reads(), 0)
  s.user.user.verification = 'verified'
  await s.store.showGuide()
  assert.equal(s.store.guideVisible, true)
  s.failAck(true)
  await s.store.confirmGuide()
  assert.equal(s.store.guideVisible, true)
  assert.match(s.store.error, /重试/)
  s.failAck(false)
  await s.store.confirmGuide()
  assert.equal(s.store.guideVisible, false)
  assert.equal(s.store.guide.acknowledged_version, 3)
  await s.store.showGuide()
  assert.equal(s.reads(), 1)
  await s.store.showGuide(true)
  assert.equal(s.reads(), 2)
  assert.equal(s.store.guideVisible, true)
})

test('说明晚到响应不得跨会话展示，空发布版本保持关闭', async () => {
  const s = await setup()
  s.user.user.verification = 'verified'
  s.delay()
  const pending = s.store.showGuide()
  s.switchAccount()
  s.resolve()
  await pending
  assert.equal(s.store.guide, null)
  assert.equal(s.store.guideVisible, false)
  const empty = await setup()
  empty.user.user.verification = 'verified'
  empty.snapshot.version = 0
  empty.snapshot.modules = []
  await empty.store.showGuide()
  assert.equal(empty.store.guideVisible, false)
})

test('说明接口拒绝损坏版本、超长标题和非纯文本内容', async () => {
  const { parseModuleGuide } = await loadRuntime(
    readFileSync(new URL('../src/api/module-guide.ts', import.meta.url), 'utf8'),
    { request() {} },
  )
  const valid = {
    version: 1,
    acknowledged_version: 0,
    modules: [{ module: 'chat', title: '聊天', body: '发送前请确认内容。' }],
  }
  assert.deepEqual(parseModuleGuide(valid), valid)
  assert.throws(() => parseModuleGuide({ ...valid, version: -1 }))
  assert.throws(() =>
    parseModuleGuide({
      ...valid,
      modules: [{ module: 'chat', title: '字'.repeat(41), body: '说明' }],
    }),
  )
  assert.throws(() =>
    parseModuleGuide({ ...valid, modules: [{ module: 'chat', title: '聊天', body: {} }] }),
  )
})

test('确认期间发布新版说明时重读当前版本，再次确认使用新版本', async () => {
  const s = await setup()
  s.user.user.verification = 'verified'
  await s.store.showGuide()
  s.snapshot.version = 4
  s.conflictAck(true)
  await s.store.confirmGuide()
  assert.equal(s.store.guideVisible, true)
  assert.equal(s.store.guide.version, 4)
  s.conflictAck(false)
  await s.store.confirmGuide()
  assert.equal(s.store.guide.acknowledged_version, 4)
  assert.equal(s.store.guideVisible, false)
})

test('确认回执重放返回较新发布版时，保持展示尚未确认的说明', async () => {
  const s = await setup()
  s.user.user.verification = 'verified'
  await s.store.showGuide()
  s.snapshot.version = 4
  await s.store.confirmGuide()
  assert.equal(s.store.guide.version, 4)
  assert.equal(s.store.guide.acknowledged_version, 3)
  assert.equal(s.store.guideVisible, true)
})
