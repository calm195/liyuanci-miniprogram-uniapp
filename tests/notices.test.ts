import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import {
  createNoticeQueue,
  noticeContext,
  noticeEvent,
  resultNoticeKind,
} from '../src/utils/notices.ts'
import type { NoticeItem } from '../src/utils/notices.ts'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'

function clock() {
  let id = 0
  const jobs = new Map<number, { callback: () => void; delay: number }>()
  return {
    jobs,
    schedule(callback: () => void, delay: number) {
      jobs.set(++id, { callback, delay })
      return id
    },
    cancel(handle: unknown) {
      jobs.delete(Number(handle))
    },
  }
}

test('悬浮提示按类型定时关闭，重复消息重置计时，旧计时不能关闭新提示', () => {
  const time = clock()
  let items: NoticeItem[] = []
  const queue = createNoticeQueue(
    (value) => {
      items = value
    },
    time.schedule,
    time.cancel,
  )
  const success = queue.show('已保存', 'success')
  const old = time.jobs.get(1)!
  assert.equal(old.delay, 3000)
  assert.equal(queue.show('已保存', 'success'), success)
  assert.equal(items.length, 1)
  old.callback()
  assert.equal(items.length, 1)
  time.jobs.get(2)!.callback()
  assert.equal(items.length, 0)
  const error = queue.show('网络异常', 'error')
  assert.equal([...time.jobs.values()][0]!.delay, 6000)
  queue.dismiss(error)
  assert.equal(items.length, 0)
  assert.equal(time.jobs.size, 0)
  queue.show('网络异常', 'error')
  assert.equal(items.length, 1)
  for (let i = 0; i < 4; i++) queue.show(`提示${i}`)
  assert.equal(items.length, 3)
  assert.equal(time.jobs.size, 3)
  queue.clear()
  assert.deepEqual(items, [])
  assert.equal(time.jobs.size, 0)
})

test('关闭不改变业务错误，相同错误新操作再次显示，页面隐藏返回不重放旧提示', async () => {
  const time = clock()
  let items: NoticeItem[] = []
  const queue = createNoticeQueue(
    (value) => {
      items = value
    },
    time.schedule,
    time.cancel,
  )
  const props = reactive({ message: '请选择图片', kind: 'error' })
  const proxy = reactive({
    isPageVisible: true,
    pageActionGeneration: 1,
    pageActionIdentity: 'save-avatar',
  })
  const instance: { proxy?: typeof proxy } = {}
  let mount = () => {}
  let cleanup = () => {}
  await loadRuntime(pageScript(new URL('../src/components/AppNotice.vue', import.meta.url)), {
    defineProps: () => props,
    withDefaults: (value: unknown) => value,
    inject: () => queue,
    noticeContext,
    resultNoticeKind,
    getCurrentInstance: () => instance,
    onMounted: (callback: () => void) => {
      mount = callback
    },
    onUnmounted: (callback: () => void) => {
      cleanup = callback
    },
  })
  assert.equal(items.length, 0)
  instance.proxy = proxy
  mount()
  await settle()
  assert.equal(items.length, 1)
  queue.dismiss(items[0]!.id)
  assert.equal(props.message, '请选择图片')
  assert.equal(items.length, 0)
  proxy.pageActionIdentity = 'other-action'
  proxy.pageActionGeneration++
  await settle()
  assert.equal(items.length, 0)
  proxy.pageActionIdentity = 'save-avatar'
  proxy.pageActionGeneration++
  await settle()
  assert.equal(items.length, 1)
  proxy.isPageVisible = false
  await settle()
  assert.equal(items.length, 0)
  proxy.isPageVisible = true
  await settle()
  assert.equal(items.length, 0)
  props.message = '新操作错误'
  await settle()
  assert.equal(items[0]?.message, '新操作错误')
  cleanup()
  assert.equal(items.length, 0)
  assert.equal(time.jobs.size, 0)
})

