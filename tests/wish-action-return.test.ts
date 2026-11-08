import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, settle } from './support/page-runtime.ts'

async function setup(gate: 'login' | 'verification', fromWish = true) {
  const store = reactive({
    busy: false,
    validated: false,
    user: { id: 'synthetic-student', verification: 'pending' },
  })
  const trace: unknown[] = []
  const hooks: {
    load?: (query: Record<string, string>) => void
    show?: () => void
  } = {}
  let fail: (() => void) | undefined
  const runtime = await loadRuntime(
    readFileSync(new URL('../src/composables/use-wish-action-return.ts', import.meta.url), 'utf8'),
    {
      useUserStore: () => store,
      session: { getEpoch: () => 5 },
      getCurrentPages: () => [
        { route: fromWish ? 'pages/wish-detail/index' : 'pages/profile/index' },
        { route: `pages/${gate}/index` },
      ],
      getCurrentInstance: () => ({
        proxy: {
          getOpenerEventChannel: () => ({
            emit: (event: string, result: unknown) => trace.push([event, result]),
          }),
        },
      }),
      onLoad: (callback: typeof hooks.load) => (hooks.load = callback),
      onShow: (callback: typeof hooks.show) => (hooks.show = callback),
      onHide: () => {},
      onUnload: () => {},
      uni: {
        navigateBack: (options: { fail: () => void }) => {
          trace.push('back')
          fail = options.fail
        },
      },
    },
  )
  const gateReturn = runtime.useWishActionReturn(gate)
  hooks.load!({ returnToWish: '1' })
  hooks.show!()
  return { gateReturn, store, trace, failBack: () => fail?.() }
}

test('登录确认后先传递当前会话，再回详情等待后续认证', async () => {
  const { store, trace } = await setup('login')
  store.busy = true
  store.validated = true
  await settle()
  assert.deepEqual(trace, [])
  store.busy = false
  await settle()
  assert.deepEqual(trace, [['wishActionReady', { owner: 'synthetic-student', epoch: 5 }], 'back'])
})

test('认证已通过时才传回成功，返回失败撤销原操作回执', async () => {
  const { store, trace, failBack, gateReturn } = await setup('verification')
  store.validated = true
  await settle()
  assert.deepEqual(trace, [])
  store.user.verification = 'verified'
  await settle()
  failBack()
  assert.deepEqual(trace, [
    ['wishActionReady', { owner: 'synthetic-student', epoch: 5 }],
    'back',
    ['wishActionReady', null],
  ])
  assert.equal(gateReturn.returning.value, false)
})

test('待审核时可返回详情且不继续操作，普通认证入口不回跳', async () => {
  const pending = await setup('verification')
  pending.gateReturn.returnToWish()
  assert.deepEqual(pending.trace, ['back'])
  const standalone = await setup('verification', false)
  standalone.store.validated = true
  standalone.store.user.verification = 'verified'
  await settle()
  assert.deepEqual(standalone.trace, [])
})
