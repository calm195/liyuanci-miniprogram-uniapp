import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, reactive } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { createPageInteractionMixin } from '../src/utils/page-interaction.ts'

function setup() {
  let stack: unknown[] = []
  let synced = 0
  Object.assign(globalThis, { getCurrentPages: () => stack })
  const mixin = createPageInteractionMixin(() => synced++)
  function page(parent: ComponentPublicInstance | null = null) {
    const vm = {
      ...mixin.data(),
      pageInteractionMounted: true,
      $mpType: 'page',
      $parent: parent,
      $root: null,
    } as unknown as ComponentPublicInstance
    Object.assign(vm, { $root: parent?.$root ?? vm })
    return vm
  }
  return {
    mixin,
    page,
    stack: (value: unknown[]) => (stack = value),
    synced: () => synced,
    run: (vm: ComponentPublicInstance, action: () => unknown, key?: string) =>
      mixin.methods.runPageAction.call(vm, action, key),
    pending: (vm: ComponentPublicInstance, key: string) =>
      mixin.methods.isPageActionPending.call(vm, key),
  }
}

test('REQ-018：前后台页面同时收到点击时仅栈顶执行，返回后恢复交互', () => {
  const s = setup()
  const previous = s.page()
  const next = s.page()
  let previousCalls = 0
  let nextCalls = 0
  s.stack([{ $vm: previous }])
  s.mixin.onShow.call(previous)
  s.run(previous, () => previousCalls++)
  s.stack([{ $vm: previous }, { $vm: next }])
  s.mixin.onShow.call(next)
  // 即便旧页onHide尚未来得及执行，也不能靠路由相同或旧可见状态放行。
  s.run(previous, () => previousCalls++)
  s.run(next, () => nextCalls++)
  assert.equal(previousCalls, 1)
  assert.equal(nextCalls, 1)
  s.mixin.onHide.call(next)
  s.run(next, () => nextCalls++)
  s.stack([{ $vm: previous }])
  s.mixin.onShow.call(previous)
  s.run(previous, () => previousCalls++)
  assert.equal(previousCalls, 2)
  assert.equal(nextCalls, 1)
})

test('REQ-018：子组件归属于最近页面，H5共享应用根也能正确交互', () => {
  const s = setup()
  const app = s.page()
  Object.assign(app, { $mpType: 'app' })
  const page = s.page(app)
  const child = s.page(page)
  Object.assign(child, { $mpType: 'component' })
  s.stack([page])
  s.mixin.onShow.call(page)
  assert.equal(
    s.run(child, () => '当前页面动作'),
    '当前页面动作',
  )
  s.mixin.onHide.call(page)
  assert.equal(
    s.run(child, () => '不应执行'),
    undefined,
  )
  s.mixin.onShow.call(page)
  s.mixin.onUnload.call(page)
  assert.equal(
    s.run(child, () => '不应执行'),
    undefined,
  )
})

test('H5 的 script setup 父级只暴露公开接口时仍找到页面，隐藏后拒绝动作', () => {
  const s = setup()
  const page = s.page()
  const exposedParent = { $: { proxy: page }, $parent: null }
  const child = { ...s.mixin.data(), $parent: exposedParent } as unknown as ComponentPublicInstance
  s.stack([page])
  s.mixin.onShow.call(page)
  s.mixin.mounted.call(child)
  assert.equal(s.mixin.computed.isPageVisible.call(child), true)
  assert.equal(
    s.run(child, () => '允许当前页面'),
    '允许当前页面',
  )
  s.mixin.onHide.call(page)
  assert.equal(s.mixin.computed.isPageVisible.call(child), false)
  assert.equal(
    s.run(child, () => '不应执行'),
    undefined,
  )
})

test('应用启动尚无页面时不调用原生导航 API，页面显示后才同步', () => {
  const s = setup()
  const app = s.page()
  Object.assign(app, { $mpType: 'app' })
  s.mixin.onShow.call(app)
  assert.equal(s.synced(), 0)
  s.mixin.onShow.call(s.page(app))
  assert.equal(s.synced(), 1)
})

test('冷启动漏过首次 onShow 时，ready 恢复原生栈顶页面及内容可见性', () => {
  const s = setup()
  const page = s.page()
  const child = s.page(page)
  Object.assign(child, { $mpType: 'component' })
  s.stack([{ $vm: page }])
  assert.equal(s.mixin.computed.isPageVisible.call(child), false)
  s.mixin.mounted.call(page)
  assert.equal(s.mixin.computed.isPageVisible.call(child), true)
  assert.equal(
    s.run(page, () => '可点击'),
    '可点击',
  )
  assert.equal(s.synced(), 1)
})

test('后台页面和延迟 mounted 的子组件不能恢复可见性，公开代理按完整页面核对', () => {
  const s = setup()
  const previous = s.page()
  const current = s.page()
  const child = s.page(previous)
  Object.assign(child, { $mpType: 'component' })
  // 模拟微信返回 script setup 的公开代理，内部页面代理与渲染事件上下文相同。
  s.stack([{ $vm: previous }, { $vm: { $: { proxy: current } } }])
  s.mixin.mounted.call(previous)
  s.mixin.mounted.call(child)
  assert.equal(previous.pageIsVisible, false)
  s.mixin.mounted.call(current)
  assert.equal(current.pageIsVisible, true)
  assert.equal(
    s.run(current, () => '当前页面动作'),
    '当前页面动作',
  )
  s.mixin.onHide.call(current)
  s.mixin.mounted.call(child)
  assert.equal(current.pageIsVisible, false)
  assert.equal(
    s.run(previous, () => '后台动作'),
    undefined,
  )
})

