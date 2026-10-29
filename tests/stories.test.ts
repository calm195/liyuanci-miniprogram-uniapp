import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import { canStoryAction, isPublicContent, sharePath } from '../src/utils/story.ts'
import type { WishResult, WishPublicContent } from '../src/types/wish.ts'
const actor = {
  id: 'synthetic-owner',
  version: 88,
  verification: 'verified' as const,
  allowed_actions: [],
}
const wish: WishResult = {
  id: 'synthetic-wish',
  version: 17,
  content_version: 3,
  current_state: 'realized',
  allowed_actions: ['postWishesIdStories'],
  own_content: { category: 'help', body: '合成心愿', campus: 'any' },
}
const publicStory: WishPublicContent = {
  id: wish.id,
  body: '合成故事',
  content_version: 2,
  school_related: true,
  notice_codes: ['UNVERIFIED_SCHOOL'],
  notice_text: '未经证实',
}
type Input = {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}
class RequestError extends Error {
  statusCode: number
  constructor(statusCode: number) {
    super('合成错误')
    this.statusCode = statusCode
  }
}
async function setup(page: string, query: Record<string, string> = {}) {
  let epoch = 1
  const user = reactive({
    user: { ...actor },
    validated: true,
    isLoggedIn: true,
    refresh: async () => {},
  })
  const hooks: Record<string, (input?: Record<string, string>) => unknown> = {}
  const calls: Input[] = []
  let transport: (input: Input) => Promise<unknown> = async (input) => {
    if (input.url.startsWith('/wishes/')) return structuredClone(wish)
    if (input.url.startsWith('/stories/')) return { ...publicStory }
    if (input.url.startsWith('/stories?')) return { items: [{ ...publicStory }], next_cursor: null }
    if (input.url === '/share-links')
      return { ref: 'synthetic-ref', miniapp_route: '/pages/share/index?ref=synthetic-ref' }
    return { target_kind: 'story', target: { ...publicStory } }
  }
  const request = async (input: Input) => {
    calls.push(input)
    return transport(input)
  }
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/stories.ts', import.meta.url), 'utf8'),
    { request },
  )
  const exports =
    page === 'story-editor'
      ? 'id,wish,currentWish,body,busy,writing,error,notice,load,act,allowed'
      : page === 'stories'
        ? 'id,rows,cursor,busy,error,load'
        : 'kind,id,reference,currentTarget,path,busy,error,load'
  let confirm = true
  let modal: (() => void) | undefined
  let delayConfirm = false
  const context = {
    config: { useMock: false, wishWritesReady: true },
    useUserStore: () => user,
    session: { getEpoch: () => epoch, getToken: () => 'synthetic-token' },
    ...api,
    getWish: (id: string) => request({ url: `/wishes/${id}` }),
    canStoryAction,
    isPublicContent,
    sharePath,
    RequestError,
    uni: {
      showModal: (options: { success: (result: { confirm: boolean }) => void }) => {
        modal = () => options.success({ confirm })
        if (!delayConfirm) modal()
      },
    },
    onLoad: (fn: (input?: Record<string, string>) => unknown) => {
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
    onShareAppMessage: (fn: () => unknown) => {
      hooks.share = fn
    },
  }
  const runtime = await loadRuntime(
    pageScript(new URL(`../src/pages/${page}/index.vue`, import.meta.url)) +
      `\nexport { ${exports} }`,
    context,
  )
  hooks.load(query)
  hooks.show()
  await settle()
  return {
    runtime,
    calls,
    hooks,
    user,
    setTransport: (fn: typeof transport) => {
      transport = fn
    },
    setEpoch: () => {
      epoch++
    },
    setConfirm: (value: boolean) => {
      confirm = value
    },
    delayConfirm: () => {
      delayConfirm = true
    },
    finishConfirm: () => modal!(),
  }
}
test('REQ-007/015：故事动作绑定本人、心愿状态、服务端提示与心愿版本，隐私屏障拒绝', () => {
  assert.equal(canStoryAction(actor, true, wish, wish.id, 'submit'), true)
  assert.equal(canStoryAction(actor, false, wish, wish.id, 'submit'), false)
  for (const value of [
    { ...wish, id: 'synthetic-other' },
    { ...wish, own_content: undefined },
    { ...wish, version: 0 },
    { ...wish, allowed_actions: [] },
    { ...wish, privacy_review_required: true },
    { ...wish, current_state: 'matching' as const },
  ])
    assert.equal(canStoryAction(actor, true, value, wish.id, 'submit'), false)
  assert.equal(
    canStoryAction(
      actor,
      true,
      { ...wish, current_state: 'fulfilled', allowed_actions: ['putWishesIdStory'] },
      wish.id,
      'update',
    ),
    true,
  )
  assert.equal(isPublicContent({ ...publicStory, body: ' \n' }), false)
})
test('REQ-008/018：只接受匹配本地分享路由的引用，不透传外链或正文快照', () => {
  assert.equal(
    sharePath({ ref: 'synthetic-ref', miniapp_route: '/pages/share/index?ref=synthetic-ref' }),
    '/pages/share/index?ref=synthetic-ref',
  )
  for (const link of [
    { ref: '../a', miniapp_route: '/pages/share/index?ref=../a' },
    { ref: 'synthetic-ref', miniapp_route: 'https://example.invalid/' },
    { ref: 'synthetic-ref', miniapp_route: '/pages/share/index?ref=synthetic-ref&body=private' },
  ])
    assert.throws(() => sharePath(link))
})
test('REQ-007/015：实际页面首次提交用wish_expected_version，202后重读fulfilled与待审结果', async () => {
  const s = await setup('story-editor', { wishId: wish.id })
  let state = structuredClone(wish)
  s.setTransport(async (input) => {
    if (!input.method) return state
    state = {
      ...state,
      version: 18,
      current_state: 'fulfilled',
      allowed_actions: ['putWishesIdStory', 'postWishesIdStoryWithdraw'],
      story_review_result: { decision: 'pending', content_version: 1 },
    }
    return {
      id: wish.id,
      version: 18,
      content_version: 1,
      status: 'pending_review',
      wish_state: 'fulfilled',
    }
  })
  s.runtime.body.value = '  合成新故事😀  '
  await s.runtime.act('submit')
  const writes = s.calls.filter((i) => i.method)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].url, `/wishes/${wish.id}/stories`)
  assert.deepEqual(writes[0].data, { body: '  合成新故事😀  ', wish_expected_version: 17 })
  assert.ok(writes[0].header?.['Idempotency-Key'])
  assert.equal(s.runtime.currentWish.value.current_state, 'fulfilled')
  assert.equal(s.runtime.currentWish.value.story_review_result.decision, 'pending')
  assert.equal(s.runtime.allowed('submit'), false)
  assert.equal(s.runtime.body.value, '')
})
test('REQ-007/015：实际页面新版本与撤回使用心愿聚合版本，撤回不回退fulfilled', async () => {
  const s = await setup('story-editor', { wishId: wish.id })
  let state: WishResult = {
    ...wish,
    version: 21,
    current_state: 'fulfilled',
    allowed_actions: ['putWishesIdStory', 'postWishesIdStoryWithdraw'],
    story_review_result: { decision: 'approved', content_version: 4 },
  }
  s.setTransport(async (input) => {
    if (!input.method) return state
    if (input.method === 'PUT') {
      state = {
        ...state,
        version: 22,
        story_review_result: { decision: 'pending', content_version: 5 },
      }
      return {
        id: wish.id,
        version: 22,
        content_version: 5,
        status: 'pending_review',
        wish_state: 'fulfilled',
      }
    }
    state = { ...state, version: 23, allowed_actions: ['putWishesIdStory'] }
    return state
  })
  await s.runtime.load()
  s.runtime.body.value = '替换全文'
  await s.runtime.act('update')
  await s.runtime.act('withdraw')
  const writes = s.calls.filter((i) => i.method)
  assert.deepEqual(
    writes.map((i) => i.data),
    [{ body: '替换全文', expected_version: 21 }, { expected_version: 22 }],
  )
  assert.deepEqual(
    writes.map((i) => [i.method, i.url]),
    [
      ['PUT', `/wishes/${wish.id}/story`],
      ['POST', `/wishes/${wish.id}/story/withdraw`],
    ],
  )
  assert.equal(s.runtime.currentWish.value.current_state, 'fulfilled')
  assert.equal(s.runtime.allowed('withdraw'), false)
})
test('REQ-007/018：409只重读不重发；空白、取消和失效弹窗无写入', async () => {
  const s = await setup('story-editor', { wishId: wish.id })
  s.runtime.body.value = ' \n\t '
  await s.runtime.act('submit')
  assert.equal(s.calls.filter((i) => i.method).length, 0)
  s.runtime.body.value = '合成正文'
  s.setConfirm(false)
  await s.runtime.act('submit')
  assert.equal(s.calls.filter((i) => i.method).length, 0)
  s.setConfirm(true)
  s.setTransport(async (input) => {
    if (input.method) throw new RequestError(409)
    return { ...wish, version: 19 }
  })
  await s.runtime.act('submit')
  assert.equal(s.calls.filter((i) => i.method).length, 1)
  assert.equal(s.runtime.currentWish.value.version, 19)
  assert.match(s.runtime.notice.value, /手动/)
  s.runtime.body.value = '新正文'
  s.delayConfirm()
  const pending = s.runtime.act('submit')
  s.hooks.hide()
  s.finishConfirm()
  await pending
  assert.equal(s.calls.filter((i) => i.method).length, 1)
  assert.equal(s.runtime.currentWish.value, null)
  assert.equal(s.runtime.body.value, '')
})
test('REQ-018：写入迟到、换账号与403不能恢复本人故事与输入', async () => {
  const s = await setup('story-editor', { wishId: wish.id })
  let finish: ((value: unknown) => void) | undefined
  s.setTransport(
    async () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  s.runtime.body.value = '合成输入'
  const pending = s.runtime.act('submit')
  await settle()
  s.user.user.id = 'synthetic-other'
  finish!({ id: wish.id, status: 'pending_review', wish_state: 'fulfilled' })
  await pending
  assert.equal(s.runtime.currentWish.value, null)
  assert.equal(s.runtime.body.value, '')
  s.setTransport(async () => {
    throw new RequestError(403)
  })
  await s.runtime.load()
  assert.equal(s.runtime.currentWish.value, null)
  assert.equal(s.runtime.allowed('submit'), false)
})
test('REQ-015/018：还愿墙实际分页保留不透明游标、去重；出错或退出清空旧正文', async () => {
  const s = await setup('stories')
  s.setTransport(async (input) =>
    input.url.includes('cursor=')
      ? { items: [publicStory, { ...publicStory, id: 'synthetic-second' }], next_cursor: null }
      : { items: [publicStory], next_cursor: 'opaque.cursor/value' },
  )
  await s.runtime.load()
  await s.runtime.load(true)
  assert.equal(s.runtime.rows.value.length, 2)
  assert.ok(s.calls.some((i) => i.url.includes('cursor=opaque.cursor%2Fvalue')))
  s.setTransport(async () => {
    throw new RequestError(404)
  })
  await s.runtime.load()
  assert.equal(s.runtime.rows.value.length, 0)
  s.hooks.hide()
  assert.equal(s.runtime.rows.value.length, 0)
})
test('REQ-015/018：故事详情只请求当前公开投影，目标错配、屏障404与迟到响应不展示', async () => {
  const s = await setup('stories', { id: wish.id })
  assert.equal(s.runtime.rows.value[0].body, publicStory.body)
  assert.equal(s.calls[0].url, `/stories/${wish.id}`)
  s.setTransport(async () => ({ ...publicStory, id: 'synthetic-other' }))
  await s.runtime.load()
  assert.equal(s.runtime.rows.value.length, 0)
  let finish: ((value: unknown) => void) | undefined
  s.setTransport(
    async () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = s.runtime.load()
  s.hooks.hide()
  finish!(publicStory)
  await pending
  assert.equal(s.runtime.rows.value.length, 0)
})
test('REQ-008/018：创建分享只有kind/id；微信卡固定标题和引用，回流每次onShow重验并404清空', async () => {
  const s = await setup('share', { kind: 'story', id: wish.id })
  assert.equal(s.calls.length, 0)
  await s.runtime.load(true)
  const create = s.calls.find((i) => i.method === 'POST')!
  assert.deepEqual(create.data, { target_kind: 'story', id: wish.id })
  assert.equal(s.runtime.currentTarget.value.target.body, publicStory.body)
  assert.deepEqual(s.hooks.share(), {
    title: '鲤愿池 · 心愿与还愿故事',
    imageUrl: '/static/share-cover.png',
    path: '/pages/share/index?ref=synthetic-ref',
  })
  s.hooks.hide()
  assert.equal(s.runtime.currentTarget.value, null)
  assert.deepEqual(s.hooks.share(), {
    title: '鲤愿池 · 心愿与还愿故事',
    imageUrl: '/static/share-cover.png',
    path: '/pages/index/index',
  })
  s.setTransport(async () => {
    throw new RequestError(404)
  })
  s.hooks.show()
  await settle()
  assert.equal(s.runtime.currentTarget.value, null)
  assert.equal(s.calls.filter((i) => i.method === 'POST').length, 1)
  assert.equal(s.calls.filter((i) => i.url === '/share-links/synthetic-ref').length, 2)
})
test('REQ-008/018：分享游客只解析ref；失败、换账号和迟到均无旧内容，不信任额外路由参数', async () => {
  const s = await setup('share', { ref: 'synthetic-ref', kind: 'wish', id: 'synthetic-wrong' })
  assert.equal(s.calls[0].url, '/share-links/synthetic-ref')
  assert.equal(s.runtime.kind.value, null)
  assert.equal(s.runtime.currentTarget.value.target_kind, 'story')
  s.user.user.id = 'synthetic-other'
  assert.equal(s.runtime.currentTarget.value, null)
  let finish: ((value: unknown) => void) | undefined
  s.setTransport(
    async () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = s.runtime.load()
  s.setEpoch()
  finish!({ target_kind: 'story', target: publicStory })
  await pending
  assert.equal(s.runtime.currentTarget.value, null)
})
test('REQ-008：未认证不创建分享，伪造服务端路由与错配目标不展示', async () => {
  const s = await setup('share', { kind: 'wish', id: wish.id })
  s.user.validated = false
  await s.runtime.load(true)
  assert.equal(s.calls.length, 0)
  s.user.validated = true
  s.setTransport(async () => ({
    ref: 'synthetic-ref',
    miniapp_route: '/pages/chat/index?id=synthetic-other',
  }))
  await s.runtime.load(true)
  assert.equal(s.runtime.reference.value, '')
  assert.equal(s.runtime.currentTarget.value, null)
  s.setTransport(async (input) =>
    input.method
      ? { ref: 'synthetic-ref', miniapp_route: '/pages/share/index?ref=synthetic-ref' }
      : { target_kind: 'story', target: publicStory },
  )
  await s.runtime.load(true)
  assert.equal(s.runtime.currentTarget.value, null)
})