test('原生事件仅投递到可见页面，页面隐藏和卸载清理计时与监听', async () => {
  const listeners = new Set<(value: unknown) => void>()
  const time = clock()
  async function page(active: boolean) {
    const proxy = reactive({ isPageVisible: active })
    const instance: { proxy?: typeof proxy } = {}
    let mount = () => {}
    let hide = () => {}
    let unmount = () => {}
    const runtime = await loadRuntime(
      readFileSync(new URL('../src/composables/use-page-notices.ts', import.meta.url), 'utf8'),
      {
        getCurrentInstance: () => instance,
        onMounted: (fn: () => void) => {
          mount = fn
        },
        provide: () => {},
        noticeContext,
        resultNoticeKind,
        noticeEvent,
        createNoticeQueue: (update: (items: NoticeItem[]) => void) =>
          createNoticeQueue(update, time.schedule, time.cancel),
        onHide: (fn: () => void) => {
          hide = fn
        },
        onUnload: () => {},
        onUnmounted: (fn: () => void) => {
          unmount = fn
        },
        uni: {
          $on: (_event: string, fn: (value: unknown) => void) => listeners.add(fn),
          $off: (_event: string, fn: (value: unknown) => void) => listeners.delete(fn),
        },
      },
    )
    const notices = runtime.usePageNotices()
    instance.proxy = proxy
    mount()
    return {
      proxy,
      notices,
      hide: () => hide(),
      unmount: () => unmount(),
    }
  }
  const first = await page(true)
  const background = await page(false)
  for (const listener of listeners) listener({ message: '保存成功', kind: 'success' })
  assert.equal(first.notices.items.value.length, 1)
  assert.equal(background.notices.items.value.length, 0)
  first.hide()
  first.proxy.isPageVisible = false
  await settle()
  assert.equal(time.jobs.size, 0)
  background.proxy.isPageVisible = true
  for (const listener of listeners) listener({ message: '请求失败', kind: 'error' })
  assert.equal(first.notices.items.value.length, 0)
  assert.equal(background.notices.items.value.length, 1)
  first.unmount()
  background.unmount()
  assert.equal(time.jobs.size, 0)
  assert.equal(listeners.size, 0)
})

test('动态结果提示统一使用悬浮组件，请求层不调用不可关闭的原生toast', () => {
  let notices = 0
  function inspect(path: URL) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = new URL(item.name + (item.isDirectory() ? '/' : ''), path)
      if (item.isDirectory()) inspect(child)
      else if (/\.(vue|ts)$/.test(item.name)) {
        const source = readFileSync(child, 'utf8')
        assert.doesNotMatch(source, /uni\.showToast\s*\(/)
        assert.doesNotMatch(
          source,
          /<text[^>]*>\s*\{\{\s*(?:error|notice|avatarError|loginError|commentsError)\s*\}\}/,
        )
        notices += (source.match(/<AppNotice\b/g) ?? []).length
      }
    }
  }
  inspect(new URL('../src/', import.meta.url))
  assert.ok(notices >= 55)
  const host = readFileSync(new URL('../src/components/AppNoticeHost.vue', import.meta.url), 'utf8')
  assert.match(host, /position: fixed/)
  assert.match(host, /aria-label="关闭提示"/)
})

test('警告与未知结果按独立时长关闭，处理中可更新为最终结果', () => {
  const time = clock()
  let items: NoticeItem[] = []
  const queue = createNoticeQueue(
    (value) => {
      items = value
    },
    time.schedule,
    time.cancel,
  )
  queue.show('请核对输入', 'warning')
  assert.equal([...time.jobs.values()].at(-1)?.delay, 5000)
  queue.show('结果尚未确认', resultNoticeKind('结果尚未确认', 'error'))
  assert.equal([...time.jobs.values()].at(-1)?.delay, 8000)
  const operation = queue.show('上传中', 'progress')
  assert.equal(time.jobs.size, 2)
  queue.show('上传完成', 'success', operation)
  assert.equal(items.length, 3)
  assert.equal([...time.jobs.values()].at(-1)?.delay, 3000)
  queue.dismiss(operation)
  assert.equal(
    items.some((item) => item.id === operation),
    false,
  )
  queue.clear()
})
