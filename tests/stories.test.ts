import { contentSearchParams } from '../src/utils/content-search.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import { canStoryAction, isPublicContent } from '../src/utils/story.ts'
import { shareReference } from '../src/utils/share.ts'
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
  title: '找到一起练琴的伙伴',
  campus: 'wushan',
  category: 'team',
  content_version: 2,
  school_related: true,
  notice_codes: ['UNVERIFIED_SCHOOL'],
  notice_text: '未经证实',
}
const reference = '12345678-1234-4123-8123-123456789abc'
type Input = {
  url: string
  auth?: boolean
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
    if (input.url === `/share-links/${reference}`)
      return { target_kind: 'story', target: { ...publicStory }, grade_label: '大三' }
    throw new RequestError(404)
  }
  const request = async (input: Input) => {
    calls.push(input)
    return transport(input)
  }
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/stories.ts', import.meta.url), 'utf8'),
    { request, contentSearchParams },
  )
  const exports =
    page === 'story-editor'
      ? 'id,wish,currentWish,body,busy,writing,error,notice,load,act,allowed'
      : 'id,rows,cursor,busy,error,load,show,leave,openStory'
  let confirm = true
  let modal: (() => void) | undefined
  let delayConfirm = false
  let shared: WishPublicContent | null = null
  const navigations: string[] = []
  const context = {
    defineProps: () => ({
      storyId: query.id,
      shareRef: shareReference(query),
      readOnly: query.shared === '1' || shareReference(query) !== undefined,
    }),
    defineEmits: () => (_event: string, value: WishPublicContent | null) => {
      shared = value
    },
    defineExpose: () => {},
    onMounted: (fn: () => unknown) => {
      hooks.mount = fn
    },
    onUnmounted: (fn: () => unknown) => {
      hooks.unmount = fn
    },
    config: { useMock: false, wishWritesReady: true },
    useUserStore: () => user,
    session: { getEpoch: () => epoch, getToken: () => 'synthetic-token' },
    ...api,
    getWish: (id: string) => request({ url: `/wishes/${id}` }),
    canStoryAction,
    isPublicContent,
    RequestError,
    uni: {
      navigateTo: ({ url }: { url: string }) => navigations.push(url),
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
  }
  const source =
    page === 'stories' ? '../src/components/StoryWall.vue' : `../src/pages/${page}/index.vue`
  const runtime = await loadRuntime(
    pageScript(new URL(source, import.meta.url)) + `\nexport { ${exports} }`,
    context,
  )
  hooks.load?.(query)
  if (page === 'stories') {
    hooks.show = runtime.show
    hooks.hide = runtime.leave
    hooks.mount()
  } else hooks.show()
  await settle()
  return {
    runtime,
    calls,
    hooks,
    user,
    shared: () => shared,
    navigations,
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
  assert.equal(s.calls[0].auth, true)
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
test('故事列表进入详情，详情只向页面分享钩子提供当前公开故事', async () => {
  const list = await setup('stories')
  assert.equal(list.shared(), null)
  list.runtime.openStory(wish.id)
  assert.deepEqual(list.navigations, [`/pages/stories/index?id=${wish.id}`])
  const detail = await setup('stories', { id: wish.id, shared: '1' })
  assert.equal(detail.shared()?.id, wish.id)
  detail.hooks.hide()
  assert.equal(detail.shared(), null)
  assert.equal(detail.runtime.rows.value.length, 0)
  detail.hooks.show()
  await settle()
  assert.equal(detail.shared()?.id, wish.id)
  assert.ok(detail.calls.every((call) => call.url === `/stories/${wish.id}`))
  assert.ok(detail.calls.every((call) => call.auth === false))
})

test('故事扫码只解析 scene，返回页面时重新复核且失效后不回退列表', async () => {
  const s = await setup('stories', { scene: reference.replace(/-/g, ''), kind: 'wish' })
  assert.deepEqual(
    s.calls.map((call) => call.url),
    [`/share-links/${reference}`],
  )
  assert.equal(s.shared()?.body, publicStory.body)
  s.hooks.hide()
  assert.equal(s.shared(), null)
  s.setTransport(async () => {
    throw new RequestError(404)
  })
  s.hooks.show()
  await settle()
  assert.equal(s.shared(), null)
  assert.equal(s.runtime.rows.value.length, 0)
  assert.match(s.runtime.error.value, /不可公开查看/)
  assert.deepEqual(
    s.calls.map((call) => call.url),
    Array(2).fill(`/share-links/${reference}`),
  )
})

test('故事扫码拒绝非法引用和跨类型返回，丢弃换会话后的响应', async () => {
  const invalid = await setup('stories', { scene: 'bad' })
  assert.deepEqual(invalid.calls, [])
  assert.match(invalid.runtime.error.value, /不可公开查看/)
  const s = await setup('stories', { ref: reference })
  s.setTransport(async () => ({ target_kind: 'wish', target: publicStory }))
  const wrongKind = s.runtime.load()
  assert.equal(s.shared(), null)
  await wrongKind
  assert.equal(s.runtime.rows.value.length, 0)
  let finish!: (value: unknown) => void
  s.setTransport(
    async () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = s.runtime.load()
  s.setEpoch()
  finish({ target_kind: 'story', target: publicStory })
  await pending
  assert.equal(s.shared(), null)
  assert.equal(s.runtime.rows.value.length, 0)
})

test('故事页注册原生分享，扫码打开时忽略额外目标参数并在隐藏时清除公开投影', async () => {
  const hooks: Record<string, (...args: never[]) => unknown> = {}
  let contentForShare!: () => WishPublicContent | null
  const page = await loadRuntime(
    pageScript(new URL('../src/pages/stories/index.vue', import.meta.url)) +
      '\nexport { storyId, shareRef, sharedEntry, publicStory, storyWall }',
    {
      shareReference,
      useContentShare: (kind: string, getter: () => WishPublicContent | null) => {
        assert.equal(kind, 'story')
        contentForShare = getter
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
    },
  )
  const show = hooks.show!
  const hide = hooks.hide!
  const calls: string[] = []
  page.storyWall.value = { show: () => calls.push('show'), hide: () => calls.push('hide') }
  const onLoad = hooks.load! as (query: Record<string, string>) => void
  onLoad({ scene: reference.replace(/-/g, ''), id: 'ignored' })
  assert.equal(page.shareRef.value, reference)
  assert.equal(page.storyId.value, '')
  assert.equal(page.sharedEntry.value, true)
  show()
  page.publicStory.value = publicStory
  assert.equal(contentForShare(), null)
  page.sharedEntry.value = false
  assert.equal(contentForShare()?.id, wish.id)
  hide()
  assert.equal(contentForShare(), null)
  assert.deepEqual(calls, ['show', 'hide'])
})
