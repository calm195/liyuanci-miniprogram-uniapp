import assert from 'node:assert/strict'
import { test } from 'node:test'
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
    run: (vm: ComponentPublicInstance, action: () => unknown) =>
      mixin.methods.runPageAction.call(vm, action),
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
  const child = { $parent: exposedParent } as unknown as ComponentPublicInstance
  s.stack([page])
  s.mixin.onShow.call(page)
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
