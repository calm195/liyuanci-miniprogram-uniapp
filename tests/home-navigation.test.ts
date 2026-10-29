import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, settle } from './support/page-runtime.ts'
import { publicWishBody } from '../src/utils/wish.ts'
import { mainNavigation, switchMainTab } from '../src/utils/navigation.ts'
import type { WishResult } from '../src/types/wish.ts'

const sample: WishResult = {
  id: 'synthetic-preview',
  version: 1,
  current_state: 'published',
  allowed_actions: [],
  public: {
    id: 'synthetic-preview',
    body: '合成公开心愿',
    content_version: 1,
    school_related: false,
    notice_codes: [],
    notice_text: '',
  },
}
async function setup() {
  let epoch = 1
  const hooks: Record<string, () => void> = {}
  const user = reactive({ user: { id: 'synthetic-student-a' } })
  const requests: ((data: unknown) => void)[] = []
  const { useHomeWishes } = await loadRuntime(
    readFileSync(new URL('../src/composables/use-home-wishes.ts', import.meta.url), 'utf8'),
    {
      config: { useMock: false },
      useUserStore: () => user,
      useWishStore: () => ({ demoWishes: [] }),
      publicWishBody,
      session: { getEpoch: () => epoch },
      listWishes: () => new Promise((resolve) => requests.push(resolve)),
      onShow: (fn: () => void) => {
        hooks.show = fn
      },
      onHide: (fn: () => void) => {
        hooks.hide = fn
      },
      onUnload: (fn: () => void) => {
        hooks.unload = fn
      },
    },
  )
  const feed = useHomeWishes()
  return { hooks, user, feed, requests, changeSession: () => epoch++ }
}

test('首页只展示公开上架投影，不使用草稿或隐私屏障内容补位', async () => {
  const s = await setup()
  s.hooks.show!()
  s.requests[0]!({
    items: [
      { ...sample, privacy_review_required: true },
      { ...sample, current_state: 'draft', own_content: { body: '私人草稿' } },
      sample,
    ],
  })
  await settle()
  assert.deepEqual(
    s.feed.rows.value.map((x: WishResult) => x.id),
    [sample.id],
  )
})
test('首页隐藏、换账号与乱序响应不会重新显示旧内容', async () => {
  const s = await setup()
  s.hooks.show!()
  s.hooks.hide!()
  s.requests[0]!({ items: [sample] })
  await settle()
  assert.equal(s.feed.rows.value.length, 0)
  s.hooks.show!()
  s.changeSession()
  s.user.user.id = 'synthetic-student-b'
  s.requests[1]!({ items: [sample] })
  await settle()
  assert.equal(s.feed.rows.value.length, 0)
  s.requests[2]!({ items: [{ ...sample, id: 'current-session' }] })
  await settle()
  assert.equal(s.feed.rows.value[0].id, 'current-session')
  s.hooks.unload!()
  assert.equal(s.feed.rows.value.length, 0)
})
test('五个主入口都注册为页面，重复点击当前栏不入栈，换栏重建根页面', () => {
  const pages = JSON.parse(
    readFileSync(new URL('../src/pages.json', import.meta.url), 'utf8'),
  ).pages.map((p: { path: string }) => '/' + p.path)
  const calls: string[] = []
  Object.assign(globalThis, { uni: { reLaunch: ({ url }: { url: string }) => calls.push(url) } })
  for (const item of mainNavigation) {
    assert.ok(pages.includes(item.url))
    switchMainTab(item.key, item.key)
  }
  assert.equal(calls.length, 0)
  switchMainTab('resources', 'home')
  switchMainTab('whispers', 'resources')
  assert.deepEqual(calls, ['/pages/resources/index', '/pages/whispers/index'])
})
