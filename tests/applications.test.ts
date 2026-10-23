import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { applicationStatusLabels } from '../src/types/application.ts'
import type { WishApplication } from '../src/types/application.ts'
import type { WishResult } from '../src/types/wish.ts'
import { emptyWish, wishStateLabels } from '../src/utils/wish.ts'
import {
  applicationMessageError,
  canApplyToWish,
  canManageApplications,
  canAcceptApplication,
  canWithdrawApplication,
} from '../src/utils/application.ts'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'

const sample: WishApplication = {
  id: 'synthetic-application',
  wish_id: 'synthetic-wish',
  version: 7,
  status: 'active',
  message: '已审合成留言',
  applicant: { id: 'synthetic-applicant', nickname: '合成同学' },
}
const publicWish: WishResult = {
  id: sample.wish_id,
  version: 19,
  content_version: 3,
  current_state: 'published',
  allowed_actions: ['postWishesIdApplications'],
  public: {
    id: sample.wish_id,
    body: '合成心愿',
    content_version: 3,
    school_related: false,
    notice_codes: [],
    notice_text: '',
    author: { id: 'synthetic-author', nickname: '合成作者' },
  },
}
const ownedWish = { ...publicWish, own_content: { ...emptyWish(), body: '本人合成心愿' } }
const me = {
  id: 'synthetic-owner',
  version: 99,
  verification: 'verified' as const,
  allowed_actions: ['postWishesIdApplications'],
}

