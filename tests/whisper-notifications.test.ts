import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { session } from '../src/utils/session.ts'
import { settle } from './support/page-runtime.ts'
import { WhisperTestError as RequestError } from './support/whispers-runtime.ts'
import { setup, sample, postId } from './support/whisper-pages-runtime.ts'

test('REQ-010：模块通知独立分页，空页游标继续，跨页ID去重，循环游标清列表', async () => {
  const s = await setup('notifications')
  assert.equal(s.runtime.unread.value, 1)
  let step = 0
  s.transport(
    async () =>
      [
        { items: [], next_cursor: 'opaque/a' },
        { items: [s.notification(), s.notification()], next_cursor: 'opaque/b' },
        { items: [], next_cursor: 'opaque/a' },
      ][step++],
  )
  await s.runtime.load()
  assert.equal(s.runtime.cursor.value, 'opaque/a')
  await s.runtime.load(true)
  assert.equal(s.runtime.items.value.length, 1)
  assert.match(s.calls.at(-1)!.url, /cursor=opaque%2Fa/)
  await s.runtime.load(true)
  assert.equal(s.runtime.items.value.length, 0)
  assert.match(s.runtime.page.error.value, /游标/)
})
test('REQ-010：通知已读取当前通知版本，失败未知不变已读且原键重试，冲突刷新不重放', async () => {
  const s = await setup('notifications')
  const original = s.defaultTransport()
  let fail = true
  s.transport(async (input) => {
    if (input.method === 'POST' && fail) {
      fail = false
      throw new RequestError('合成超时', -1)
    }
    return original(input)
  })
  await s.runtime.markRead(s.runtime.items.value[0])
  assert.equal(s.runtime.items.value[0].read, false)
  await s.runtime.page.retry()
  const writes = s.calls.filter((x) => x.method === 'POST')
  assert.deepEqual(writes[0], writes[1])
  assert.deepEqual(writes[0]!.data, { expected_version: 15 })
  assert.equal(s.runtime.items.value[0].version, 16)
  assert.equal(s.runtime.unread.value, 0)
  s.setNotification({ ...s.notification(), read: false, version: 17 })
  await s.runtime.load()
  s.transport(async (input) => {
    if (input.method === 'POST')
      throw new RequestError('合成冲突', 409, 'VERSION_CONFLICT', '', 409)
    return original(input)
  })
  await s.runtime.markRead(s.runtime.items.value[0])
  assert.equal(s.calls.filter((x) => x.method === 'POST').length, 3)
  assert.equal(s.runtime.page.retryReady.value, false)
})
test('REQ-010：通知点击重读父帖与指定暖评，可跨空页；失效暖评或404不得跳转和回显旧正文', async () => {
  const s = await setup('notifications')
  await s.runtime.open(s.runtime.items.value[0])
  assert.deepEqual(s.routes, [`/pages/whispers/detail?id=${postId}`])
  assert.equal(
    s.calls.some((x) => x.method === 'POST'),
    false,
  )
  const original = s.defaultTransport()
  let page = 0
  s.transport(async (input) => {
    if (input.url.includes('/comments')) {
      page++
      if (page === 1) return { items: [], next_cursor: 'next' }
    }
    return original(input)
  })
  await s.runtime.open(s.runtime.items.value[0])
  assert.equal(s.routes.length, 2)
  s.transport(async (input) =>
    input.url.includes('/comments') ? { items: [], next_cursor: null } : original(input),
  )
  await s.runtime.open(s.runtime.items.value[0])
  assert.equal(s.routes.length, 2)
  assert.equal(s.runtime.items.value.length, 0)
  assert.match(s.runtime.page.error.value, /不可访问/)
})
test('REQ-010/011：胶囊通知只读取当前本人状态，锁定无正文，刷新解锁与撤销均以服务端为准', async () => {
  const s = await setup('notifications')
  s.setNotification({
    ...s.notification(),
    kind: 'whisper_capsule_unlocked',
    target_kind: 'capsule',
    comment_id: null,
  })
  const original = s.defaultTransport()
  let current: Record<string, unknown> = {
    ...sample('Capsule'),
    id: postId,
    status: 'locked',
    body: null,
  }
  s.transport(async (input) =>
    input.url === `/me/whispers/capsules/${postId}` ? structuredClone(current) : original(input),
  )
  await s.runtime.load()
  await s.runtime.open(s.runtime.items.value[0])
  assert.equal(s.runtime.capsule.value.body, null)
  const selected = s.runtime.capsuleNotice.value
  await s.runtime.markRead(s.runtime.items.value[0])
  await s.runtime.open(selected)
  assert.equal(s.runtime.capsule.value.status, 'locked')
  current = { ...current, status: 'unlocked', body: '合成已解锁正文' }
  await s.runtime.open(s.runtime.items.value[0])
  assert.equal(s.runtime.capsule.value.body, '合成已解锁正文')
  s.transport(async () => {
    throw new RequestError('合成撤销', 404, 'NOT_FOUND', '', 404)
  })
  await s.runtime.open(s.runtime.items.value[0])
  assert.equal(s.runtime.capsule.value, null)
  assert.equal(s.routes.length, 0)
})
test('REQ-010/018：通知错配／字段泄漏拒绝，离页或换会话停止晚到跳转与私密回填', async () => {
  const s = await setup('notifications')
  s.setNotification({ ...s.notification(), target_kind: 'capsule' })
  await s.runtime.load()
  await s.runtime.open(s.runtime.items.value[0])
  assert.equal(s.routes.length, 0)
  assert.match(s.runtime.page.error.value, /不匹配/)
  s.setNotification({ ...s.notification(), target_kind: 'post' })
  s.transport(async () => ({
    items: [{ ...s.notification(), author_id: postId }],
    next_cursor: null,
  }))
  await s.runtime.load()
  assert.equal(s.runtime.items.value.length, 0)
  const late = await setup('notifications')
  let finish!: (value: unknown) => void
  late.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const opening = late.runtime.open(late.runtime.items.value[0])
  await settle()
  late.hide()
  finish(late.publicPost())
  await opening
  assert.equal(late.routes.length, 0)
  assert.equal(late.runtime.items.value.length, 0)
  assert.equal(late.runtime.capsule.value, null)
})
test('REQ-010/018：同账号换会话或切账号清通知与胶囊正文，晚到私有详情不得回填', async () => {
  const s = await setup('notifications')
  s.setNotification({
    ...s.notification(),
    kind: 'whisper_capsule_unlocked',
    target_kind: 'capsule',
    comment_id: null,
  })
  const original = s.defaultTransport()
  let finish!: (value: unknown) => void
  s.transport(async (input) =>
    input.url.includes('/capsules/')
      ? new Promise((resolve) => {
          finish = resolve
        })
      : original(input),
  )
  await s.runtime.load()
  const opening = s.runtime.open(s.runtime.items.value[0])
  await settle()
  session.setToken('synthetic-notification-new-session')
  finish({ ...sample('Capsule'), id: postId, status: 'unlocked', body: '合成晚到私密正文' })
  await opening
  assert.equal(s.runtime.capsule.value, null)
  assert.equal(s.runtime.items.value.length, 0)
  await s.runtime.load()
  s.user.user = { id: 'synthetic-other-owner' }
  assert.equal(s.runtime.items.value.length, 0)
  assert.equal(s.runtime.capsuleNotice.value, null)
})
test('REQ-010：页面注册与原通知入口分离，正文和身份不持久化，不新增回复树、作者跳转或抱抱通知', () => {
  const pages = JSON.parse(
    readFileSync(new URL('../src/pages.json', import.meta.url), 'utf8'),
  ).pages
  for (const name of ['comment-editor', 'notifications']) {
    assert.ok(pages.some((item: { path: string }) => item.path === `pages/whispers/${name}`))
    const source = readFileSync(
      new URL(`../src/pages/whispers/${name}.vue`, import.meta.url),
      'utf8',
    )
    assert.doesNotMatch(
      source,
      /setStorage|localStorage|v-html|public-profile|target_user_id|setInterval/,
    )
  }
  const source = readFileSync(new URL('../src/pages/inbox/index.vue', import.meta.url), 'utf8')
  assert.match(source, /pages\/whispers\/notifications/)
  assert.match(source, /listNotifications/)
})

