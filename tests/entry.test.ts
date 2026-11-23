import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { loadRuntime } from './support/page-runtime.ts'

async function setup() {
  setActivePinia(createPinia())
  const sessionState = reactive({ epoch: 1 })
  const user = reactive({
    validated: true,
    user: { id: 'guide-owner', verification: 'unverified' },
  })
  let reads = 0
  const readResolvers: ((value: unknown) => void)[] = []
  const ackResolvers: ((value: unknown) => void)[] = []
  let delayed = false
  let delayAck = false
  let ackFails = false
  let ackStatus = 0
  const acknowledgements: { version: number; key: string }[] = []
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
      session: { getEpoch: () => sessionState.epoch },
      uni: { showToast() {} },
      getModuleGuide: async () => {
        reads++
        if (delayed)
          return new Promise((done) => {
            readResolvers.push(done)
          })
        return structuredClone(snapshot)
      },
      acknowledgeGuide: async (version: number, key: string) => {
        assert.ok(Number.isSafeInteger(version))
        acknowledgements.push({ version, key })
        if (ackStatus) throw Object.assign(new Error('合成版本冲突'), { statusCode: ackStatus })
        if (ackFails) throw new Error('合成断网')
        if (delayAck)
          return new Promise((done) => {
            ackResolvers.push(done)
          })
        return { ...snapshot, acknowledged_version: version }
      },
    },
  )
  return {
    store: useEntryStore(),
    user,
    snapshot,
    acknowledgements,
    reads: () => reads,
    delay() {
      delayed = true
    },
    resolve() {
      readResolvers.shift()!(structuredClone(snapshot))
    },
    delayAck() {
      delayAck = true
    },
    resolveAck(version: number) {
      ackResolvers.shift()!({ ...structuredClone(snapshot), acknowledged_version: version })
    },
    switchAccount() {
      sessionState.epoch++
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
  assert.deepEqual(s.acknowledgements[0], s.acknowledgements[1])
  await s.store.showGuide()
  assert.equal(s.reads(), 1)
  await s.store.showGuide(true)
  assert.equal(s.reads(), 2)
  assert.equal(s.store.guideVisible, true)
})

test('换会话后旧确认和读取返回不能解除新请求的忙状态', async () => {
  const s = await setup()
  s.user.user.verification = 'verified'
  await s.store.showGuide()
  s.delayAck()
  const oldAck = s.store.confirmGuide()
  s.switchAccount()
  await s.store.showGuide()
  const newAck = s.store.confirmGuide()
  s.resolveAck(3)
  await oldAck
  assert.equal(s.store.busy, true)
  s.resolveAck(3)
  await newAck
  assert.equal(s.store.busy, false)

  s.delay()
  const oldRead = s.store.showGuide(true)
  s.store.clear()
  const newRead = s.store.showGuide(true)
  s.resolve()
  await oldRead
  assert.equal(s.store.busy, true)
  assert.equal(s.store.guide, null)
  s.resolve()
  await newRead
  assert.equal(s.store.busy, false)
  assert.equal(s.store.guide.version, 3)
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
  assert.equal(s.acknowledgements[0]!.version, 3)
  assert.equal(s.acknowledgements[1]!.version, 4)
  assert.notEqual(s.acknowledgements[0]!.key, s.acknowledgements[1]!.key)
})

test('确认结果未知后换会话，不将旧账号的原请求用于新账号', async () => {
  const s = await setup()
  s.user.user.verification = 'verified'
  await s.store.showGuide()
  s.failAck(true)
  await s.store.confirmGuide()
  s.switchAccount()
  s.failAck(false)
  await s.store.showGuide(true)
  await s.store.confirmGuide()
  assert.equal(s.acknowledgements.length, 2)
  assert.notEqual(s.acknowledgements[0]!.key, s.acknowledgements[1]!.key)
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