test('REQ-006：留言100码点/空留言合法；本人、缺动作、错误状态及失效资格不能申请', () => {
  assert.equal(applicationMessageError('😀'.repeat(100)), '')
  assert.equal(applicationMessageError(''), '')
  assert.ok(applicationMessageError('😀'.repeat(101)))
  assert.equal(canApplyToWish(me, true, publicWish), true)
  for (const target of [
    ownedWish,
    { ...publicWish, allowed_actions: [] },
    { ...publicWish, current_state: 'matching' as const },
    { ...publicWish, content_version: 0 },
    { ...publicWish, privacy_review_required: true },
  ])
    assert.equal(canApplyToWish(me, true, target), false)
  assert.equal(canApplyToWish(me, false, publicWish), false)
  assert.equal(canManageApplications(me, true, publicWish), false)
  assert.equal(
    canAcceptApplication(me, true, ownedWish, { ...sample, wish_id: 'synthetic-other' }),
    false,
  )
  assert.equal(
    canAcceptApplication(me, true, ownedWish, { ...sample, status: 'pending_review' }),
    false,
  )
  assert.equal(canWithdrawApplication(me, true, { ...sample, status: 'accepted' }), false)
})
type Transport = {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}
async function setup(mode: 'apply' | 'owner' | 'mine' = 'owner') {
  let target = structuredClone(mode === 'owner' ? ownedWish : publicWish)
  let resultRows = [
    structuredClone(sample),
    {
      ...structuredClone(sample),
      id: 'synthetic-pending',
      status: 'pending_review' as const,
      message: '不可向许愿人公开的待审留言',
    },
    { ...structuredClone(sample), id: 'synthetic-other', wish_id: 'synthetic-other-wish' },
  ]
  let epoch = 1
  const user = reactive({
    user: { ...me },
    isLoggedIn: true,
    validated: true,
    refresh: async () => {},
  })
  const config = reactive({ useMock: false, wishWritesReady: true })
  const hooks: Record<string, (query?: { wishId: string }) => void> = {}
  const calls: Transport[] = []
  let command: (input: Transport) => Promise<unknown> = async () => ({
    ...sample,
    status: 'pending_scan',
  })
  let get: (input: Transport) => Promise<unknown> = async (input) =>
    input.url.startsWith('/wishes/') && !input.url.includes('/applications')
      ? structuredClone(target)
      : { items: structuredClone(resultRows), next_cursor: 'synthetic.cursor' }
  let showModal = (success: (result: { confirm: boolean }) => void) => success({ confirm: true })
  class RequestError extends Error {
    statusCode = 409
    error_code = 'VERSION_CONFLICT'
  }
  Object.assign(globalThis, {
    uni: {
      showModal: (options: { success: (result: { confirm: boolean }) => void }) =>
        showModal(options.success),
    },
  })
  const request = async (input: Transport) => {
    calls.push(structuredClone(input))
    return input.method ? command(input) : get(input)
  }
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/applications.ts', import.meta.url), 'utf8'),
    { request },
  )
  const wishes = await loadRuntime(
    readFileSync(new URL('../src/api/wishes.ts', import.meta.url), 'utf8'),
    { request },
  )
  const page = await loadRuntime(
    pageScript(new URL('../src/pages/applications/index.vue', import.meta.url)) +
      '\nexport { load, items, rows, message, notice, error, submit, accept, withdraw, mayApply, currentWish, selectStatus, writing };',
    {
      ...api,
      getWish: wishes.getWish,
      config,
      useUserStore: () => user,
      session: { getEpoch: () => epoch, getToken: () => 'synthetic-token' },
      RequestError,
      applicationStatusLabels,
      wishStateLabels,
      applicationMessageError,
      canApplyToWish,
      canManageApplications,
      canAcceptApplication,
      canWithdrawApplication,
      onLoad: (fn: typeof hooks.load) => {
        hooks.load = fn!
      },
      onShow: (fn: typeof hooks.show) => {
        hooks.show = fn!
      },
      onHide: (fn: typeof hooks.hide) => {
        hooks.hide = fn!
      },
      onUnload: (fn: typeof hooks.unload) => {
        hooks.unload = fn!
      },
    },
  )
  hooks.load!({ wishId: mode === 'mine' ? '' : sample.wish_id })
  hooks.show!()
  await settle()
  return {
    page,
    calls,
    user,
    config,
    hooks,
    RequestError,
    setTarget: (value: WishResult) => {
      target = structuredClone(value) as typeof target
    },
    setRows: (value: WishApplication[]) => {
      resultRows = value
    },
    setCommand: (value: typeof command) => {
      command = value
    },
    setGet: (value: typeof get) => {
      get = value
    },
    setModal: (value: typeof showModal) => {
      showModal = value
    },
    changeSession: () => {
      epoch++
    },
  }
}
const writes = (calls: Transport[]) => calls.filter((call) => call.method)
test('REQ-005/006：许愿人只看当前active，同意使用申请7和心愿19，不能套用列表外对象', async () => {
  const s = await setup()
  assert.deepEqual(
    s.page.rows.value.map((item: WishApplication) => item.id),
    [sample.id],
  )
  await s.page.accept({ ...s.page.rows.value[0] })
  assert.equal(writes(s.calls).length, 0)
  s.setCommand(async () => {
    s.setTarget({ ...ownedWish, current_state: 'matching' })
    return {
      match_id: 'synthetic-match',
      conversation_id: 'synthetic-conversation',
      wish_id: sample.wish_id,
      version: 1,
    }
  })
  await s.page.accept(s.page.rows.value[0])
  assert.deepEqual(writes(s.calls)[0]!.data, { expected_version: 7, wish_expected_version: 19 })
  assert.ok(writes(s.calls)[0]!.header?.['Idempotency-Key'])
  assert.equal(s.page.currentWish.value.current_state, 'matching')
  assert.equal(s.page.rows.value.length, 0)
})
test('REQ-006：申请携当前正文版本，空留言也送审；101码点不发请求', async () => {
  const s = await setup('apply')
  s.page.message.value = '😀'.repeat(101)
  await s.page.submit()
  assert.equal(writes(s.calls).length, 0)
  s.page.message.value = ''
  await s.page.submit()
  assert.deepEqual(writes(s.calls)[0]!.data, { message: '', wish_content_version: 3 })
  assert.match(s.page.notice.value, /审核后/)
  assert.equal(s.page.message.value, '')
})
test('REQ-006/018：本人撤销只用本人列表，游标/状态透传，409重读不重复接受', async () => {
  const mine = await setup('mine')
  await mine.page.withdraw({ ...sample })
  assert.equal(writes(mine.calls).length, 0)
  await mine.page.withdraw(mine.page.rows.value[0])
  assert.deepEqual(writes(mine.calls)[0]!.data, { expected_version: 7 })
  await mine.page.load(true)
  assert.ok(mine.calls.some((call) => call.url === '/me/applications?cursor=synthetic.cursor'))
  mine.page.selectStatus({ detail: { value: 3 } })
  await settle()
  assert.ok(mine.calls.some((call) => call.url === '/me/applications?status=active'))
  const s = await setup()
  s.setCommand(async () => {
    throw new s.RequestError('合成冲突')
  })
  await s.page.accept(s.page.rows.value[0])
  assert.equal(writes(s.calls).length, 1)
  assert.match(s.page.notice.value, /手动操作/)
})
test('REQ-018：确认期间离开不能写入，换账号清空本人申请；迟到请求不能恢复旧投影', async () => {
  const s = await setup()
  let resolve: ((result: { confirm: boolean }) => void) | undefined
  s.setModal((fn) => {
    resolve = fn
  })
  const action = s.page.accept(s.page.rows.value[0])
  s.hooks.hide!()
  resolve!({ confirm: true })
  await action
  assert.equal(writes(s.calls).length, 0)
  assert.equal(s.page.items.value.length, 0)
  let finish: ((value: unknown) => void) | undefined
  s.setGet(
    () =>
      new Promise((done) => {
        finish = done
      }),
  )
  s.hooks.show!()
  await settle()
  s.changeSession()
  s.hooks.hide!()
  finish!(ownedWish)
  await settle()
  assert.equal(s.page.currentWish.value, null)
  const mine = await setup('mine')
  mine.user.user.id = 'synthetic-other-user'
  assert.equal(mine.page.rows.value.length, 0)
})
test('REQ-018：403/404读取及写失败清空授权依据，失败后不能沿用旧列表', async () => {
  const s = await setup()
  s.setCommand(async () => {
    const failure = new s.RequestError('合成拒绝')
    failure.statusCode = 403
    throw failure
  })
  await s.page.accept(s.page.rows.value[0])
  assert.equal(s.page.currentWish.value, null)
  assert.equal(s.page.rows.value.length, 0)
  assert.match(s.page.error.value, /刷新/)
})
test('REQ-008/018：公开主页按本人目标分页，404与离开清除正文及标签', async () => {
  const hooks: Record<string, (query?: { id: string }) => void> = {}
  const user = reactive({ user: { id: 'synthetic-viewer' } })
  let fail = false
  const calls: Transport[] = []
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/applications.ts', import.meta.url), 'utf8'),
    {
      request: async (input: Transport) => {
        calls.push(input)
        if (fail) throw new Error('合成404')
        return {
          profile: { id: 'synthetic-author', nickname: '公开昵称' },
          items: [{ kind: 'wish', content: publicWish.public }],
          next_cursor: 'profile.cursor',
        }
      },
    },
  )
  const page = await loadRuntime(
    pageScript(new URL('../src/pages/public-profile/index.vue', import.meta.url)) +
      '\nexport { load, profile, rows, currentProfile };',
    {
      ...api,
      config: { useMock: false },
      session: { getEpoch: () => 1 },
      useUserStore: () => user,
      campuses: [],
      genders: [],
      onLoad: (fn: typeof hooks.load) => {
        hooks.load = fn!
      },
      onShow: (fn: typeof hooks.show) => {
        hooks.show = fn!
      },
      onHide: (fn: typeof hooks.hide) => {
        hooks.hide = fn!
      },
      onUnload: (fn: typeof hooks.unload) => {
        hooks.unload = fn!
      },
    },
  )
  hooks.load!({ id: 'synthetic-author' })
  hooks.show!()
  await settle()
  assert.equal(page.currentProfile.value.identity_tags, undefined)
  assert.equal(page.rows.value[0].content.body, '合成心愿')
  await page.load(true)
  assert.equal(calls[1]!.url, '/users/synthetic-author/public-profile?cursor=profile.cursor')
  assert.equal(page.rows.value.length, 1)
  fail = true
  await page.load()
  assert.equal(page.currentProfile.value, null)
  assert.equal(page.rows.value.length, 0)
  hooks.hide!()
  assert.equal(page.profile.value, null)
})