test('REQ-010/018：游客不加载私有通知，缺已读动作不写；目标404或401清列表且不跳转', async () => {
  const guest = await setup('notifications', {}, true)
  assert.equal(guest.calls.length, 0)
  assert.match(guest.runtime.page.error.value, /登录/)
  const s = await setup('notifications')
  s.setNotification({ ...s.notification(), allowed_actions: [] })
  await s.runtime.load()
  await s.runtime.markRead(s.runtime.items.value[0])
  assert.equal(
    s.calls.some((x) => x.method === 'POST'),
    false,
  )
  const original = s.defaultTransport()
  s.transport(async (input) => {
    if (input.url.startsWith('/whispers/posts/'))
      throw new RequestError('合成不可见', 404, 'NOT_FOUND', '', 404)
    return original(input)
  })
  await s.runtime.open(s.runtime.items.value[0])
  assert.equal(s.routes.length, 0)
  assert.equal(s.runtime.items.value.length, 0)
  await s.runtime.load()
  s.transport(async () => {
    throw new RequestError('合成失效', 401, 'UNAUTHENTICATED', '', 401)
  })
  await s.runtime.open(s.runtime.items.value[0])
  assert.equal(s.runtime.items.value.length, 0)
  assert.equal(s.runtime.capsule.value, null)
  assert.match(s.runtime.page.error.value, /登录/)
})
