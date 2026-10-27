import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { session } from '../src/utils/session.ts'
import { whisperOperations, whisperSchemas, whisperWrites } from '../src/utils/whispers-contract.ts'
import { matchesSchema } from '../src/utils/whispers-schema.ts'
import { loadRuntime, settle } from './support/page-runtime.ts'
import { whispersRuntime, WhisperTestError } from './support/whispers-runtime.ts'
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/whispers.json', import.meta.url), 'utf8'),
) as {
  exchanges: {
    operation_id: string
    direction: string
    method: string
    path_template: string
    parameters: Record<string, unknown>
    body: unknown
  }[]
  fixtures: { name: string; schema: string; body: unknown; valid: boolean }[]
}
const key = '6c500000-0000-4000-8000-000000000099'
function sample(name: string) {
  return structuredClone(
    fixture.fixtures.find((f) => f.schema === name && f.valid)!.body,
  ) as Record<string, unknown>
}
function inputFor(operation: string) {
  const spec = whisperOperations[operation]!
  const exchange =
    fixture.exchanges.find((e) => e.operation_id === operation && e.direction === 'request') ??
    fixture.exchanges.find((e) => e.operation_id === operation)!
  const input: Record<string, unknown> = {}
  for (const kind of ['path', 'query']) {
    const schema = spec.input.properties?.[kind]
    if (schema)
      input[kind] = Object.fromEntries(
        Object.keys(schema.properties!)
          .map((name) => [name, exchange.parameters[name]])
          .filter(([, v]) => v !== undefined),
      )
  }
  if (spec.method !== 'GET') {
    input.data = exchange.body
    input.key = key
  }
  return input
}
test('REQ-009/010/011/014/018：固定契约32个学生端操作与正式正反夹具严格消费', async () => {
  assert.equal(Object.keys(whisperOperations).length, 32)
  for (const f of fixture.fixtures) {
    if (whisperSchemas[f.schema])
      assert.equal(
        matchesSchema(whisperSchemas[f.schema]!, f.body, whisperSchemas),
        f.valid,
        f.name,
      )
  }
  session.setToken('synthetic-whispers')
  for (const [operation, spec] of Object.entries(whisperOperations)) {
    const input = inputFor(operation)
    const response = fixture.exchanges.find(
      (e) => e.operation_id === operation && e.direction === 'response',
    )!
    const expected = (response?.body as { data?: unknown } | null)?.data
    let sent: Record<string, unknown> = {}
    let calls = 0
    const api = await whispersRuntime(async (options) => {
      calls++
      sent = options
      return expected
    }, session)
    assert.deepEqual(await api.callWhisper(operation, input), expected, operation)
    const official = fixture.exchanges.find((e) => e.operation_id === operation)!
    assert.equal(sent.method, official.method)
    const requestInput = input as {
      path?: Record<string, string>
      query?: Record<string, string | number>
    }
    let expectedUrl = official.path_template.replace(/\{([^}]+)\}/g, (_, name: string) =>
      encodeURIComponent(requestInput.path![name]!),
    )
    const query = Object.entries(requestInput.query ?? {})
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('&')
    if (query) expectedUrl += '?' + query
    assert.equal(sent.url, expectedUrl)
    if (spec.method !== 'GET') {
      assert.deepEqual(sent.data, input.data)
      assert.equal((sent.header as Record<string, string>)['Idempotency-Key'], key)
      const bad = structuredClone(input)
      ;(bad.data as Record<string, unknown>).unexpected = true
      await assert.rejects(api.callWhisper(operation, bad))
      await assert.rejects(api.callWhisper(operation, { ...input, key: 'not-uuid' }))
      assert.equal(calls, 1)
    }
    await assert.rejects(api.callWhisper(operation, { ...input, unexpected: true }))
  }
})
test('REQ-009/011/018：500码点、不规范化、未知字段枚举、私密屏障和锁定泄漏拒绝', () => {
  const request = { body: '😀'.repeat(500), identity: { mode: 'anonymous' } }
  assert.equal(matchesSchema(whisperSchemas.PostCreate!, request, whisperSchemas), true)
  for (const body of ['😀'.repeat(501), ' \n ', '\ud800'])
    assert.equal(
      matchesSchema(whisperSchemas.PostCreate!, { ...request, body }, whisperSchemas),
      false,
    )
  assert.equal(
    matchesSchema(whisperSchemas.PostCreate!, { ...request, body: ' e\u0301 ' }, whisperSchemas),
    true,
  )
  assert.equal(
    matchesSchema(
      whisperSchemas.IdentityInput!,
      { mode: 'named', nickname_version: 1, author_id: key },
      whisperSchemas,
    ),
    false,
  )
  const pub = sample('PublicPost')
  assert.equal(
    matchesSchema(whisperSchemas.PublicPost!, { ...pub, author_id: key }, whisperSchemas),
    false,
  )
  assert.equal(
    matchesSchema(
      whisperSchemas.PublicPost!,
      { ...pub, allowed_actions: ['new_action'] },
      whisperSchemas,
    ),
    false,
  )
  const capsule = sample('Capsule')
  assert.equal(
    matchesSchema(
      whisperSchemas.Capsule!,
      { ...capsule, status: 'locked', body: '不能提前读取' },
      whisperSchemas,
    ),
    false,
  )
  const owner = sample('OwnerPost')
  assert.equal(
    matchesSchema(
      whisperSchemas.OwnerPost!,
      { ...owner, status: 'privacy_hold', body: '旧正文' },
      whisperSchemas,
    ),
    false,
  )
  assert.equal(
    matchesSchema(
      whisperSchemas.BlockEntry!,
      { block_id: key, version: 1, label: '已屏蔽对象', allowed_actions: [], target_user_id: key },
      whisperSchemas,
    ),
    false,
  )
})
test('REQ-014/018：写动作按资源投影收口，未知动作关闭；DELETE保留JSON版本与UUID键', async () => {
  session.setToken('synthetic-whispers')
  const api = await whispersRuntime(async () => undefined, session)
  for (const write of whisperWrites) {
    for (const projection of write.projection.replace('.allowed_actions', '').split('/')) {
      const resource = { ...sample(projection), allowed_actions: [write.operation_id] }
      assert.equal(
        api.canWhisperAction(projection, resource, write.operation_id),
        true,
        write.operation_id + projection,
      )
      assert.equal(
        api.canWhisperAction(
          projection,
          { ...resource, allowed_actions: [write.operation_id, 'future'] },
          write.operation_id,
        ),
        false,
      )
    }
  }
  assert.equal(api.canWhisperAction('Workspace', sample('Workspace'), 'deleteMeBlocks'), false)
  assert.match(
    api.whisperKey(),
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  )
})
test('REQ-018：无会话私有请求不发送，公共读取可用，换会话晚到响应不返回', async () => {
  session.clear()
  let calls = 0
  const api = await whispersRuntime(async () => {
    calls++
    return sample('ModuleConfig')
  }, session)
  await api.callWhisper('whisperConfigGet', {})
  await assert.rejects(api.callWhisper('whisperWorkspaceGet', {}))
  assert.equal(calls, 1)
  session.setToken('synthetic-old')
  let done: (value: unknown) => void = () => {}
  const delayed = await whispersRuntime(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
    session,
  )
  const pending = delayed.callWhisper('whisperWorkspaceGet', {})
  session.setToken('synthetic-new')
  done(sample('Workspace'))
  await assert.rejects(pending, /会话已变化/)
})
test('REQ-018：页面作用域未知结果保留原键原体，仅内存重试；成功、离页、同账号换会话清稿', async () => {
  session.setToken('synthetic-scope')
  const sent: Record<string, unknown>[] = []
  let fail = true
  const api = await whispersRuntime(async (options) => {
    sent.push(options)
    if (fail) throw new WhisperTestError('网络超时', -1)
    return { accepted: true }
  }, session)
  const scope = api.createWhisperScope()
  scope.draft.value = '合成正文'
  const input = { data: { source: { kind: 'public_profile', id: key } }, key }
  await assert.rejects(scope.send('interactionBlockCreate', input))
  input.key = '6c500000-0000-4000-8000-000000000088'
  await assert.rejects(scope.send('interactionBlockCreate', input))
  assert.equal(sent.length, 1)
  fail = false
  await scope.retry()
  assert.deepEqual(sent[0], sent[1])
  assert.equal(scope.pending.value, null)
  assert.equal(scope.draft.value, '')
  fail = true
  await assert.rejects(scope.send('interactionBlockCreate', input))
  scope.close()
  assert.equal(scope.pending.value, null)
  await assert.rejects(scope.retry())
  const next = api.createWhisperScope()
  next.draft.value = '新会话前的草稿'
  await assert.rejects(next.send('interactionBlockCreate', input))
  session.setToken('synthetic-same-account-new-session')
  assert.equal(next.pending.value, null)
  assert.equal(next.draft.value, '')
  await assert.rejects(next.send('interactionBlockCreate', input))
})
test('REQ-018：共享配置与Workspace只接受最新读取，同账号换会话立即清理', async () => {
  setActivePinia(createPinia())
  session.setToken('synthetic-store')
  const user = (await import('vue')).reactive({ user: { id: 'synthetic-owner' } })
  let resolve: (value: unknown) => void = () => {}
  let delayed = false
  const runtime = await loadRuntime(
    readFileSync(new URL('../src/stores/whispers.ts', import.meta.url), 'utf8'),
    {
      defineStore: (await import('pinia')).defineStore,
      useUserStore: () => user,
      session,
      callWhisper: async (operation: string) => {
        if (delayed)
          return new Promise((done) => {
            resolve = done
          })
        return operation === 'whisperConfigGet'
          ? { ...sample('ModuleConfig'), enabled: true }
          : sample('Workspace')
      },
    },
  )
  const store = runtime.useWhispersStore()
  await store.refresh()
  assert.ok(store.workspace)
  session.setToken('synthetic-replaced')
  assert.equal(store.workspace, null)
  assert.equal(store.config, null)
  delayed = true
  const pending = store.refresh()
  await settle()
  session.clear()
  resolve({ ...sample('ModuleConfig'), enabled: true })
  await pending
  assert.equal(store.config, null)
  assert.equal(store.workspace, null)
})