test('首帧父子桥接尚未建立时，子组件 ready 使可见性计算重新解析所属页面', () => {
  const s = setup()
  const page = s.page()
  s.stack([{ $vm: page }])
  s.mixin.onShow.call(page)
  const state = reactive(s.mixin.data())
  let parent: ComponentPublicInstance | null = null
  const child = {
    $mpType: 'component',
    get $parent() {
      return parent
    },
    get pageInteractionMounted() {
      return state.pageInteractionMounted
    },
    set pageInteractionMounted(value: boolean) {
      state.pageInteractionMounted = value
    },
  } as unknown as ComponentPublicInstance
  const visible = computed(() => s.mixin.computed.isPageVisible.call(child))
  assert.equal(visible.value, false)
  // 桥接字段本身不参与 Vue 响应式，不能依赖父链变化自动更新 computed 缓存。
  parent = page
  assert.equal(visible.value, false)
  s.mixin.mounted.call(child)
  assert.equal(visible.value, true)
  s.mixin.onHide.call(page)
  // 页面本体在实际运行中由响应式 data 持有，这里只验证桥接就绪触发了重新解析。
  assert.equal(s.mixin.computed.isPageVisible.call(child), false)
})

test('异步按钮仅显示本次动作和目标的进度，页面及子组件重复入口被拦截', async () => {
  const s = setup()
  const page = s.page()
  const child = s.page(page)
  Object.assign(child, { $mpType: 'component' })
  s.stack([{ $vm: page }])
  s.mixin.onShow.call(page)
  let resolve!: (value: string) => void
  const response = new Promise<string>((done) => (resolve = done))
  let calls = 0
  const pending = s.run(
    child,
    () => {
      calls++
      return response
    },
    'save:target-a',
  )
  assert.equal(pending, response)
  assert.equal(s.pending(child, 'save:target-a'), true)
  assert.equal(s.pending(child, 'save:target-b'), false)
  assert.equal(s.pending(child, 'refresh'), false)
  assert.equal(
    s.run(page, () => calls++, 'delete:target-a'),
    undefined,
  )
  assert.equal(
    s.run(child, () => calls++, 'save:target-a'),
    undefined,
  )
  assert.equal(calls, 1)
  resolve('已完成')
  assert.equal(await pending, '已完成')
  assert.equal(s.pending(child, 'save:target-a'), false)
  assert.equal(
    s.run(page, () => '后续动作', 'refresh'),
    '后续动作',
  )
})

test('Promise拒绝和同步异常均清理当前进度，原错误继续交给调用方', async () => {
  const s = setup()
  const page = s.page()
  s.stack([{ $vm: page }])
  s.mixin.onShow.call(page)
  const failure = new Error('合成请求失败')
  const result = s.run(page, () => Promise.reject(failure), 'save')
  assert.equal(s.pending(page, 'save'), true)
  await assert.rejects(result as Promise<unknown>, (error) => error === failure)
  assert.equal(s.pending(page, 'save'), false)
  assert.throws(
    () =>
      s.run(
        page,
        () => {
          throw failure
        },
        'save',
      ),
    (error) => error === failure,
  )
  assert.equal(s.pending(page, 'save'), false)
})

test('离页后旧动作晚到完成不能清掉返回后新动作的进度或放行后台事件', async () => {
  const s = setup()
  const page = s.page()
  const other = s.page()
  s.stack([{ $vm: page }])
  s.mixin.onShow.call(page)
  let oldDone!: () => void
  let newDone!: () => void
  const old = s.run(page, () => new Promise<void>((done) => (oldDone = done)), 'load')
  s.mixin.onHide.call(page)
  s.stack([{ $vm: page }, { $vm: other }])
  s.mixin.onShow.call(other)
  assert.equal(s.pending(page, 'load'), false)
  assert.equal(
    s.run(page, () => '后台动作', 'save'),
    undefined,
  )
  s.stack([{ $vm: page }])
  s.mixin.onShow.call(page)
  const current = s.run(page, () => new Promise<void>((done) => (newDone = done)), 'load')
  oldDone()
  await old
  assert.equal(s.pending(page, 'load'), true)
  newDone()
  await current
  assert.equal(s.pending(page, 'load'), false)
})

test('卸载清除动作身份，同页同种子组件实例不会同时显示进度', async () => {
  const s = setup()
  const page = s.page()
  const first = s.page(page)
  const second = s.page(page)
  Object.assign(first, { $mpType: 'component', $: { uid: 11 } })
  Object.assign(second, { $mpType: 'component', $: { uid: 12 } })
  s.stack([{ $vm: page }])
  s.mixin.onShow.call(page)
  let finish!: () => void
  const result = s.run(first, () => new Promise<void>((done) => (finish = done)), 'save')
  assert.equal(s.pending(first, 'save'), true)
  assert.equal(s.pending(second, 'save'), false)
  s.mixin.onUnload.call(page)
  assert.equal(s.pending(first, 'save'), false)
  finish()
  await result
  assert.equal(page.pageActionKey, '')
})
