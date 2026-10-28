import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setup, sample, postId } from './support/whisper-pages-runtime.ts'
import { settle } from './support/page-runtime.ts'
import { WhisperTestError as RequestError } from './support/whispers-runtime.ts'
import { session } from '../src/utils/session.ts'
import { beijingTime, capsuleStatus } from '../src/utils/capsules.ts'
import type { Capsule } from '../src/types/whispers.ts'
function capsule(status = 'locked', body: string | null = null) {
  return {
    ...sample('Capsule'),
    id: postId,
    version: 9,
    status,
    body,
    allowed_actions: ['whisperCapsuleCancel', 'whisperCapsuleDelete'],
  }
}
async function create() {
  const s = await setup('capsules/create')
  s.workspace.allowed_actions.push('whisperCapsuleCreate')
  await s.runtime.load()
  s.runtime.body.value = '合成私人信件'
  s.runtime.accepted.value = true
  return s
}
async function detail(value = capsule()) {
  const s = await setup('capsules/detail', { id: postId })
  s.transport(async () => structuredClone(value))
  await s.runtime.load()
  return s
}
test('REQ-011：默认服务端次日同刻；显式告知、码点不裁剪，202仅受理且立即清稿防重复创建', async () => {
  const s = await create()
  const defaultTime = beijingTime(
    new Date(Date.parse(s.moduleConfig.server_now as string) + 86400000).toISOString(),
  )
  assert.equal(
    `${s.runtime.date.value} ${s.runtime.time.value}:${s.runtime.second.value}`,
    defaultTime,
  )
  const original = s.defaultTransport()
  s.transport(async (i) =>
    i.method === 'POST' ? { ...capsule('scanning'), body: null } : original(i),
  )
  s.runtime.accepted.value = false
  await s.runtime.submit()
  assert.match(s.runtime.page.error.value, /确认/)
  s.runtime.accepted.value = true
  for (const text of [' ', '\ud800', '😀'.repeat(501)]) {
    s.runtime.body.value = text
    await s.runtime.submit()
    assert.match(s.runtime.page.error.value, /码点/)
  }
  s.runtime.body.value = '😀'.repeat(500)
  await s.runtime.submit()
  const writes = s.calls.filter((i) => i.method === 'POST')
  assert.equal(writes.length, 1)
  assert.equal(writes[0]!.data!.body, '😀'.repeat(500))
  assert.equal(writes[0]!.data!.safety_notice_accepted, true)
  assert.match(String(writes[0]!.data!.unlock_at), /T\d{2}:\d{2}:\d{2}Z$/)
  assert.equal(s.runtime.body.value, '')
  assert.equal(s.runtime.receipt.value.body, null)
  assert.match(s.runtime.page.notice.value, /受理/)
  await s.runtime.submit()
  assert.equal(s.calls.filter((i) => i.method === 'POST').length, 1)
})
test('REQ-011：游客、无动作、模块关闭不创建；未认证但正常且允许动作可封存', async () => {
  const guest = await setup('capsules/create', {}, true)
  assert.equal(guest.calls.length, 0)
  await guest.runtime.submit()
  assert.equal(guest.calls.length, 0)
  const s = await setup('capsules/create')
  await s.runtime.submit()
  assert.equal(s.calls.filter((i) => i.method === 'POST').length, 0)
  s.workspace.verification = 'unverified'
  s.workspace.allowed_actions.push('whisperCapsuleCreate')
  await s.runtime.load()
  assert.equal(s.runtime.canCreate.value, true)
  s.moduleConfig.enabled = false
  await s.runtime.load()
  assert.equal(s.runtime.canCreate.value, false)
})
test('REQ-011：列表仅元数据，空页续翻、去重与循环拒绝；游客和私密正文泄漏清空', async () => {
  const guest = await setup('capsules/index', {}, true)
  assert.equal(guest.calls.length, 0)
  const s = await setup('capsules/index')
  let count = 0
  s.transport(async () => {
    count++
    if (count === 1) return { items: [], next_cursor: 'next-a' }
    if (count === 2) return { items: [capsule('unlocked')], next_cursor: 'next-b' }
    return {
      items: [{ ...capsule('unlocked'), version: 10 }],
      next_cursor: count === 3 ? 'next-c' : 'next-b',
    }
  })
  await s.runtime.load()
  assert.equal(s.runtime.cursor.value, 'next-a')
  await s.runtime.load(true)
  await s.runtime.load(true)
  assert.equal(s.runtime.items.value.length, 1)
  assert.equal(s.runtime.items.value[0].version, 10)
  await s.runtime.load(true)
  assert.equal(s.runtime.items.value.length, 0)
  assert.match(s.runtime.page.error.value, /游标/)
  s.transport(async () => ({ items: [capsule('unlocked', '合成泄漏')], next_cursor: null }))
  await s.runtime.load()
  assert.equal(s.runtime.items.value.length, 0)
})
test('REQ-011：详情依当前状态读取，到期仍审核不得解锁；未认证或受罚不额外阻断已有胶囊', async () => {
  const s = await detail(capsule('review_pending'))
  s.user.validated = false
  s.workspace.verification = 'unverified'
  s.workspace.write_restricted = true
  assert.equal(s.runtime.record.value.body, null)
  const due = { ...capsule('review_pending'), server_now: '2030-01-01T00:00:00Z' }
  assert.match(capsuleStatus(due as Capsule), /等待安全处理/)
  s.transport(async () => capsule('unlocked', '合成到期正文'))
  await s.runtime.load()
  assert.equal(s.runtime.record.value.body, '合成到期正文')
  s.transport(async () => capsule('isolated', '合成非法正文'))
  await s.runtime.load()
  assert.equal(s.runtime.record.value, null)
  for (const status of [401, 404]) {
    s.transport(async () => {
      throw new RequestError('合成不可访问', status, '', '', status)
    })
    await s.runtime.load()
    assert.equal(s.runtime.record.value, null)
  }
})
test('REQ-011：取消/删除取当前版本和动作，回执清正文，409只重读不重放，目标错配清除', async () => {
  for (const operation of ['whisperCapsuleCancel', 'whisperCapsuleDelete']) {
    const s = await detail(capsule('unlocked', '合成可读正文'))
    s.transport(async () => capsule(operation.endsWith('Cancel') ? 'cancelled' : 'deleted'))
    await s.runtime.command(operation)
    const write = s.calls.find((i) => i.method === 'POST')!
    assert.deepEqual(write.data, { expected_version: 9 })
    assert.equal(s.runtime.record.value.body, null)
    assert.ok(write.header!['Idempotency-Key'])
  }
  const s = await detail({ ...capsule(), allowed_actions: [] })
  await s.runtime.command('whisperCapsuleCancel')
  assert.equal(s.calls.filter((i) => i.method === 'POST').length, 0)
  s.transport(async () => capsule())
  await s.runtime.load()
  s.transport(async (i) => {
    if (i.method === 'POST') throw new RequestError('合成换版', 409, 'VERSION_CONFLICT', '', 409)
    return { ...capsule(), version: 10 }
  })
  await s.runtime.command('whisperCapsuleCancel')
  assert.equal(s.runtime.record.value.version, 10)
  assert.equal(s.calls.filter((i) => i.method === 'POST').length, 1)
  assert.equal(s.runtime.page.retryReady.value, false)
  s.transport(async () => ({ ...capsule(), id: '6c500000-0000-4000-8000-000000000002' }))
  await s.runtime.command('whisperCapsuleDelete')
  assert.equal(s.runtime.record.value, null)
})
test('REQ-011：创建与命令双击串行，结果未知使用原键原体重试；额度与频率提示', async () => {
  const s = await create()
  s.transport(async () => {
    throw new RequestError('合成超时', -1)
  })
  await Promise.all([s.runtime.submit(), s.runtime.submit()])
  const first = s.calls.find((i) => i.method === 'POST')!
  assert.equal(s.calls.filter((i) => i.method === 'POST').length, 1)
  assert.equal(s.runtime.page.retryReady.value, true)
  s.runtime.body.value = '合成改动不得进入重试'
  s.transport(async () => capsule('scanning'))
  await s.runtime.page.retry()
  assert.deepEqual(s.calls.filter((i) => i.method === 'POST')[1], first)
  assert.equal(s.runtime.body.value, '')
  const d = await detail()
  d.transport(async () => {
    throw new RequestError('合成超时', -1)
  })
  await Promise.all([
    d.runtime.command('whisperCapsuleCancel'),
    d.runtime.command('whisperCapsuleCancel'),
  ])
  const cmd = d.calls.find((i) => i.method === 'POST')!
  d.transport(async () => capsule('cancelled'))
  await d.runtime.page.retry()
  assert.deepEqual(d.calls.filter((i) => i.method === 'POST')[1], cmd)
  for (const [status, code, pattern] of [
    [409, 'CAPSULE_LIMIT', /20个/],
    [429, 'RATE_LIMITED', /稍后/],
  ] as const) {
    const c = await create()
    const original = c.defaultTransport()
    c.transport(async (i) => {
      if (i.method === 'POST') throw new RequestError('合成限额', status, code, '', status)
      return original(i)
    })
    await c.runtime.submit()
    assert.match(c.runtime.page.error.value + c.runtime.page.notice.value, pattern)
  }
})
test('REQ-011/018：离页/同账号换会话清稿和正文，迟到创建或详情不回填，无私密持久化或本地解锁', async () => {
  const s = await create()
  let finish!: (value: unknown) => void
  s.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = s.runtime.submit()
  await settle()
  s.hide()
  finish(capsule('scanning'))
  await pending
  assert.equal(s.runtime.body.value, '')
  assert.equal(s.runtime.receipt.value, null)
  assert.equal(s.runtime.page.retryReady.value, false)
  const d = await detail(capsule('unlocked', '合成当前正文'))
  d.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const reading = d.runtime.load()
  await settle()
  session.setToken('synthetic-capsule-new-session')
  finish(capsule('unlocked', '合成晚到正文'))
  await reading
  assert.equal(d.runtime.record.value, null)
  const c = await create()
  c.user.user = { id: 'synthetic-another-owner' }
  assert.equal(c.runtime.body.value, '')
  const pages = JSON.parse(
    readFileSync(new URL('../src/pages.json', import.meta.url), 'utf8'),
  ).pages
  for (const name of ['index', 'create', 'detail']) {
    assert.ok(pages.some((p: { path: string }) => p.path === 'pages/capsules/' + name))
    const code = readFileSync(new URL(`../src/pages/capsules/${name}.vue`, import.meta.url), 'utf8')
    assert.doesNotMatch(code, /setStorage|localStorage|v-html|setInterval/)
  }
})
