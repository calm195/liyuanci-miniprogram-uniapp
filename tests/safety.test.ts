import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import { findSafetyItem, validWarning, warningConfirmable } from '../src/utils/safety.ts'
import type { Warning } from '../src/types/safety.ts'
import { mergeMessages } from '../src/utils/chat.ts'

const initial: Warning = {
  id: 'synthetic-warning',
  version: 3,
  notice: '合成警告说明',
  first_displayed_at: null,
  confirmable_at: null,
  server_now: '2026-10-23T00:00:00Z',
  remaining_seconds: 30,
}
const displayed: Warning = {
  ...initial,
  version: 4,
  first_displayed_at: initial.server_now,
  confirmable_at: '2026-10-23T00:00:30Z',
}
const due: Warning = { ...displayed, server_now: displayed.confirmable_at!, remaining_seconds: 0 }
const actor = {
  id: 'synthetic-owner',
  version: 19,
  verification: 'unverified' as const,
  penalty_notice: '合成处罚提示',
  allowed_actions: [
    'getMeWarnings',
    'postMeWarningsIdDisplay',
    'postMeWarningsIdAck',
    'getMeAppeals',
    'postMeAppeals',
    'getReportTypes',
    'postReports',
  ],
}
type Input = {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}
class RequestError extends Error {
  statusCode: number
  constructor(status: number) {
    super('合成失败')
    this.statusCode = status
  }
}
async function setup(page = 'safety', query: Record<string, string> = {}) {
  const hooks: Record<string, (query?: Record<string, string>) => unknown> = {}
  const user = reactive({
    user: structuredClone(actor) as typeof actor | null,
    validated: true,
    refresh: async () => {},
  })
  const calls: Input[] = []
  let epoch = 1
  let token = 'synthetic-token'
  const config = { useMock: false }
  let warning = structuredClone(initial)
  let transport: (input: Input) => Promise<unknown> = async (input) => {
    if (input.url.startsWith('/me/warnings?')) return { items: [warning], next_cursor: null }
    if (input.url.endsWith('/display')) {
      warning = structuredClone(displayed)
      return warning
    }
    if (input.url.endsWith('/ack')) return { ...due, version: 5, acknowledged_at: due.server_now }
    if (input.url.startsWith('/me/appeals?'))
      return {
        items: [
          { id: 'synthetic-appeal', version: 2, status: 'rejected', reason: '合成可披露理由' },
        ],
        next_cursor: null,
      }
    if (input.url.startsWith('/report-types?'))
      return { items: [{ code: 'synthetic-code', label: '合成类型' }], next_cursor: null }
    return { id: 'synthetic-receipt', version: 1, status: 'pending' }
  }
  const request = async (input: Input) => {
    calls.push(input)
    return transport(input)
  }
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/safety.ts', import.meta.url), 'utf8'),
    { request },
  )
  const helpers = await loadRuntime(
    readFileSync(new URL('../src/utils/safety.ts', import.meta.url), 'utf8'),
    {},
  )
  let readable = true
  let own = true
  let confirmed = true
  let delayed = false
  let modal: (() => void) | undefined
  let tick: (() => void) | null = null
  const timers = {
    setInterval: (fn: () => void) => {
      tick = fn
      return 1
    },
    clearInterval: () => {
      tick = null
    },
  }
  const exports =
    page === 'safety'
      ? 'tab,warnings,appeals,selected,cursor,countdown,penaltyId,body,busy,writing,uncertain,error,notice,scoped,mayAck,load,refreshWarning,warningAction,appeal,openAppeal,selectTab,permitted'
      : 'kind,id,types,code,description,ready,busy,writing,uncertain,finished,error,notice,scoped,maySubmit,load,submit'
  const runtime = await loadRuntime(
    pageScript(new URL(`../src/pages/${page}/index.vue`, import.meta.url))
      .replace(/globalThis\.setInterval/g, 'timers.setInterval')
      .replace(/globalThis\.clearInterval/g, 'timers.clearInterval') + `\nexport { ${exports} }`,
    {
      ...api,
      ...helpers,
      timers,
      config,
      RequestError,
      useUserStore: () => user,
      session: { getEpoch: () => epoch, getToken: () => token },
      readableReportTarget: async () => readable,
      ownPenaltyNotification: async () => own,
      uni: {
        showModal: (options: { success: (result: { confirm: boolean }) => void }) => {
          modal = () => options.success({ confirm: confirmed })
          if (!delayed) modal()
        },
      },
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
    },
  )
  hooks.load(query)
  hooks.show()
  await settle()
  return {
    r: runtime,
    user,
    calls,
    hooks,
    config,
    transport: (fn: typeof transport) => {
      transport = fn
    },
    warning: (value: Warning) => {
      warning = value
    },
    readable: (value: boolean) => {
      readable = value
    },
    own: (value: boolean) => {
      own = value
    },
    epoch: () => {
      epoch++
    },
    noToken: () => {
      token = ''
    },
    cancel: () => {
      confirmed = false
    },
    delay: () => {
      delayed = true
    },
    confirm: () => modal?.(),
    tick: async () => {
      tick?.()
      await settle()
    },
    hasTimer: () => !!tick,
  }
}
test('REQ-016：警告显示使用记录版本，29秒不确认，服务端30秒才解锁', async () => {
  const s = await setup()
  const r = s.r
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  await r.warningAction(r.warnings.value[0], 'display')
  assert.deepEqual(s.calls.find((x) => x.method)?.data, { expected_version: 3 })
  assert.equal(r.selected.value.version, 4)
  s.warning({ ...displayed, server_now: '2026-10-23T00:00:29Z', remaining_seconds: 1 })
  await r.refreshWarning()
  await r.warningAction(r.selected.value, 'ack')
  assert.equal(s.calls.filter((x) => x.url.endsWith('/ack')).length, 0)
  assert.equal(r.mayAck.value, false)
  s.warning(due)
  await r.refreshWarning()
  assert.equal(r.mayAck.value, true)
  await r.warningAction(r.selected.value, 'ack')
  const ack = s.calls.find((x) => x.url.endsWith('/ack'))!
  assert.deepEqual(ack.data, { expected_version: 4 })
  assert.equal(r.warnings.value.length, 0)
  assert.match(r.notice.value, /不代表解除/)
  s.hooks.hide()
})
test('REQ-016：本地倒数不能提前解锁，重进使用服务端首次展示时间且离页停止计时', async () => {
  const s = await setup()
  const r = s.r
  await r.warningAction(r.warnings.value[0], 'display')
  assert.equal(s.hasTimer(), true)
  for (let i = 0; i < 30; i++) await s.tick()
  assert.equal(r.mayAck.value, false)
  s.hooks.hide()
  assert.equal(s.hasTimer(), false)
  assert.equal(r.selected.value, null)
  s.warning(due)
  s.hooks.show()
  await settle()
  await r.warningAction(r.warnings.value[0], 'display')
  assert.equal(r.selected.value.first_displayed_at, displayed.first_displayed_at)
  s.hooks.unload()
})
test('REQ-016/018：畸形警告时间拒绝确认，重复游标拒绝保留旧列表', async () => {
  assert.equal(validWarning({ ...due, server_now: '2026-10-23T00:00:29Z' }), false)
  assert.equal(warningConfirmable({ ...due, first_displayed_at: null }), false)
  const s = await setup()
  s.transport(async () => ({ items: [initial], next_cursor: 'same' }))
  await s.r.load()
  await s.r.load(true)
  assert.equal(s.r.warnings.value.length, 0)
  assert.match(s.r.error.value, /读取失败/)
  await assert.rejects(
    findSafetyItem(
      async () => ({ items: [], next_cursor: 'same' }),
      () => false,
      () => true,
    ),
    /游标异常/,
  )
})
test('REQ-016：提前确认冲突只重读，重复点击与晚到回执不跨账号', async () => {
  const s = await setup()
  const r = s.r
  s.warning(due)
  await r.load()
  s.transport(async (input) => {
    if (input.method) throw new RequestError(409)
    return { items: [due], next_cursor: null }
  })
  await r.warningAction(r.warnings.value[0], 'display')
  assert.equal(s.calls.filter((x) => x.method).length, 1)
  assert.match(r.notice.value, /未自动重试/)
  let done: (value: unknown) => void = () => {}
  s.transport(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  const pending = r.warningAction(r.warnings.value[0], 'display')
  await r.warningAction(r.warnings.value[0], 'display')
  s.user.user = { ...actor, id: 'synthetic-new' }
  done(displayed)
  await pending
  assert.equal(r.selected.value, null)
  assert.equal(s.calls.filter((x) => x.method).length, 2)
})
test('REQ-014/016：受限账号仍可申诉与读状态，不获得举报权限；空白正文与伪造处罚拒绝', async () => {
  const s = await setup('safety', {
    tab: 'appeals',
    penaltyId: initial.id,
    notificationId: 'synthetic-notice',
  })
  s.user.user!.allowed_actions = actor.allowed_actions.filter(
    (x) => !['postReports', 'getReportTypes'].includes(x),
  )
  const r = s.r
  assert.equal(r.penaltyId.value, initial.id)
  r.body.value = ' \n '
  await r.appeal()
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  r.body.value = '合成申诉说明'
  await r.appeal()
  assert.deepEqual(s.calls.find((x) => x.method)?.data, {
    penalty_id: initial.id,
    body: '合成申诉说明',
  })
  assert.match(r.notice.value, /等待复核/)
  assert.equal(r.appeals.value[0].reason, '合成可披露理由')
  assert.equal(s.user.user!.allowed_actions.includes('postReports'), false)
  const fake = await setup('safety', {
    tab: 'appeals',
    penaltyId: initial.id,
    notificationId: 'synthetic-wrong',
  })
  fake.own(false)
  await fake.r.load()
  assert.equal(fake.r.penaltyId.value, '')
  fake.r.body.value = '合成正文'
  await fake.r.appeal()
  assert.equal(fake.calls.filter((x) => x.method).length, 0)
})
test('REQ-014/016：本人警告切入申诉需重新核验处罚；不确定结果手动重试复用正文与幂等键', async () => {
  const s = await setup()
  const r = s.r
  r.openAppeal(r.warnings.value[0])
  await settle()
  assert.equal(r.penaltyId.value, initial.id)
  const base = async (input: Input) =>
    input.method
      ? { id: 'synthetic-accepted', version: 1, status: 'pending' }
      : { items: [], next_cursor: null }
  s.transport(async (input) => {
    if (input.method) throw new Error('合成超时')
    return base(input)
  })
  r.body.value = '原申诉说明'
  await r.appeal()
  assert.equal(r.uncertain.value, true)
  await r.load()
  assert.equal(r.body.value, '原申诉说明')
  r.body.value = '后改内容不得替换未确认请求'
  s.transport(base)
  await r.appeal()
  const writes = s.calls.filter((x) => x.method)
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[0], writes[1])
})
test('REQ-014/018：举报使用服务端类型与202受理语义，未填写说明不传空字段', async () => {
  const s = await setup('report', { kind: 'wish', id: 'synthetic-wish' })
  const r = s.r
  await r.submit()
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  r.code.value = 'synthetic-code'
  await r.submit()
  assert.deepEqual(s.calls.find((x) => x.method)?.data, {
    target_kind: 'wish',
    id: 'synthetic-wish',
    type_code: 'synthetic-code',
  })
  assert.match(r.notice.value, /不代表已认定/)
  assert.equal(r.finished.value, true)
  await r.submit()
  assert.equal(s.calls.filter((x) => x.method).length, 1)
})
test('REQ-014/018：举报取消、重复点击、离页确认与账号切换均不产生额外写入', async () => {
  const s = await setup('report', { kind: 'story', id: 'synthetic-story' })
  const r = s.r
  r.code.value = 'synthetic-code'
  s.cancel()
  await r.submit()
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  s.delay()
  const pending = r.submit()
  await r.submit()
  s.hooks.hide()
  s.confirm()
  await pending
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  assert.equal(r.description.value, '')
  s.hooks.show()
  await settle()
  r.description.value = '旧说明'
  s.user.user = { ...actor, id: 'synthetic-next' }
  assert.equal(r.description.value, '')
  assert.equal(r.ready.value, false)
})
test('REQ-014/018：举报不确定结果复用请求，409重读且不自动重发', async () => {
  const s = await setup('report', { kind: 'message', id: 'synthetic-message' })
  const r = s.r
  const original = async (input: Input) =>
    input.url.startsWith('/report-types?')
      ? { items: [{ code: 'synthetic-code', label: '合成类型' }], next_cursor: null }
      : { id: 'synthetic-accepted', version: 1, status: 'pending' }
  s.transport(async (input) => {
    if (input.method) throw new Error('合成超时')
    return original(input)
  })
  r.code.value = 'synthetic-code'
  r.description.value = '原说明'
  await r.submit()
  assert.equal(r.uncertain.value, true)
  r.description.value = '后改说明'
  s.transport(original)
  await r.submit()
  const writes = s.calls.filter((x) => x.method)
  assert.deepEqual(writes[0], writes[1])
  await r.load()
  r.code.value = 'synthetic-code'
  s.transport(async (input) => {
    if (input.method) throw new RequestError(409)
    return original(input)
  })
  await r.submit()
  assert.equal(s.calls.filter((x) => x.method).length, 3)
  assert.match(r.notice.value, /手动提交/)
})
test('REQ-018：无权限、目标失效、Mock、未登录、epoch变化都不写入', async () => {
  const s = await setup('report', { kind: 'wish', id: 'synthetic-wish' })
  const r = s.r
  s.readable(false)
  await r.load()
  assert.equal(r.ready.value, false)
  s.readable(true)
  await r.load()
  r.code.value = 'synthetic-code'
  s.epoch()
  await r.submit()
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  await r.load()
  s.user.user!.allowed_actions = []
  r.code.value = 'synthetic-code'
  await r.submit()
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  s.config.useMock = true
  await r.load()
  assert.equal(r.ready.value, false)
  s.config.useMock = false
  s.noToken()
  await r.load()
  assert.equal(r.ready.value, false)
})

