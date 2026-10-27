import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { whispersRuntime, WhisperTestError as RequestError } from './support/whispers-runtime.ts'
import { session as realSession } from '../src/utils/session.ts'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
const actor = {
  id: 'synthetic-owner',
  version: 19,
  nickname: '合成昵称',
  verification: 'unverified' as const,
  hide_identity_tags: true,
  allowed_actions: ['putMeProfile'],
}
type Input = {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}
async function setup(query: Record<string, string> = {}, useRealSession = false) {
  if (useRealSession) realSession.setToken('synthetic-settings-token')
  let epoch = 1
  let token = 'synthetic-token'
  const user = reactive({
    user: structuredClone(actor) as typeof actor | null,
    validated: true,
    refresh: async () => {},
  })
  const hooks: Record<string, (query?: Record<string, string>) => unknown> = {}
  const calls: Input[] = []
  const workspace = {
    server_now: '2026-10-27T04:00:00Z',
    verification: 'unverified',
    write_restricted: false,
    allowed_actions: ['interactionBlockCreate'],
  }
  let transport: (input: Input) => Promise<unknown> = async (input) => {
    if (input.url === '/me/whispers') return structuredClone(workspace)
    if (input.url.startsWith('/me/interaction-blocks?'))
      return {
        items: [
          {
            block_id: '6c500000-0000-4000-8000-000000000002',
            version: 3,
            label: '已屏蔽对象',
            allowed_actions: ['interactionBlockDelete'],
          },
        ],
        next_cursor: null,
      }
    if (input.url.startsWith('/users/'))
      return {
        profile: { id: '6c500000-0000-4000-8000-000000000002', nickname: '合成对方' },
        items: [],
        next_cursor: null,
      }
    if (input.url === '/me/profile') return { ...actor, ...input.data, version: 20 }
    if (input.url === '/me/interaction-blocks') return { accepted: true }
    return undefined
  }
  const session = useRealSession ? realSession : { getEpoch: () => epoch, getToken: () => token }
  const helpers = await whispersRuntime(async (options) => {
    const input = options as Input
    calls.push(input)
    // Workspace 由正式投影独立提供，旧Me动作不再控制黑名单。
    if (input.url === '/me/whispers') return structuredClone(workspace)
    return transport(input)
  }, session)
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/settings.ts', import.meta.url), 'utf8'),
    {
      callWhisper: helpers.callWhisper,
      request: async (input: Input) => {
        calls.push(input)
        return transport(input)
      },
    },
  )
  let confirmed = true
  let delayed = false
  let modal: (() => void) | undefined
  const prompts: string[] = []
  const config = { useMock: false }
  const runtime = await loadRuntime(
    pageScript(new URL('../src/pages/settings/index.vue', import.meta.url)) +
      '\nexport { me,currentMe,nickname,hidden,rows,blocksReady,cursor,targetName,busy,writing,error,notice,load,act,allowed,retryWrite,retryReady,workspace }',
    {
      config,
      session: useRealSession ? realSession : { getEpoch: () => epoch, getToken: () => token },
      useUserStore: () => user,
      ...api,
      ...helpers,
      RequestError,
      getWish: (id: string) => {
        const input = { url: `/wishes/${encodeURIComponent(id)}` }
        calls.push(input)
        return transport(input)
      },
      getStory: (id: string) => {
        const input = { url: `/stories/${encodeURIComponent(id)}` }
        calls.push(input)
        return transport(input)
      },
      getPublicProfile: (id: string) => {
        const input = { url: `/users/${encodeURIComponent(id)}/public-profile` }
        calls.push(input)
        return transport(input)
      },
      uni: {
        showModal: (options: {
          content: string
          success: (result: { confirm: boolean }) => void
        }) => {
          prompts.push(options.content)
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
    runtime,
    user,
    hooks,
    calls,
    prompts,
    config,
    workspace,
    transport: (fn: typeof transport) => {
      transport = fn
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
    confirm: () => modal!(),
  }
}
test('REQ-002/014：资料按本人版本提交，显式发送 false，成功从共享状态重新读取', async () => {
  const s = await setup()
  const r = s.runtime
  assert.equal(r.allowed('putMeProfile'), true) // 普通资料不额外要求学生认证。
  s.user.refresh = async () => {
    s.user.user = { ...actor, version: 20, nickname: '新昵称', hide_identity_tags: false }
  }
  r.nickname.value = '新昵称'
  r.hidden.value = false
  await r.act('profile')
  const input = s.calls.find((x) => x.method === 'PUT')!
  assert.deepEqual(input.data, {
    nickname: '新昵称',
    hide_identity_tags: false,
    expected_version: 19,
  })
  assert.ok(input.header?.['Idempotency-Key'])
  assert.equal(r.nickname.value, '新昵称')
  assert.equal(r.currentMe.value.version, 20)
  assert.equal(r.hidden.value, false)
})
test('REQ-014/018：隐藏字段缺省不擅自填充，空白昵称拒绝，无本地持久化', async () => {
  const s = await setup()
  const r = s.runtime
  s.user.refresh = async () => {
    s.user.user = { ...actor, hide_identity_tags: undefined } as unknown as typeof actor
  }
  await r.load()
  assert.equal(r.hidden.value, null)
  await r.act('profile')
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  r.hidden.value = true
  r.nickname.value = ' \n '
  await r.act('profile')
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  const source = readFileSync(new URL('../src/pages/settings/index.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setStorage|localStorage|student_number|asset_id/)
})
test('REQ-014：解除使用本人黑名单条目版本，204 后重读，旧申请消息不会自动恢复', async () => {
  const s = await setup()
  const r = s.runtime
  const entry = r.rows.value[0]
  await r.act('unblock', entry)
  const input = s.calls.find((x) => x.method === 'DELETE')!
  assert.equal(input.url, '/me/interaction-blocks/6c500000-0000-4000-8000-000000000002')
  assert.deepEqual(input.data, { expected_version: 3 })
  assert.match(s.prompts[0]!, /不会恢复旧申请、旧消息/)
  assert.equal(s.calls.filter((x) => x.url.startsWith('/me/interaction-blocks?')).length, 2)
  assert.equal(s.calls.filter((x) => x.method && x.method !== 'GET').length, 1)
})
test('REQ-014：拉黑只取已重验公开主页的目标，不接受路由昵称，禁止拉黑自己', async () => {
  const s = await setup({ targetId: '6c500000-0000-4000-8000-000000000002', nickname: '伪造昵称' })
  const r = s.runtime
  assert.equal(r.targetName.value, '合成对方')
  await r.act('block')
  assert.deepEqual(s.calls.find((x) => x.method === 'POST')?.data, {
    source: { kind: 'public_profile', id: '6c500000-0000-4000-8000-000000000002' },
  })
  assert.match(s.prompts[0]!, /合成对方/)
  assert.match(s.prompts[0]!, /现有匹配需另行退出/)
  const own = await setup({ targetId: actor.id })
  await own.runtime.act('block')
  assert.equal(
    own.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
})
test('REQ-014：公开主页失效或错目标时拒绝拉黑', async () => {
  const s = await setup({ targetId: 'synthetic-missing' })
  const r = s.runtime
  assert.equal(r.targetName.value, '')
  await r.act('block')
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  s.transport(async () => {
    throw new RequestError('合成缺失', 404, 'NOT_FOUND', '', 404)
  })
  await r.load()
  assert.equal(r.targetName.value, '')
  await r.act('block')
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
})
test('REQ-014：分页游标编码、按目标去重更新版本、循环或读取失败清空旧黑名单', async () => {
  const s = await setup()
  const r = s.runtime
  let page = 0
  s.transport(async () =>
    ++page === 1
      ? {
          items: [
            {
              block_id: '6c500000-0000-4000-8000-000000000002',
              version: 4,
              label: '已屏蔽对象',
              allowed_actions: ['interactionBlockDelete'],
            },
          ],
          next_cursor: 'a/b+?',
        }
      : {
          items: [
            {
              block_id: '6c500000-0000-4000-8000-000000000002',
              version: 5,
              label: '已屏蔽对象',
              allowed_actions: ['interactionBlockDelete'],
            },
            {
              block_id: '6c500000-0000-4000-8000-000000000003',
              version: 2,
              label: '已屏蔽对象',
              allowed_actions: ['interactionBlockDelete'],
            },
          ],
          next_cursor: null,
        },
  )
  await r.load()
  await r.load(true)
  assert.match(s.calls.at(-1)!.url, /cursor=a%2Fb%2B%3F/)
  assert.equal(r.rows.value.length, 2)
  assert.equal(r.rows.value[0].version, 5)
  s.transport(async () => ({ items: [], next_cursor: 'same' }))
  await r.load()
  await r.load(true)
  assert.equal(r.blocksReady.value, false)
  assert.deepEqual(r.rows.value, [])
  assert.equal(r.currentMe.value.id, actor.id) // 列表失败不阻止独立的资料设置。
})
test('REQ-014/018：未校验时拒绝写入，解除只依赖当前条目动作，不使用旧Me动作', async () => {
  const s = await setup()
  const r = s.runtime
  s.user.validated = false
  await r.act('profile')
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  s.user.validated = true
  s.user.user!.allowed_actions = []
  r.rows.value[0].allowed_actions = []
  await r.act('profile')
  await r.act('unblock', r.rows.value[0])
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  s.user.user!.allowed_actions = []
  await r.load()
  await r.act('unblock', r.rows.value[0])
  assert.equal(s.calls.filter((x) => x.method && x.method !== 'GET').length, 1)
})
test('REQ-014：取消、离页后的确认、重复点击均不产生额外写入', async () => {
  const cancelled = await setup()
  cancelled.cancel()
  await cancelled.runtime.act('profile')
  assert.equal(
    cancelled.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  const s = await setup()
  s.delay()
  const pending = s.runtime.act('profile')
  await s.runtime.act('profile')
  s.hooks.hide()
  s.confirm()
  await pending
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  assert.equal(s.runtime.nickname.value, '')
  assert.deepEqual(s.runtime.rows.value, [])
})
test('REQ-014/018：409 和不确定结果只重读不重发，后续人工操作使用新幂等键', async () => {
  const s = await setup()
  const r = s.runtime
  s.transport(async (input) => {
    if (input.method && input.method !== 'GET')
      throw new RequestError('合成冲突', 409, 'VERSION_CONFLICT', '', 409)
    return { items: [], next_cursor: null }
  })
  await r.act('profile')
  assert.match(r.notice.value, /版本或状态已变化/)
  assert.equal(s.calls.filter((x) => x.method && x.method !== 'GET').length, 1)
  s.transport(async (input) => {
    if (input.method && input.method !== 'GET') throw new Error('合成网络超时')
    return { items: [], next_cursor: null }
  })
  await r.act('profile')
  assert.match(r.notice.value, /结果尚未确认/)
  const writes = s.calls.filter((x) => x.method && x.method !== 'GET')
  assert.equal(writes.length, 2)
  assert.notEqual(writes[0].header!['Idempotency-Key'], writes[1].header!['Idempotency-Key'])
})
test('REQ-018：账号变化及晚到响应清理旧昵称、目标、黑名单与写权限', async () => {
  const s = await setup({ targetId: '6c500000-0000-4000-8000-000000000002' })
  const r = s.runtime
  let resolve: (value: unknown) => void = () => {}
  s.transport(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = r.act('profile')
  await settle()
  s.user.user = { ...actor, id: 'synthetic-new' }
  resolve(actor)
  await pending
  assert.equal(r.currentMe.value, null)
  assert.equal(r.nickname.value, '')
  assert.equal(r.targetName.value, '')
  assert.deepEqual(r.rows.value, [])
  assert.equal(r.allowed('putMeProfile'), false)
  s.epoch()
  await r.act('profile')
  assert.equal(s.calls.filter((x) => x.method && x.method !== 'GET').length, 1)
})
test('REQ-018：未登录、Mock、本人读取失败均不保留设置或发送写入', async () => {
  const s = await setup()
  const r = s.runtime
  s.noToken()
  await r.load()
  assert.equal(r.currentMe.value, null)
  s.config.useMock = true
  await r.load()
  await r.act('profile')
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  const failed = await setup()
  failed.user.refresh = async () => {
    throw new RequestError('合成拒绝', 403, 'FORBIDDEN', '', 403)
  }
  await failed.runtime.load()
  assert.equal(failed.runtime.currentMe.value, null)
  assert.equal(failed.runtime.nickname.value, '')
})
test('REQ-014/018：公开心愿和故事可独立确认拉黑对象，隐私屏障或作者变化禁止沿用旧目标', async () => {
  for (const kind of ['wish', 'story']) {
    const s = await setup({
      targetId: '6c500000-0000-4000-8000-000000000002',
      sourceId: 'synthetic-content',
      sourceKind: kind,
    })
    const r = s.runtime
    s.transport(async (input) => {
      if (input.url.startsWith('/me/interaction-blocks?')) return { items: [], next_cursor: null }
      if (input.method && input.method !== 'GET') return { accepted: true }
      const content = {
        id: 'synthetic-content',
        author: { id: '6c500000-0000-4000-8000-000000000002', nickname: '合成公开作者' },
      }
      return kind === 'wish'
        ? { id: content.id, current_state: 'published', public: content }
        : content
    })
    await r.load()
    assert.equal(r.targetName.value, '合成公开作者')
    await r.act('block')
    assert.equal(s.calls.filter((input) => input.method && input.method !== 'GET').length, 1)
    assert.equal(
      s.calls.some((input) => input.url.startsWith('/users/')),
      false,
    )
    s.transport(async (input) =>
      input.url.startsWith('/me/interaction-blocks?')
        ? { items: [], next_cursor: null }
        : {
            id: 'synthetic-content',
            current_state: 'published',
            privacy_review_required: true,
            public: {
              author: { id: '6c500000-0000-4000-8000-000000000002', nickname: '已隐藏作者' },
            },
            author: { id: 'synthetic-new-author', nickname: '新作者' },
          },
    )
    await r.load()
    assert.equal(r.targetName.value, '')
    await r.act('block')
    assert.equal(s.calls.filter((input) => input.method && input.method !== 'GET').length, 1)
  }
})

test('REQ-018：同账号令牌更换后已缓存的本人投影立即失效', async () => {
  const s = await setup({}, true)
  assert.equal(s.runtime.currentMe.value.id, actor.id)
  realSession.setToken('synthetic-replaced-token')
  assert.equal(s.runtime.currentMe.value, null)
  assert.deepEqual(s.runtime.rows.value, [])
  realSession.clear()
})

test('REQ-014：旧动作不启用新拉黑，条目不再提供账号主页或来源映射', async () => {
  const s = await setup({ targetId: '6c500000-0000-4000-8000-000000000002' })
  s.workspace.allowed_actions = []
  s.user.user!.allowed_actions = ['putMeProfile', 'postMeBlocks', 'deleteMeBlocks']
  await s.runtime.load()
  await s.runtime.act('block')
  assert.equal(s.calls.filter((x) => x.method === 'POST').length, 0)
  assert.equal(s.runtime.targetName.value, '')
  const source = readFileSync(new URL('../src/pages/settings/index.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(
    source,
    /entry\.target_user_id|entry\.block_id.*public-profile|postMeBlocks|deleteMeBlocks/,
  )
  assert.ok(s.calls.every((x) => !x.url.startsWith('/me/blocks')))
})
test('REQ-014/018：升级响应与账号字段泄漏均清掉黑名单，不回退旧接口', async () => {
  const s = await setup()
  s.transport(async () => {
    throw new RequestError('需升级', 409, 'CLIENT_UPGRADE_REQUIRED', '', 409)
  })
  await s.runtime.load()
  assert.match(s.runtime.error.value, /更新/)
  assert.deepEqual(s.runtime.rows.value, [])
  assert.equal(s.runtime.workspace.value, null)
  s.transport(async () => ({
    items: [
      {
        block_id: '6c500000-0000-4000-8000-000000000002',
        version: 1,
        label: '已屏蔽对象',
        allowed_actions: ['interactionBlockDelete'],
        target_user_id: 'synthetic-leak',
      },
    ],
    next_cursor: null,
  }))
  await s.runtime.load()
  assert.deepEqual(s.runtime.rows.value, [])
  assert.equal(s.runtime.blocksReady.value, false)
  assert.ok(s.calls.every((x) => !x.url.startsWith('/me/blocks')))
})
test('REQ-014/018：解除超时禁止新写，原键原体重试，离页清掉待确认操作', async () => {
  const s = await setup()
  let unknown = true
  s.transport(async (input) => {
    if (input.method === 'DELETE') {
      if (unknown) throw new RequestError('合成超时', -1)
      return undefined
    }
    return { items: [], next_cursor: null }
  })
  await s.runtime.act('unblock', s.runtime.rows.value[0])
  assert.equal(s.runtime.retryReady.value, true)
  await s.runtime.act('unblock', s.runtime.rows.value[0])
  assert.equal(s.calls.filter((x) => x.method === 'DELETE').length, 1)
  unknown = false
  await s.runtime.retryWrite()
  const writes = s.calls.filter((x) => x.method === 'DELETE')
  assert.deepEqual(writes[0], writes[1])
  assert.equal(s.runtime.retryReady.value, false)
  s.hooks.hide()
  await s.runtime.retryWrite()
  assert.equal(s.calls.filter((x) => x.method === 'DELETE').length, 2)
})