test('REQ-010/014：写版本分别取本人、父帖与抱抱记录，计数和账号版本不参与', async () => {
  const api = await whispersRuntime(async () => undefined, session)
  const post = {
    ...sample('PublicPost'),
    id: String(sample('PublicPost').id),
    version: 11,
    comments_epoch: 7,
    hug_count: 90,
    my_hug: { active: false, version: 0 },
    allowed_actions: ['whisperHugSet', 'whisperCommentCreate'],
  }
  const comment = {
    ...sample('OwnerComment'),
    version: 5,
    post_id: post.id,
    allowed_actions: ['whisperCommentUpdate'],
  }
  assert.deepEqual(api.whisperVersionFields('PublicPost', post, 'whisperHugSet'), {
    expected_post_version: 11,
    expected_hug_version: 0,
  })
  assert.deepEqual(api.whisperVersionFields('PublicPost', post, 'whisperCommentCreate'), {
    expected_post_version: 11,
    expected_comments_epoch: 7,
  })
  assert.deepEqual(
    api.whisperVersionFields('OwnerComment', comment, 'whisperCommentUpdate', post),
    { expected_version: 5, expected_post_version: 11, expected_comments_epoch: 7 },
  )
  assert.throws(() =>
    api.whisperVersionFields('OwnerComment', comment, 'whisperCommentUpdate', { ...post, id: key }),
  )
  const block = { ...sample('BlockEntry'), version: 3, allowed_actions: ['interactionBlockDelete'] }
  assert.deepEqual(api.whisperVersionFields('BlockEntry', block, 'interactionBlockDelete'), {
    expected_version: 3,
  })
  assert.throws(() => api.whisperVersionFields('BlockEntry', block, 'whisperPostSubmit'))
})
