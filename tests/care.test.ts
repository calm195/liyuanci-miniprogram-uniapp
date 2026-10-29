import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import { careTarget, mergeCareNotifications, projectCareCard } from '../src/utils/care.ts'

const card = {
  id: 'synthetic-card',
  resources: {
    version: 'synthetic-v1',
    source: 'synthetic://test-only',
    verified_at: '2026-10-26',
    hotline_24_hours: '合成援助渠道，无真实号码',
    appointment: '合成预约方式',
    notice: '合成资料，仅供测试',
  },
}
const notification = {
  id: 'synthetic-notification',
  version: 1,
  kind: 'crisis_care',
  read: false,
  target_ref: card.id,
}
async function setup(id = card.id, mock = false, loggedIn = true) {
  const hooks: Record<string, (query?: Record<string, string>) => unknown> = {}
  const user = reactive({
    user: loggedIn
      ? {
          id: 'synthetic-owner',
          verification: 'unverified',
          allowed_actions: [],
          penalty_notice: '合成受限账号',
        }
      : null,
    validated: true,
    isLoggedIn: loggedIn,
    refresh: async () => {},
  })
  let epoch = 1
  let transport: (input: { url: string }) => Promise<unknown> = async (input) =>
    input.url.startsWith('/me/care-cards/')
      ? structuredClone(card)
      : { items: [notification], next_cursor: null }
  const calls: { url: string }[] = []
  const routes: string[] = []
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/care.ts', import.meta.url), 'utf8'),
    {
      request: async (input: { url: string }) => {
        calls.push(input)
        return transport(input)
      },
    },
  )
  const r = await loadRuntime(
    pageScript(new URL('../src/pages/care/index.vue', import.meta.url)) +
      '\nexport { load, open, card, rows, currentCard, busy, error, scoped, cursor }',
    {
      ...api,
      careTarget,
      mergeCareNotifications,
      projectCareCard,
      listNotifications: async (cursor?: string) => {
        const input = { url: `/me/notifications${cursor ? '?cursor=' + cursor : ''}` }
        calls.push(input)
        return transport(input)
      },
      config: { useMock: mock },
      useUserStore: () => user,
      session: { getEpoch: () => epoch, getToken: () => (loggedIn ? 'synthetic-token' : '') },
      uni: { navigateTo: ({ url }: { url: string }) => routes.push(url) },
      onLoad: (fn: (query?: Record<string, string>) => unknown) => {
        hooks.load = fn
      },
      onShow: (fn: (query?: Record<string, string>) => unknown) => {
        hooks.show = fn
      },
      onHide: (fn: (query?: Record<string, string>) => unknown) => {
        hooks.hide = fn
      },
      onUnload: (fn: (query?: Record<string, string>) => unknown) => {
        hooks.unload = fn
      },
    },
  )
  hooks.load!({ id })
  hooks.show!()
  await settle()
  return {
    r,
    user,
    calls,
    routes,
    hooks,
    changeEpoch: () => {
      epoch++
    },
    transport: (fn: typeof transport) => {
      transport = fn
    },
  }
}
test('REQ-017/018：关怀投影只保留允许字段，拒绝缺失资料、错误目标及畸形日期', () => {
  assert.deepEqual(
    projectCareCard({ ...card, case_id: 'synthetic-case' } as typeof card, card.id),
    card,
  )
  for (const value of [
    null,
    { ...card, id: 'other' },
    { ...card, resources: { ...card.resources, source: '' } },
    { ...card, resources: { ...card.resources, verified_at: '2026-02-30' } },
  ])
    assert.throws(() => projectCareCard(value as typeof card, card.id))
  assert.equal(careTarget({ ...notification, kind: 'penalty_notice' }), null)
  assert.equal(careTarget({ ...notification, target_ref: '' }), null)
})
test('REQ-017：受限未认证本人无需业务写权限读取卡片，仅发本人读取接口', async () => {
  const h = await setup()
  assert.deepEqual(h.r.currentCard.value, card)
  assert.deepEqual(h.calls, [{ url: '/me/care-cards/synthetic-card' }])
  h.hooks.hide!()
  assert.equal(h.r.currentCard.value, null)
  h.hooks.show!()
  await settle()
  assert.equal(h.calls.length, 2)
})
test('REQ-018：403/404/网络失败和错误回执清除旧资料，不使用通知快照', async () => {
  const h = await setup()
  for (const status of [403, 404, 500]) {
    h.transport(async () => {
      throw new Error(String(status))
    })
    await h.r.load()
    assert.equal(h.r.currentCard.value, null)
    assert.ok(h.r.error.value)
  }
  h.transport(async () => ({ ...card, id: 'other' }))
  await h.r.load()
  assert.equal(h.r.currentCard.value, null)
})
test('REQ-018：离页与同账号会话代次变化丢弃晚到卡片并释放忙碌状态', async () => {
  for (const mode of ['hide', 'epoch', 'account']) {
    const h = await setup()
    let finish!: (value: unknown) => void
    h.transport(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = h.r.load()
    await settle()
    if (mode === 'hide') h.hooks.hide!()
    if (mode === 'epoch') h.changeEpoch()
    if (mode === 'account') h.user.user = { ...h.user.user!, id: 'synthetic-other' }
    finish(card)
    await pending
    assert.equal(h.r.currentCard.value, null)
    assert.equal(h.r.busy.value, false)
  }
})
test('REQ-017：Mock与未登录不请求、不伪造热线或预约', async () => {
  for (const h of [await setup(card.id, true), await setup(card.id, false, false)]) {
    assert.equal(h.calls.length, 0)
    assert.equal(h.r.currentCard.value, null)
    assert.ok(h.r.error.value)
  }
})
test('REQ-017/018：通知逐页筛选与去重，固定本端路由，循环游标关闭列表', async () => {
  const h = await setup('')
  assert.equal(h.r.rows.value.length, 1)
  h.r.open(h.r.rows.value[0])
  assert.deepEqual(h.routes, ['/pages/care/index?id=synthetic-card'])
  h.r.open({ ...notification, target_ref: 'forged' })
  assert.equal(h.routes.length, 1)
  h.transport(async () => ({
    items: [notification, { ...notification, id: 'other', kind: 'penalty_notice' }],
    next_cursor: 'opaque.cursor',
  }))
  await h.r.load()
  assert.equal(h.r.rows.value.length, 1)
  await h.r.load(true)
  assert.equal(h.r.rows.value.length, 0)
  assert.equal(h.r.cursor.value, null)
  assert.ok(h.r.error.value)
})
test('REQ-017：无关通知和空页允许继续翻页，通知内容不作为援助资料', () => {
  assert.deepEqual(
    mergeCareNotifications([], {
      items: [{ ...notification, kind: 'message_delivered' }],
      next_cursor: 'next',
    }),
    [],
  )
  assert.deepEqual(
    mergeCareNotifications([notification], { items: [notification], next_cursor: null }),
    [notification],
  )
  assert.throws(() => mergeCareNotifications([], { items: [], next_cursor: '' }))
})
test('REQ-017：页面注册、个人中心及通知入口齐全，资源仅用文本组件展示', () => {
  const page = readFileSync(new URL('../src/pages/care/index.vue', import.meta.url), 'utf8')
  assert.ok(
    readFileSync(new URL('../src/pages.json', import.meta.url), 'utf8').includes(
      'pages/care/index',
    ),
  )
  for (const file of ['profile', 'inbox'])
    assert.ok(
      readFileSync(new URL(`../src/pages/${file}/index.vue`, import.meta.url), 'utf8').includes(
        '/pages/care/index',
      ),
    )
  assert.equal(/<web-view|<rich-text|makePhoneCall|setClipboardData/.test(page), false)
  assert.ok(page.includes('不承诺全天人工值守'))
})
