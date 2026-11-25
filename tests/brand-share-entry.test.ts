import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadRuntime, pageScript } from './support/page-runtime.ts'

type Query = Record<string, string>

async function setupApp(weixin = true) {
  const state = { token: '测试会话', browseOnly: false }
  const calls: string[] = []
  const events: Record<string, (visit: unknown) => void> = {}
  let appShow!: (options?: { path: string; query?: Query }) => void
  let appHide!: () => void
  const entry = {
    loginVisible: false,
    openLogin() {
      this.loginVisible = true
      calls.push('login')
    },
    cancelLogin() {
      this.loginVisible = false
      calls.push('cancel')
    },
  }
  const appSource = pageScript(new URL('../src/App.vue', import.meta.url))
  // 与 uni-app 条件编译一致，分别执行微信和 H5 的前台恢复分支。
  const source = appSource.replace(
    weixin
      ? /\/\/ #ifndef MP-WEIXIN[\s\S]*?\/\/ #endif/g
      : /\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/g,
    '',
  )
  await loadRuntime(source, {
    config: { useMock: false },
    session: { getToken: () => state.token },
    isShareBrowseOnly: () => state.browseOnly,
    useThemeStore: () => ({ updateSystemMode() {} }),
    useDeletionStore: () => ({}),
    useUnreadStore: () => ({ start: () => calls.push('start'), stop: () => calls.push('stop') }),
    useEntryStore: () => entry,
    useUserStore: () => ({ refresh: async () => calls.push('refresh') }),
    refreshDictionaries: async () => calls.push('dictionaries'),
    onThemeChange() {},
    onAppShow: (hook: typeof appShow) => (appShow = hook),
    onAppHide: (hook: typeof appHide) => (appHide = hook),
    uni: { $on: (name: string, fn: (visit: unknown) => void) => (events[name] = fn) },
  })
  async function page(route: string, query: Query) {
    let load!: (query: Query) => void
    let show!: () => void
    const runtime = await loadRuntime(
      readFileSync(new URL('../src/utils/weixin-page-share.ts', import.meta.url), 'utf8'),
      {
        brandFriendShare() {},
        brandTimelineShare() {},
        onLoad: (hook: typeof load) => (load = hook),
        onShow: (hook: typeof show) => (show = hook),
        getCurrentPages: () => [{ route }],
        uni: { $emit: (name: string, visit: unknown) => events[name]?.(visit) },
      },
    )
    runtime.withPageShare({ setup: () => () => ({}) }).setup({}, {})
    load(query)
    return show
  }
  return { state, calls, entry, appShow, appHide, page }
}

test('微信热启动采用当前页面，旧品牌参数或空参数不会错误启停账号读取', async () => {
  const { state, calls, appShow, appHide, page } = await setupApp()
  const oldEntry = { path: 'pages/chat/index', query: { brandShare: '1' } }
  const brand = await page(oldEntry.path, oldEntry.query)
  appShow(oldEntry)
  brand()
  appHide()
  appShow()
  brand()
  assert.deepEqual(calls.splice(0), ['stop', 'stop', 'stop'])

  const home = await page('pages/index/index', {})
  home()
  home()
  assert.deepEqual(calls.splice(0), ['dictionaries', 'start', 'refresh'])
  appHide()
  appShow(oldEntry)
  home()
  assert.deepEqual(calls.splice(0), ['stop', 'dictionaries', 'start', 'refresh'])
  state.token = ''
  appHide()
  appShow()
  home()
  assert.deepEqual(calls.splice(0), ['stop', 'dictionaries', 'start', 'refresh'])

  state.browseOnly = true
  const content = await page('pages/wish-detail/index', { shared: '1' })
  appHide()
  appShow()
  content()
  assert.deepEqual(calls.splice(0), ['stop', 'stop', 'dictionaries'])
})

test('好友首页可自主登录，后台恢复尊重已打开或已取消的登录提示', async () => {
  const { state, entry, calls, appShow, appHide, page } = await setupApp()
  state.token = ''
  const home = await page('pages/index/index', { fromShare: '1' })
  appShow()
  home()
  assert.equal(entry.loginVisible, false)
  assert.deepEqual(calls.splice(0), ['cancel', 'dictionaries', 'start', 'refresh'])
  entry.openLogin()
  appHide()
  appShow()
  home()
  assert.equal(entry.loginVisible, true)
  entry.cancelLogin()
  appHide()
  appShow({ path: 'pages/index/index', query: { fromShare: '1' } })
  home()
  assert.equal(entry.loginVisible, false)
  calls.length = 0
  const ordinary = await page('pages/settings/index', { fromShare: '1' })
  ordinary()
  assert.deepEqual(calls, [])
  appHide()
  appShow({ path: 'pages/index/index', query: { fromShare: '1' } })
  ordinary()
  assert.equal(entry.loginVisible, false)
})

test('H5 启动不依赖微信页面通知，也不会替游客打开登录', async () => {
  const { state, appShow, calls } = await setupApp(false)
  state.token = ''
  appShow()
  assert.deepEqual(calls, ['dictionaries', 'start', 'refresh'])
})

test('微信游客普通冷启动、切页和取消后回前台均无自动登录', async () => {
  const { state, calls, entry, appShow, appHide, page } = await setupApp()
  state.token = ''
  const home = await page('pages/index/index', {})
  const wish = await page('pages/wishes/index', {})
  appShow()
  home()
  wish()
  assert.equal(entry.loginVisible, false)
  assert.deepEqual(calls.splice(0), ['dictionaries', 'start', 'refresh'])
  entry.openLogin()
  entry.cancelLogin()
  assert.deepEqual(calls.splice(0), ['login', 'cancel'])
  appHide()
  appShow()
  wish()
  assert.equal(entry.loginVisible, false)
  assert.deepEqual(calls, ['stop', 'dictionaries', 'start', 'refresh'])
})

test('品牌预览仅在完整小程序内重开干净首页，失败可重试', async () => {
  type Relaunch = { url: string; fail: () => void; complete: () => void }
  const calls: Relaunch[] = []
  async function preview(browseOnly: boolean) {
    return loadRuntime(
      pageScript(new URL('../src/components/BrandSharePreview.vue', import.meta.url)) +
        '\nexport { openHome, error };',
      {
        onMounted: (callback: () => void) => callback(),
        useThemeStore: () => ({}),
        isShareBrowseOnly: () => browseOnly,
        mainNavigation: [{ url: '/pages/index/index' }],
        uni: {
          reLaunch: (options: Relaunch) => calls.push(options),
        },
      },
    )
  }
  const singlePage = await preview(true)
  singlePage.openHome()
  assert.equal(calls.length, 0)
  const page = await preview(false)
  page.openHome()
  page.openHome()
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.url, '/pages/index/index')
  calls[0]!.fail()
  calls[0]!.complete()
  assert.match(page.error.value, /重试/)
  page.openHome()
  assert.equal(calls[1]!.url, '/pages/index/index')
  calls[1]!.complete()
  assert.equal(page.error.value, '')
})
