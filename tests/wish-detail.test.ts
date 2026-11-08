import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import ts from 'typescript'
import { canWishAction } from '../src/utils/actions.ts'
import { canApplyToWish } from '../src/utils/application.ts'
import { categories, campuses, rewards } from '../src/types/wish.ts'
import type { UserInfo } from '../src/types/api.ts'
import type { WishPublicContent, WishResult } from '../src/types/wish.ts'
import { shareReference } from '../src/utils/share.ts'
import { isPublicContent } from '../src/utils/story.ts'
import { emptyWish, wishStateLabels } from '../src/utils/wish.ts'
import { loadRuntime } from './support/page-runtime.ts'

const sample: WishResult = {
  id: 'synthetic-wish',
  version: 7,
  current_state: 'matching',
  allowed_actions: ['postWishesIdRollback', 'postWishesIdComplete'],
  own_content: { ...emptyWish(), body: '合成心愿正文' },
}
async function moduleFrom(source: string) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled + `\n// ${Math.random()}`).toString('base64')}`
  )
}
const strip = (source: string) =>
  source.replace(/^import\s[\s\S]*?from\s+'([^']+)'\n/gm, (_all, name) =>
    name === 'vue' ? `import { computed, ref, watch } from '${import.meta.resolve('vue')}'\n` : '',
  )
const shareRef = '01234567-89ab-cdef-0123-456789abcdef'
const publicWish = {
  id: sample.id,
  title: '公开标题',
  category: 'help',
  campus: 'wushan',
  reward_method: 'sincere_thanks',
  author: { id: 'synthetic-author', nickname: '公开昵称' },
  body: '公开正文',
  content_version: 1,
  school_related: false,
  notice_codes: [],
  notice_text: '',
} satisfies WishPublicContent

async function setup(query: Record<string, string> = { id: sample.id }, initial = sample) {
  const hooks: Record<string, (query?: Record<string, string>) => void> = {}
  const user = reactive({
    user: {
      id: 'synthetic-owner',
      version: 1,
      verification: 'verified',
      allowed_actions: [],
    } as UserInfo,
    validated: true,
    refresh: async () => {},
  })
  let epoch = 1
  let token = 'synthetic-token'
  let row = structuredClone(initial)
  const pages: string[] = []
  const gates: {
    kind: string
    ready: (receipt: { owner: string; epoch: number }) => void
  }[] = []
  let confirm = (fn: (result: { confirm: boolean }) => void) => fn({ confirm: true })
  const calls: {
    url: string
    method?: string
    auth?: boolean
    data?: Record<string, unknown>
    header?: Record<string, string>
  }[] = []
  class RequestError extends Error {
    statusCode = 409
    error_code = 'VERSION_CONFLICT'
  }
  let command = async () => structuredClone(row)
  const config = { useMock: false, wishWritesReady: true, apiBaseUrl: 'https://example.invalid' }
  const storage = new Map<string, unknown>()
  Object.assign(globalThis, {
    uni: {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      navigateTo: (options: { url: string; success: () => void }) => {
        pages.push(options.url)
        options.success()
      },
      showModal: (options: { success: (result: { confirm: boolean }) => void }) =>
        confirm(options.success),
    },
    __detailRequest: async (options: (typeof calls)[number]) => {
      calls.push(options)
      return options.method
        ? command()
        : options.auth === false
          ? {
              ...row,
              current_state: 'published',
              expires_at: '2099-01-01T12:00:00Z',
              public: { ...publicWish },
            }
          : structuredClone(row)
    },
  })
  const api = await moduleFrom(
    `const request = globalThis.__detailRequest;\n${strip(readFileSync(new URL('../src/api/wishes.ts', import.meta.url), 'utf8'))}`,
  )
  const { useHiddenWishes } = await loadRuntime(
    readFileSync(new URL('../src/composables/use-hidden-wishes.ts', import.meta.url), 'utf8'),
    { config, useUserStore: () => user },
  )
  Object.assign(globalThis, {
    __detail: {
      ...api,
      useContentShare: () => {},
      shareReference,
      isPublicContent,
      resolveShare: async (ref: string) => {
        calls.push({ url: `/share-links/${ref}` })
        return { target_kind: 'wish', target: { ...publicWish } }
      },
      user,
      useUserStore: () => user,
      useWishStore: () => ({}),
      useHiddenWishes,
      config,
      canWishAction,
      canApplyToWish,
      isShareBrowseOnly: () => false,
      prepareSharedWishBackStack: async () => false,
      openWishActionGate: async (kind: string, ready: (typeof gates)[number]['ready']) => {
        gates.push({ kind, ready })
      },
      RequestError,
      session: { getEpoch: () => epoch, getToken: () => token },
      categories,
      campuses,
      rewards,
      wishStateLabels,
      onPullDownRefresh: () => {},
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
  })
  const source = readFileSync(
    new URL('../src/pages/wish-detail/index.vue', import.meta.url),
    'utf8',
  )
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
  const page = await moduleFrom(
    `const { useUserStore, useWishStore, useHiddenWishes, config, canWishAction, canApplyToWish, isShareBrowseOnly, prepareSharedWishBackStack, openWishActionGate, RequestError, session, categories, campuses, rewards, wishStateLabels, getWish, getPublicWish, changeWishState, useContentShare, shareReference, resolveShare, isPublicContent, onPullDownRefresh, onLoad, onShow, onHide, onUnload } = globalThis.__detail;\n${strip(source)}\nexport { act, load, wish, content, currentWish, notice, error, actionError, writing, refreshExpiry, allowed, openSharedAction, sharedActions, applicationInProgress, toggleContentVisibility, contentHidden };`,
  )
  hooks.load!(query)
  hooks.show!()
  for (let i = 0; i < 15; i++) await Promise.resolve()
  return {
    page,
    hooks,
    calls,
    pages,
    gates,
    user,
    RequestError,
    storage,
    setRow: (value: WishResult) => {
      row = value
    },
    setCommand: (value: typeof command) => {
      command = value
    },
    setConfirm: (value: typeof confirm) => {
      confirm = value
    },
    changeSession: () => {
      epoch++
    },
    setToken: (value: string) => {
      token = value
    },
  }
}
test('心愿详情每次新打开计一次浏览，刷新和返回当前页不重复计分', async () => {
  const { page, hooks, calls } = await setup()
  assert.equal(calls[0]?.url, '/wishes/synthetic-wish?view=1')
  await page.load()
  hooks.hide!()
  hooks.show!()
  for (let i = 0; i < 15; i++) await Promise.resolve()
  assert.deepEqual(
    calls.slice(1).map((call) => call.url),
    ['/wishes/synthetic-wish', '/wishes/synthetic-wish'],
  )
  hooks.load!({ id: sample.id })
  hooks.show!()
  for (let i = 0; i < 15; i++) await Promise.resolve()
  assert.equal(calls.at(-1)?.url, '/wishes/synthetic-wish?view=1')
})
test('REQ-004/005：回退绑定目标版本与幂等键，刷新期限由服务端决定，不本地伪造上架', async () => {
  const { page, calls } = await setup()
  page.refreshExpiry.value = true
  await page.act('rollback', 'published')
  const writes = calls.filter((call) => call.method)
  assert.equal(writes.length, 1)
  assert.equal(writes[0]!.url, '/wishes/synthetic-wish/rollback')
  assert.deepEqual(writes[0]!.data, {
    expected_version: 7,
    target: 'published',
    refresh_expiry: true,
  })
  assert.ok(writes[0]!.header?.['Idempotency-Key'])
  assert.equal(page.currentWish.value.current_state, 'matching')
})
test('REQ-018：确认期间离开和会话变化不能提交旧动作，隐私屏障不回显正文', async () => {
  const s = await setup()
  let resolve: ((value: { confirm: boolean }) => void) | undefined
  s.setConfirm((fn) => {
    resolve = fn
  })
  const pending = s.page.act('complete')
  s.hooks.hide!()
  s.changeSession()
  resolve!({ confirm: true })
  await pending
  assert.equal(s.calls.filter((call) => call.method).length, 0)
  assert.equal(s.page.wish.value, null)
  s.setRow({ ...sample, privacy_review_required: true })
  s.hooks.show!()
  await s.page.load()
  assert.equal(s.page.content.value, null)
})
test('REQ-004：409仅重读不自动重写；切换账号不保留原正文', async () => {
  const s = await setup()
  s.setCommand(async () => {
    throw new s.RequestError('合成冲突')
  })
  await s.page.act('complete')
  assert.equal(s.calls.filter((call) => call.method).length, 1)
  assert.match(s.page.notice.value, /手动操作/)
  s.user.user = { ...s.user.user, id: 'synthetic-other' }
  assert.equal(s.page.wish.value, null)
  assert.equal(s.page.currentWish.value, null)
})

test('微信卡片和扫码回流只读取公开投影，非法扫码参数不降级为普通详情', async () => {
  const friend = await setup({ id: sample.id, shared: '1' })
  assert.equal(friend.calls[0]?.auth, false)
  assert.deepEqual(friend.page.content.value, publicWish)
  assert.equal(friend.page.currentWish.value.current_state, 'published')
  assert.equal(friend.page.currentWish.value.expires_at, '2099-01-01T12:00:00Z')
  assert.equal(friend.page.currentWish.value.own_content, undefined)
  assert.deepEqual(friend.page.currentWish.value.allowed_actions, [])
  assert.equal(friend.page.allowed('withdraw'), false)

  const scan = await setup({ scene: shareRef.replace(/-/g, ''), id: 'other' })
  assert.deepEqual(
    scan.calls.map((call) => call.url),
    [`/share-links/${shareRef}`, friend.calls[0]?.url, friend.calls[1]?.url],
  )
  assert.deepEqual(scan.calls[1], friend.calls[0])
  assert.deepEqual(scan.page.currentWish.value, friend.page.currentWish.value)
  scan.hooks.hide!()
  assert.equal(scan.page.currentWish.value, null)
  await scan.page.load()
  assert.equal(scan.page.currentWish.value, null)

  const invalid = await setup({ scene: 'wrong', id: sample.id })
  assert.equal(invalid.calls.length, 0)
  assert.match(invalid.page.error.value, /分享内容已失效/)
})

const actionableWish: WishResult = {
  id: sample.id,
  version: 7,
  current_state: 'published',
  content_version: 1,
  public: publicWish,
  allowed_actions: ['postWishesIdApplications'],
}

test('同一心愿的不看此内容可切换，换账号后不继承原账号状态', async () => {
  const s = await setup({ id: sample.id, shared: '1' }, actionableWish)
  s.page.toggleContentVisibility()
  assert.equal(s.page.contentHidden.value, true)
  assert.deepEqual([...s.storage.values()], [[sample.id]])
  assert.equal(s.page.currentWish.value.id, sample.id)
  s.user.user.id = 'synthetic-other'
  assert.equal(s.page.contentHidden.value, false)
  s.user.user.id = 'synthetic-owner'
  assert.equal(s.page.contentHidden.value, true)
  s.page.toggleContentVisibility()
  assert.equal(s.page.contentHidden.value, false)
  assert.equal(
    s.calls.some((call) => call.method),
    false,
  )
})

test('分享与普通详情保留申请中，分享投影不包含账号申请状态', async () => {
  const target = { ...actionableWish, application_in_progress: true, allowed_actions: [] }
  const regular = await setup({ id: sample.id }, target)
  assert.equal(regular.page.applicationInProgress.value, true)
  const shared = await setup({ id: sample.id, shared: '1' }, target)
  assert.equal(shared.page.applicationInProgress.value, true)
  assert.equal(shared.page.currentWish.value.application_in_progress, undefined)
  await shared.page.openSharedAction('apply')
  assert.deepEqual(shared.pages, [])
  shared.user.user.id = 'synthetic-other'
  assert.equal(shared.page.applicationInProgress.value, false)
})

test('扫码、好友与朋友圈使用同一操作目标，已认证后进入既有流程', async () => {
  const queries: Record<string, string>[] = [
    { scene: shareRef.replace(/-/g, '') },
    { id: sample.id, shared: '1' },
    // 朋友圈在点击微信「前往小程序」后传入与好友相同的查询。
    { id: sample.id, shared: '1' },
  ]
  for (const query of queries) {
    const s = await setup(query)
    s.setRow(actionableWish)
    s.user.user.allowed_actions.push('postReports', 'getReportTypes')
    assert.equal(s.page.sharedActions.value, true)
    await s.page.openSharedAction('apply')
    await s.page.openSharedAction('report')
    await s.page.openSharedAction('block')
    assert.deepEqual(s.pages, [
      '/pages/applications/index?wishId=synthetic-wish',
      '/pages/report/index?kind=wish&id=synthetic-wish',
      '/pages/blacklist/index?targetId=synthetic-author&sourceId=synthetic-wish&sourceKind=wish',
    ])
    assert.equal(s.gates.length, 0)
    assert.equal(
      s.calls.some((call) => call.method),
      false,
    )
    s.user.user.id = publicWish.author.id
    assert.equal(s.page.sharedActions.value, false)
  }
})

test('登录后继续认证，审核未完成或取消时不打开操作，完成后只恢复一次', async () => {
  const s = await setup({ scene: shareRef.replace(/-/g, '') })
  s.setRow(actionableWish)
  s.setToken('')
  s.user.validated = false
  await s.page.openSharedAction('apply')
  assert.equal(s.gates[0]?.kind, 'login')
  const returnToDetail = async () => {
    s.hooks.show!()
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }
  s.hooks.hide!()
  s.setToken('synthetic-token')
  s.changeSession()
  s.user.user.verification = 'unverified'
  s.user.validated = true
  s.gates[0]!.ready({ owner: s.user.user.id, epoch: 2 })
  await returnToDetail()
  assert.equal(s.gates[1]?.kind, 'verification')
  s.hooks.hide!()
  await returnToDetail()
  assert.deepEqual(s.pages, [])

  await s.page.openSharedAction('apply')
  s.hooks.hide!()
  s.user.user.verification = 'verified'
  s.gates[2]!.ready({ owner: s.user.user.id, epoch: 2 })
  await returnToDetail()
  assert.deepEqual(s.pages, ['/pages/applications/index?wishId=synthetic-wish'])
  s.hooks.hide!()
  await returnToDetail()
  assert.equal(s.pages.length, 1)
})

test('认证回跳后复核心愿权限，下架时不进入应愿流程', async () => {
  const s = await setup({ id: sample.id, shared: '1' })
  s.setRow(actionableWish)
  s.user.user.verification = 'unverified'
  await s.page.openSharedAction('apply')
  s.hooks.hide!()
  s.user.user.verification = 'verified'
  s.setRow({ ...actionableWish, current_state: 'withdrawn', allowed_actions: [] })
  s.gates[0]!.ready({ owner: s.user.user.id, epoch: 1 })
  s.hooks.show!()
  for (let i = 0; i < 20; i++) await Promise.resolve()
  assert.deepEqual(s.pages, [])
  assert.match(s.page.actionError.value, /当前不可操作/)
})

test('认证期间切换账号时丢弃原账号的操作意图', async () => {
  const s = await setup({ id: sample.id, shared: '1' })
  s.setRow(actionableWish)
  s.user.user.verification = 'unverified'
  await s.page.openSharedAction('apply')
  s.hooks.hide!()
  s.changeSession()
  s.user.user = { ...s.user.user, id: 'synthetic-other', verification: 'verified' }
  s.gates[0]!.ready({ owner: s.user.user.id, epoch: 2 })
  s.hooks.show!()
  for (let i = 0; i < 20; i++) await Promise.resolve()
  assert.deepEqual(s.pages, [])
})
