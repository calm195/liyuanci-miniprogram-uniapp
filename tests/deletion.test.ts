import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import {
  canDeleteAccount,
  validDeletionReceipt,
  deletionAccepted,
  deletionStatus,
} from '../src/utils/deletion.ts'

const actor = {
  id: 'synthetic-owner',
  version: 8,
  verification: 'unverified' as const,
  allowed_actions: ['postMeDeletionRequests'],
  penalty_notice: '合成受限状态',
}
const accepted = {
  deletion_receipt: 'synthetic-job.synthetic-authentication',
  status: 'processing',
}
type Input = {
  url: string
  method?: string
  auth?: boolean
  data?: unknown
  header?: Record<string, string>
}
class RequestError extends Error {
  statusCode: number
  constructor(statusCode: number) {
    super('合成失败')
    this.statusCode = statusCode
  }
}
async function setup() {
  setActivePinia(createPinia())
  let epoch = 1
  let token = 'synthetic-token'
  let clears = 0
  const user = reactive({
    user: structuredClone(actor) as typeof actor | null,
    validated: true,
    isLoggedIn: true,
    refresh: async () => {},
    clearSession: () => {
      clears++
      epoch++
      token = ''
      user.user = null
      user.validated = false
      user.isLoggedIn = false
    },
  })
  const config = { useMock: false }
  const session = { getEpoch: () => epoch, getToken: () => token }
  const calls: Input[] = []
  let transport: (input: Input) => Promise<unknown> = async (input) =>
    input.method === 'POST' ? accepted : { status: 'processing' }
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/deletion.ts', import.meta.url), 'utf8'),
    {
      request: async (input: Input) => {
        calls.push(input)
        return transport(input)
      },
    },
  )
  const module = await loadRuntime(
    readFileSync(new URL('../src/stores/deletion.ts', import.meta.url), 'utf8'),
    {
      defineStore,
      useUserStore: () => user,
      config,
      session,
      RequestError,
      ...api,
      canDeleteAccount,
      validDeletionReceipt,
      deletionAccepted,
      deletionStatus,
    },
  )
  const store = module.useDeletionStore()
  return {
    store,
    user,
    calls,
    config,
    session,
    clears: () => clears,
    epoch: () => {
      epoch++
    },
    transport: (fn: typeof transport) => {
      transport = fn
    },
  }
}
test('REQ-018：注销使用本人账号版本及受限动作，不要求学生认证；回执和状态严格投影', () => {
  assert.equal(canDeleteAccount(actor, true), true)
  assert.equal(canDeleteAccount({ ...actor, allowed_actions: [] }, true), false)
  assert.equal(canDeleteAccount(actor, false), false)
  assert.equal(canDeleteAccount({ ...actor, version: 0 }, true), false)
  for (const value of ['', '..', 'a/b', 'a?token=private', 'a#b', 'a b'])
    assert.equal(validDeletionReceipt(value), false)
  assert.equal(
    deletionAccepted(accepted as Parameters<typeof deletionAccepted>[0]),
    accepted.deletion_receipt,
  )
  assert.throws(() =>
    deletionAccepted({ ...accepted, status: 'completed' } as unknown as Parameters<
      typeof deletionAccepted
    >[0]),
  )
  assert.deepEqual(
    deletionStatus({ status: 'processing', retryable_error: 'synthetic-internal-code' }),
    { status: 'processing', retryable_error: 'retry_pending' },
  )
  assert.throws(() =>
    deletionStatus({ status: 'failed' } as unknown as Parameters<typeof deletionStatus>[0]),
  )
})
test('REQ-018：受理只称processing，立即清理本地会话；回执查询无账号认证', async () => {
  const h = await setup()
  await h.store.submit(actor.id, 1, actor.version)
  assert.equal(h.store.receipt, accepted.deletion_receipt)
  assert.equal(h.store.status.status, 'processing')
  assert.equal(h.user.user, null)
  assert.equal(h.clears(), 1)
  assert.deepEqual(h.calls[0]!.data, { confirmation: 'delete_account', expected_version: 8 })
  await h.store.read()
  assert.equal(h.calls[1]!.auth, false)
  assert.equal(h.calls[1]!.url, '/deletion-receipts/' + accepted.deletion_receipt)
  await h.store.submit(actor.id, 1, 8)
  assert.equal(h.calls.length, 2)
})
test('REQ-018：未知结果锁住新请求，人工重试保留同一版本、正文与幂等键', async () => {
  const h = await setup()
  h.transport(async () => {
    throw new Error('合成网络中断')
  })
  await h.store.submit(actor.id, 1, 8)
  assert.equal(h.store.uncertain, true)
  await h.store.submit(actor.id, 1, 8)
  assert.equal(h.calls.length, 1)
  h.transport(async () => accepted)
  await h.store.submit('', -1, -1, true)
  assert.deepEqual(h.calls[1], h.calls[0])
  assert.equal(h.store.uncertain, false)
  assert.equal(h.clears(), 1)
})
test('REQ-018：并发提交仅一次，版本/账号/会话变化及Mock拒绝发起', async () => {
  const h = await setup()
  await h.store.submit(actor.id, 1, 7)
  await h.store.submit('forged', 1, 8)
  await h.store.submit(actor.id, 2, 8)
  h.config.useMock = true
  await h.store.submit(actor.id, 1, 8)
  assert.equal(h.calls.length, 0)
  h.config.useMock = false
  let finish!: (value: unknown) => void
  h.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = h.store.submit(actor.id, 1, 8)
  await h.store.submit(actor.id, 1, 8)
  assert.equal(h.calls.length, 1)
  finish(accepted)
  await pending
})
test('REQ-018：409只要求重读不自动重发；401或畸形回执不能称受理成功', async () => {
  for (const code of [409, 401, 500, 0]) {
    const h = await setup()
    h.transport(async () => {
      if (code) throw new RequestError(code)
      return { status: 'processing', deletion_receipt: '' }
    })
    await h.store.submit(actor.id, 1, 8)
    assert.equal(h.calls.length, 1)
    assert.equal(h.store.receipt, '')
    assert.equal(h.clears(), 0)
    assert.equal(h.store.uncertain, code !== 409)
    if (code === 409) assert.equal(h.user.validated, false)
  }
})
test('REQ-018：换账号晚到受理不清新会话，旧回执不交给新账号', async () => {
  const h = await setup()
  let finish!: (value: unknown) => void
  h.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = h.store.submit(actor.id, 1, 8)
  h.user.user = { ...actor, id: 'synthetic-other' }
  h.epoch()
  finish(accepted)
  await pending
  assert.equal(h.clears(), 0)
  assert.equal(h.store.receipt, '')
  assert.equal(h.store.submitting, false)
})
test('REQ-018：401清理账号后保留结果不明，同账号代次变化不接受旧回执', async () => {
  for (const mode of ['401', 'epoch']) {
    const h = await setup()
    h.transport(async () => {
      if (mode === '401') {
        h.user.clearSession()
        throw new RequestError(401)
      }
      h.epoch()
      return accepted
    })
    await h.store.submit(actor.id, 1, 8)
    assert.equal(h.store.uncertain, true)
    assert.equal(h.store.receipt, '')
    assert.equal(h.store.submitting, false)
  }
})
test('REQ-018：完成仅接受服务端终态，查询失败清旧状态且不解释为完成', async () => {
  const h = await setup()
  await h.store.submit(actor.id, 1, 8)
  h.transport(async () => ({ status: 'completed', account_id: 'synthetic-extra' }))
  await h.store.read()
  assert.deepEqual(h.store.status, { status: 'completed' })
  h.transport(async () => {
    throw new RequestError(404)
  })
  await h.store.read()
  assert.equal(h.store.status, null)
  assert.ok(h.store.error)
  assert.equal(h.store.receipt, accepted.deletion_receipt)
})
test('REQ-018：匿名查询不登录也可用，畸形句柄不请求，切账号丢弃晚到进度', async () => {
  const h = await setup()
  h.user.clearSession()
  await h.store.read('../invalid')
  assert.equal(h.calls.length, 0)
  let finish!: (value: unknown) => void
  h.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = h.store.read(accepted.deletion_receipt)
  h.user.user = { ...actor, id: 'synthetic-new' }
  finish({ status: 'completed' })
  await pending
  assert.equal(h.store.status, null)
  assert.equal(h.store.receipt, '')
})
async function page() {
  const h = await setup()
  const hooks: Record<string, () => unknown> = {}
  let callback: ((value: { confirm: boolean }) => void) | undefined
  const r = await loadRuntime(
    pageScript(new URL('../src/pages/deletion/index.vue', import.meta.url)) +
      '\nexport { acknowledged, confirmDeletion, refresh, inputReceipt, queryReceipt, busy }',
    {
      config: h.config,
      useUserStore: () => h.user,
      useDeletionStore: () => h.store,
      session: h.session,
      canDeleteAccount,
      validDeletionReceipt,
      uni: {
        showModal: (options: { success: (value: { confirm: boolean }) => void }) => {
          callback = options.success
        },
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
    },
  )
  hooks.show!()
  await settle()
  return { ...h, r, hooks, confirm: (confirm: boolean) => callback!({ confirm }) }
}
test('REQ-018：显式勾选加弹窗确认，取消和离页阻止写入，确认后版本复核', async () => {
  const h = await page()
  await h.r.confirmDeletion()
  assert.equal(h.calls.length, 0)
  h.r.acknowledged.value = true
  await h.r.confirmDeletion()
  h.confirm(false)
  assert.equal(h.calls.length, 0)
  await h.r.confirmDeletion()
  h.hooks.hide!()
  h.confirm(true)
  assert.equal(h.calls.length, 0)
  h.hooks.show!()
  await settle()
  h.r.acknowledged.value = true
  await h.r.confirmDeletion()
  h.user.user!.version++
  h.confirm(true)
  await settle()
  assert.equal(h.calls.length, 0)
})
test('REQ-018：离页不丢在途受理与回执，返回页可继续查询', async () => {
  const h = await page()
  h.r.acknowledged.value = true
  let finish!: (value: unknown) => void
  h.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await h.r.confirmDeletion()
  h.confirm(true)
  h.hooks.hide!()
  finish(accepted)
  await settle()
  assert.equal(h.store.receipt, accepted.deletion_receipt)
  assert.equal(h.clears(), 1)
})

test('REQ-018：结果不明后会话过期仍保留提示，应用恢复不并发刷新注销会话', async () => {
  const h = await setup()
  h.transport(async () => {
    throw new Error('合成断网')
  })
  await h.store.submit(actor.id, 1, 8)
  h.user.clearSession()
  assert.equal(h.store.uncertain, true)
  assert.ok(h.store.error)
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.ok(app.includes('deletion.submitting || deletion.uncertain'))
})
