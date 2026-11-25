import assert from 'node:assert/strict'
import { log } from 'node:console'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { env } from 'node:process'
import { setImmediate } from 'node:timers/promises'
import { URL } from 'node:url'
import { baseParse } from '@vue/compiler-core'

const build = createRequire(
  env.UNI_OUTPUT_DIR
    ? resolve(env.UNI_OUTPUT_DIR, 'app.js')
    : new URL('../dist/build/mp-weixin/app.js', import.meta.url),
)
const manifest = build('./app.json')
function registeredRoutes(config, pathOf) {
  return [
    ...config.pages.map(pathOf),
    ...(config.subPackages ?? config.subpackages ?? []).flatMap(({ root, pages }) =>
      pages.map((page) => `${root}/${pathOf(page)}`),
    ),
  ]
}
const routes = registeredRoutes(manifest, (path) => path)
const sourcePages = JSON.parse(readFileSync(new URL('../src/pages.json', import.meta.url), 'utf8'))
assert.deepEqual(
  routes,
  registeredRoutes(sourcePages, (page) => page.path),
  '微信构建产物必须包含所有注册页面',
)
const card = { title: '鲤愿池 · 心愿与还愿故事', imageUrl: '/static/share-cover.png' }
const cover = readFileSync(build.resolve(`.${card.imageUrl}`))
assert.equal(cover.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', '分享封面必须是 PNG 图片')
assert.equal(cover.subarray(12, 16).toString(), 'IHDR')
assert.ok(cover.readUInt32BE(16) > 0 && cover.readUInt32BE(20) > 0, '分享封面宽高必须有效')
assert.equal(cover.subarray(-8, -4).toString(), 'IEND', '分享封面数据不完整')
assert.deepEqual(
  cover,
  readFileSync(new URL(`../src${card.imageUrl}`, import.meta.url)),
  '微信产物应保留原始封面',
)
assert.ok(routes.length > 0, '微信构建产物应包含页面')

// 仅模拟微信宿主。真实的 uni-app 运行时、应用混入、页面注册与分享回调均使用构建产物。
let app
let registration
let currentPage
let requests = 0
let pageTitle
let shareMenus
const runtimeErrors = []
globalThis.wx = {
  getLaunchOptionsSync: () => ({}),
  getSystemInfoSync: () => ({}),
  getAppBaseInfo: () => ({}),
  getStorageSync: () => '',
  setStorage() {},
  setNavigationBarColor() {},
  showShareMenu({ menus }) {
    shareMenus = menus
  },
  setNavigationBarTitle({ title }) {
    pageTitle = title
  },
  request(options) {
    requests++
    options.fail?.({ errMsg: '构建验收使用离线环境' })
  },
}
globalThis.App = (options) => (app = options)
globalThis.Page = globalThis.Component = (options) => (registration = options)
globalThis.getApp = () => app
globalThis.getCurrentPages = () => (currentPage ? [currentPage] : [])

function mountPage(route) {
  currentPage = {
    route,
    properties: {},
    data: {},
    setData(update, done) {
      Object.assign(this.data, update)
      done?.()
    },
    triggerEvent() {},
    selectAllComponents: () => [],
  }
  registration.lifetimes.attached.call(currentPage)
}

function verifyWxml(route) {
  const template = readFileSync(build.resolve(`./${route}.wxml`), 'utf8')
  const views = baseParse(template).children
  const conditions = views.map(
    (view) => view.props?.find((prop) => prop.name === 'wx:if')?.value?.content,
  )
  assert.deepEqual(
    conditions,
    ["{{shareView === 'brand'}}", "{{shareView === 'page'}}"],
    `${route} 必须在微信模板上隔离品牌和业务视图`,
  )
  assert.deepEqual(
    views[0].children.map((child) => child.tag),
    ['brand-share-preview'],
    `${route} 品牌视图只应挂载品牌预览`,
  )
  assert.ok(views[1].children.length, `${route} 应保留原业务视图`)
}

function verifyBrandCard(methods, route) {
  const event = { from: 'menu' }
  assert.deepEqual(
    methods.onShareAppMessage.call(currentPage, event),
    { ...card, path: '/pages/index/index?fromShare=1' },
    `${route} 的默认好友卡片应使用品牌首页`,
  )
  assert.deepEqual(
    methods.onShareTimeline.call(currentPage, event),
    { ...card, query: 'brandShare=1' },
    `${route} 的默认朋友圈卡片应只带品牌预览参数`,
  )
}

async function verifyStoryShare(route) {
  const user = build('./stores/user.js').useUserStore()
  const story = { id: '01234567-89ab-cdef-0123-456789abcdef', title: '已经公开的还愿故事' }
  user.$patch({ validated: true, user: { verification: 'verified' } })
  mountPage(route)
  const { methods, lifetimes } = registration
  try {
    methods.onLoad.call(currentPage, { id: story.id })
    await setImmediate()
    // 通过编译后的原生事件绑定，将故事墙组件给出的公开投影传给实际页面。
    const wxml = readFileSync(build.resolve(`./${route}.wxml`), 'utf8')
    const binding = /<story-wall\b[^>]*\bbindshareContent="{{(\w+)}}"/.exec(wxml)
    assert.ok(binding, '故事墙应连接公开故事变更事件')
    const notify = currentPage[currentPage.data[binding[1]]]
    notify({ type: 'shareContent', detail: { __args__: [story] } })
    const query = `id=${story.id}&shared=1`
    const contentCard = { title: story.title, imageUrl: card.imageUrl }
    assert.deepEqual(
      methods.onShareAppMessage.call(currentPage, { from: 'button' }),
      {
        ...contentCard,
        path: `/${route}?${query}`,
      },
      '公开故事应覆盖默认好友卡片',
    )
    assert.deepEqual(
      methods.onShareTimeline.call(currentPage),
      { ...contentCard, query },
      '公开故事应覆盖默认朋友圈卡片',
    )
    notify({ type: 'shareContent', detail: { __args__: [null] } })
    assert.equal(
      methods.onShareTimeline.call(currentPage).query,
      'brandShare=1',
      '公开资格消失后应恢复品牌卡片',
    )
  } finally {
    lifetimes.detached.call(currentPage)
    currentPage = undefined
    user.$patch({ validated: false, user: null })
  }
}

build('./app.js')
app.$vm.$.appContext.config.errorHandler = (error) => runtimeErrors.push(error)
app.onLaunch({})
for (const route of routes) {
  registration = undefined
  build(`./${route}.js`)
  assert.ok(registration, `${route} 未注册为微信页面`)
  verifyWxml(route)
  const { lifetimes, methods } = registration
  assert.equal(typeof methods.onShareAppMessage, 'function', `${route} 未注册好友分享回调`)
  assert.equal(typeof methods.onShareTimeline, 'function', `${route} 未注册朋友圈分享回调`)
  mountPage(route)
  try {
    const previousRequests = requests
    const query = { brandShare: '1', id: 'private-canary' }
    shareMenus = undefined
    app.onShow({ path: route, query })
    methods.onLoad.call(currentPage, query)
    methods.onShow.call(currentPage)
    await setImmediate()
    assert.equal(currentPage.data.shareView, 'brand', `${route} 朋友圈打开应只渲染品牌预览`)
    assert.equal(requests, previousRequests, `${route} 品牌预览发起了业务请求`)
    assert.deepEqual(
      shareMenus,
      ['shareAppMessage', 'shareTimeline'],
      `${route} 应提供两个原生分享菜单`,
    )
    verifyBrandCard(methods, route)
  } finally {
    lifetimes.detached.call(currentPage)
    currentPage = undefined
  }
  mountPage(route)
  try {
    methods.onLoad.call(currentPage, { kind: 'whisper' })
    await setImmediate()
    if (route === 'pages/hot-content/index') {
      assert.equal(pageTitle, '悄悄话周榜', '普通页面必须在首次进入时收到业务参数')
    }
    assert.equal(currentPage.data.shareView, 'page', `${route} 普通入口应渲染原业务视图`)
    verifyBrandCard(methods, route)
  } finally {
    lifetimes.detached.call(currentPage)
    currentPage = undefined
  }
  if (route === 'pages/stories/index') await verifyStoryShare(route)
  if (runtimeErrors.length)
    throw new AggregateError(runtimeErrors, `${route} 微信页面生命周期执行失败`)
}
log(`已验证 ${routes.length} 个微信页面的原生分享回调、品牌卡片和朋友圈预览隔离。`)