async function targetRuntime(context: Record<string, unknown> = {}) {
  return loadRuntime(
    readFileSync(new URL('../src/api/safety-targets.ts', import.meta.url), 'utf8'),
    {
      findSafetyItem,
      mergeMessages,
      getWish: async (id: string) => ({
        id,
        public: { id },
        own_content: { body: '合成本人内容' },
      }),
      getStory: async (id: string) => ({ id }),
      listWishApplications: async () => ({
        items: [{ id: 'synthetic-application', wish_id: 'synthetic-wish', status: 'active' }],
        next_cursor: null,
      }),
      findConversation: async (id: string) => ({ id }),
      listMessages: async () => ({ items: [], next_after_seq: 0 }),
      listNotifications: async () => ({ items: [], next_cursor: null }),
      ...context,
    },
  )
}
test('REQ-014/018：心愿屏障和故事目标变更拒绝沿用来源快照', async () => {
  const api = await targetRuntime({
    getWish: async () => ({
      id: 'synthetic-wish',
      privacy_review_required: true,
      public: { id: 'synthetic-wish' },
    }),
    getStory: async () => ({ id: 'synthetic-other' }),
  })
  assert.equal(await api.readableReportTarget('wish', 'synthetic-wish', '', () => true), false)
  assert.equal(await api.readableReportTarget('story', 'synthetic-story', '', () => true), false)
  const denied = await targetRuntime({
    getStory: async () => {
      throw new RequestError(404)
    },
  })
  await assert.rejects(denied.readableReportTarget('story', 'synthetic-story', '', () => true))
  const readable = await targetRuntime()
  assert.equal(await readable.readableReportTarget('wish', 'synthetic-wish', '', () => true), true)
  assert.equal(
    await readable.readableReportTarget('story', 'synthetic-story', '', () => true),
    true,
  )
})
test('REQ-014/018：申请举报只取许愿人当前有效申请，跨心愿或待审留言拒绝', async () => {
  const api = await targetRuntime()
  assert.equal(
    await api.readableReportTarget(
      'application',
      'synthetic-application',
      'synthetic-wish',
      () => true,
    ),
    true,
  )
  assert.equal(
    await api.readableReportTarget('application', 'synthetic-application', '', () => true),
    false,
  )
  for (const item of [
    { id: 'synthetic-application', wish_id: 'synthetic-other', status: 'active' },
    { id: 'synthetic-application', wish_id: 'synthetic-wish', status: 'pending_scan' },
  ]) {
    const blocked = await targetRuntime({
      listWishApplications: async () => ({ items: [item], next_cursor: null }),
    })
    assert.equal(
      await blocked.readableReportTarget(
        'application',
        'synthetic-application',
        'synthetic-wish',
        () => true,
      ),
      false,
    )
  }
})
test('REQ-014/018：消息举报逐页核验本人会话和实际送达序号，不以路由证明权限', async () => {
  const after: number[] = []
  const api = await targetRuntime({
    listMessages: async (_id: string, seq: number) => {
      after.push(seq)
      return {
        items: [
          { message_id: seq === 0 ? 'synthetic-first' : 'synthetic-target', delivery_seq: seq + 1 },
        ],
        next_after_seq: seq + 1,
      }
    },
  })
  assert.equal(
    await api.readableReportTarget(
      'message',
      'synthetic-target',
      'synthetic-conversation',
      () => true,
    ),
    true,
  )
  assert.deepEqual(after, [0, 1])
  const denied = await targetRuntime({ findConversation: async () => null })
  assert.equal(
    await denied.readableReportTarget(
      'message',
      'synthetic-target',
      'synthetic-conversation',
      () => true,
    ),
    false,
  )
  const malformed = await targetRuntime({
    listMessages: async () => ({
      items: [{ message_id: 'synthetic-target', delivery_seq: 0 }],
      next_after_seq: 0,
    }),
  })
  await assert.rejects(
    malformed.readableReportTarget(
      'message',
      'synthetic-target',
      'synthetic-conversation',
      () => true,
    ),
  )
})
test('REQ-016/018：处罚必须属于本人当前通知且类型与引用精确匹配', async () => {
  const cursors: unknown[] = []
  const api = await targetRuntime({
    listNotifications: async (cursor?: string) => {
      cursors.push(cursor)
      return cursor
        ? {
            items: [{ id: 'synthetic-notice', kind: 'penalty_notice', target_ref: initial.id }],
            next_cursor: null,
          }
        : { items: [], next_cursor: 'opaque/+' }
    },
  })
  assert.equal(await api.ownPenaltyNotification('synthetic-notice', initial.id, () => true), true)
  assert.deepEqual(cursors, [undefined, 'opaque/+'])
  assert.equal(
    await api.ownPenaltyNotification('synthetic-notice', 'synthetic-other', () => true),
    false,
  )
  assert.equal(await api.ownPenaltyNotification('synthetic-notice', initial.id, () => false), false)
  const wrongKind = await targetRuntime({
    listNotifications: async () => ({
      items: [{ id: 'synthetic-notice', kind: 'appeal_result', target_ref: initial.id }],
      next_cursor: null,
    }),
  })
  assert.equal(
    await wrongKind.ownPenaltyNotification('synthetic-notice', initial.id, () => true),
    false,
  )
})
test('REQ-016/018：申诉确认期间权限撤回、取消与离页均不写入，正文不持久化', async () => {
  const s = await setup('safety', {
    tab: 'appeals',
    penaltyId: initial.id,
    notificationId: 'synthetic-notice',
  })
  s.r.body.value = '合成申诉正文'
  s.cancel()
  await s.r.appeal()
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  s.delay()
  const pending = s.r.appeal()
  await s.r.appeal()
  s.hooks.hide()
  s.confirm()
  await pending
  assert.equal(s.calls.filter((x) => x.method).length, 0)
  assert.equal(s.r.body.value, '')
  const code = readFileSync(new URL('../src/pages/safety/index.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(code, /setStorage|localStorage|sessionStorage/)
  const revoked = await setup('safety', {
    tab: 'appeals',
    penaltyId: initial.id,
    notificationId: 'synthetic-notice',
  })
  revoked.r.body.value = '合成说明'
  revoked.delay()
  const confirming = revoked.r.appeal()
  revoked.user.user!.allowed_actions = []
  revoked.confirm()
  await confirming
  assert.equal(revoked.calls.filter((x) => x.method).length, 0)
})
test('REQ-018：同账号令牌epoch变化时忽略晚到回执并解除忙碌状态', async () => {
  const s = await setup('report', { kind: 'wish', id: 'synthetic-wish' })
  s.r.code.value = 'synthetic-code'
  assert.equal(s.r.maySubmit.value, true)
  let done: (value: unknown) => void = () => {}
  s.transport(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  const pending = s.r.submit()
  await settle()
  s.epoch()
  done({ id: 'synthetic-receipt', version: 1, status: 'pending' })
  await pending
  assert.equal(s.r.writing.value, false)
  assert.equal(s.r.finished.value, false)
  assert.equal(s.r.ready.value, false)
  assert.equal(s.r.notice.value, '')
})
