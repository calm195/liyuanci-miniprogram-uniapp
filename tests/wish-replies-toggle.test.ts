import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'

type ReplyPage = { items: { id: string }[]; next_cursor: string | null }
async function setup() {
  const identity = reactive({ epoch: 1 })
  const root = { id: 'root', reply_count: 2, body: '根评论', status: 'published' }
  const calls: Record<string, string>[] = []
  const hooks: Record<string, () => void> = {}
  let read: (query: Record<string, string>) => Promise<ReplyPage> = async (query) =>
    query.cursor
      ? { items: [{ id: 'reply-1' }, { id: 'reply-2' }], next_cursor: null }
      : { items: [{ id: 'reply-1' }], next_cursor: 'next' }
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/WishComments.vue', import.meta.url)) +
      '\nexport { replies, expandedReplies, toggleReplies, expand, body, pending }',
    {
      defineProps: () => ({ wishId: 'wish', version: 3, commentsEpoch: 1, commentsOpen: true }),
      defineEmits: () => () => {},
      onHide: (fn: () => void) => {
        hooks.hide = fn
      },
      onUnmounted: (fn: () => void) => {
        hooks.unmount = fn
      },
      useUserStore: () => ({ isLoggedIn: true, user: { id: 'owner' } }),
      useWishCommentCommands: () => ({ get: () => null, save() {}, remove() {} }),
      session: { getEpoch: () => identity.epoch, getToken: () => 'synthetic-token' },
      listWishComments: async (_wish: string, query?: Record<string, string>) => {
        if (query?.root_comment_id) {
          calls.push({ ...query })
          return read(query)
        }
        return { items: query?.kind ? [] : [root], next_cursor: null }
      },
      listOwnWishComments: async () => ({ items: [], next_cursor: null }),
    },
  )
  await settle()
  return {
    runtime,
    root,
    calls,
    hooks,
    identity,
    setRead: (value: typeof read) => {
      read = value
    },
  }
}

test('心愿楼内回复收起重开沿用缓存，更多回复保留游标且去重', async () => {
  const s = await setup()
  const r = s.runtime
  await r.toggleReplies(s.root)
  assert.equal(r.expandedReplies.value.root, true)
  assert.equal(s.calls.length, 1)
  await r.toggleReplies(s.root)
  assert.equal(r.expandedReplies.value.root, false)
  assert.equal(r.replies.value.root.cursor, 'next')
  await r.toggleReplies(s.root)
  assert.equal(s.calls.length, 1)
  await r.expand(s.root)
  assert.deepEqual(s.calls, [
    { root_comment_id: 'root' },
    { root_comment_id: 'root', cursor: 'next' },
  ])
  assert.deepEqual(
    r.replies.value.root.items.map((item: { id: string }) => item.id),
    ['reply-1', 'reply-2'],
  )
  assert.equal(r.replies.value.root.cursor, null)
  await r.toggleReplies(s.root)
  await r.toggleReplies(s.root)
  assert.equal(s.calls.length, 2)
  assert.equal(r.expandedReplies.value.root, true)
})

test('心愿回复读取中也能收起，晚到结果只缓存且不改变未知草稿', async () => {
  const s = await setup()
  let finish!: (page: ReplyPage) => void
  s.setRead(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = { key: 'original-key', input: { body: '未知草稿' } }
  s.runtime.body.value = '未知草稿'
  s.runtime.pending.value = pending
  const loading = s.runtime.toggleReplies(s.root)
  await settle()
  await s.runtime.toggleReplies(s.root)
  finish({ items: [{ id: 'reply-1' }], next_cursor: 'next' })
  await loading
  assert.equal(s.runtime.expandedReplies.value.root, false)
  assert.equal(s.runtime.replies.value.root.items.length, 1)
  await s.runtime.toggleReplies(s.root)
  assert.equal(s.calls.length, 1)
  assert.equal(s.runtime.body.value, '未知草稿')
  assert.deepEqual(s.runtime.pending.value, pending)
})

test('心愿楼内缓存遵循会话与离页代次，旧响应不能恢复已清列表', async () => {
  for (const exit of ['session', 'hide']) {
    const s = await setup()
    let finish!: (page: ReplyPage) => void
    s.setRead(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const loading = s.runtime.toggleReplies(s.root)
    await settle()
    if (exit === 'session') s.identity.epoch++
    else s.hooks.hide!()
    await settle()
    finish({ items: [{ id: 'private-old-reply' }], next_cursor: 'old-cursor' })
    await loading
    assert.deepEqual(s.runtime.replies.value, {})
    assert.deepEqual(s.runtime.expandedReplies.value, {})
  }
})
