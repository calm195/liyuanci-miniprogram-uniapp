import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { createPinia, defineStore } from 'pinia'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('选图返回前离页或换号，不上传旧文件也不回填旧草稿', async () => {
  for (const change of ['leave', 'account']) {
    const epoch = reactive({ value: 1 })
    const selection = deferred<{ tempFilePaths: string[] }>()
    const uploads: string[] = []
    const events: unknown[][] = []
    let dispose = () => {}
    Object.assign(globalThis, { uni: { chooseImage: () => selection.promise, $emit: () => {} } })
    const runtime = await loadRuntime(
      pageScript(new URL('../src/components/WishImageEditor.vue', import.meta.url)) +
        '\nexport { choose, entries }',
      {
        defineProps: () => ({ modelValue: [], disabled: false }),
        defineEmits:
          () =>
          (...args: unknown[]) =>
            events.push(args),
        onUnmounted: (fn: () => void) => {
          dispose = fn
        },
        interactionKey: () => 'original-key',
        session: { getEpoch: () => epoch.value },
        downloadWishImage: async () => 'image',
        uploadWishImage: async (path: string) => {
          uploads.push(path)
          return { id: 'asset' }
        },
      },
    )
    const choosing = runtime.choose()
    if (change === 'leave') dispose()
    else epoch.value++
    const count = events.length
    selection.resolve({ tempFilePaths: ['private-a.png', 'private-b.png'] })
    await choosing
    assert.deepEqual(uploads, [])
    assert.equal(events.length, count)
    assert.deepEqual(runtime.entries.value, [])
  }
})

test('多图上传中换号，旧响应不显示成功且后续照片不使用新会话上传', async () => {
  const epoch = reactive({ value: 1 })
  const first = deferred<{ id: string }>()
  const uploads: string[] = []
  const notices: unknown[][] = []
  Object.assign(globalThis, {
    uni: {
      chooseImage: async () => ({ tempFilePaths: ['a.png', 'b.png', 'c.png'] }),
      $emit: (...args: unknown[]) => notices.push(args),
    },
  })
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/WishImageEditor.vue', import.meta.url)) +
      '\nexport { choose, entries }',
    {
      defineProps: () => ({ modelValue: [], disabled: false }),
      defineEmits: () => () => {},
      onUnmounted: () => {},
      interactionKey: () => 'original-key',
      session: { getEpoch: () => epoch.value },
      downloadWishImage: async () => 'image',
      uploadWishImage: (path: string) => {
        uploads.push(path)
        return first.promise
      },
    },
  )
  const choosing = runtime.choose()
  await settle()
  assert.deepEqual(uploads, ['a.png'])
  epoch.value++
  first.resolve({ id: 'old-asset' })
  await choosing
  assert.deepEqual(uploads, ['a.png'])
  assert.deepEqual(runtime.entries.value, [])
  assert.deepEqual(notices, [])
})

test('收藏页换号立即清除旧账号数据，旧请求晚到不能覆盖新账号列表', async () => {
  const epoch = reactive({ value: 1 })
  const old = deferred<unknown>()
  const fresh = deferred<unknown>()
  const hooks: Record<string, () => void> = {}
  let calls = 0
  const runtime = await loadRuntime(
    pageScript(new URL('../src/pages/favorites/index.vue', import.meta.url)) +
      '\nexport { items, load, loggedIn }',
    {
      session: { getEpoch: () => epoch.value, getToken: () => 'token-' + epoch.value },
      onShow: (fn: () => void) => {
        hooks.show = fn
      },
      listFavorites: async () => {
        calls++
        if (calls === 1) return { items: [{ target_id: 'account-a' }], next_cursor: null }
        return calls === 2 ? old.promise : fresh.promise
      },
    },
  )
  hooks.show!()
  await settle()
  assert.equal(runtime.items.value[0].target_id, 'account-a')
  const reading = runtime.load()
  epoch.value++
  assert.deepEqual(runtime.items.value, [])
  fresh.resolve({ items: [{ target_id: 'account-b' }], next_cursor: null })
  await settle()
  old.resolve({ items: [{ target_id: 'stale-account-a' }], next_cursor: null })
  await reading
  assert.equal(runtime.items.value[0].target_id, 'account-b')
})

test('收藏离页晚到不发成功提示，返回后以原请求核实且刷新不抹掉未知命令', async () => {
  const props = reactive({ kind: 'wish', targetId: 'wish-a', favorited: false })
  const first = deferred<{ favorited: boolean }>()
  const hooks: Record<string, () => void> = {}
  const calls: unknown[][] = []
  const notices: unknown[][] = []
  Object.assign(globalThis, { uni: { $emit: (...args: unknown[]) => notices.push(args) } })
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/FavoriteButton.vue', import.meta.url)) +
      '\nexport { toggle, active, pending }',
    {
      defineProps: () => props,
      defineEmits: () => () => {},
      onUnmounted: () => {},
      onShow: (fn: () => void) => {
        hooks.show = fn
      },
      onHide: (fn: () => void) => {
        hooks.hide = fn
      },
      interactionKey: () => 'stable-key',
      session: { getEpoch: () => 1, getToken: () => 'test-token' },
      setFavorite: (...args: unknown[]) => {
        calls.push(args)
        return calls.length === 1 ? first.promise : Promise.resolve({ favorited: true })
      },
    },
  )
  const writing = runtime.toggle()
  hooks.hide!()
  first.resolve({ favorited: true })
  await writing
  assert.deepEqual(notices, [])
  assert.equal(runtime.active.value, false)
  props.favorited = true
  await settle()
  assert.equal(runtime.pending.value.key, 'stable-key')
  hooks.show!()
  await runtime.toggle()
  assert.deepEqual(calls[0], calls[1])
  assert.equal(notices.length, 1)
})

test('标已读和换号在未读汇总请求中发生时，立即补读总量且隔离旧账号响应', async () => {
  const epoch = reactive({ value: 1 })
  const user = reactive({ user: { id: 'account-a' } })
  const requests: ReturnType<typeof deferred<{ unread_count: number }>>[] = []
  Object.assign(globalThis, { uni: { $on: () => {} } })
  const runtime = await loadRuntime(
    readFileSync(new URL('../src/stores/unread.ts', import.meta.url), 'utf8'),
    {
      defineStore,
      useUserStore: () => user,
      session: { getEpoch: () => epoch.value, getToken: () => 'token' },
      config: { useMock: false },
      createVisiblePoller: (task: () => Promise<void>) => ({
        start: () => {
          void task()
        },
        stop: () => {},
      }),
      notificationSummary: () => {
        const item = deferred<{ unread_count: number }>()
        requests.push(item)
        return item.promise
      },
    },
  )
  const store = runtime.useUnreadStore(createPinia())
  store.start()
  await store.refresh()
  requests[0]!.resolve({ unread_count: 17 })
  await settle()
  assert.equal(requests.length, 2)
  requests[1]!.resolve({ unread_count: 3 })
  await settle()
  assert.equal(store.count, 3)
  const reading = store.refresh()
  epoch.value++
  user.user.id = 'account-b'
  assert.equal(store.count, 0)
  requests[2]!.resolve({ unread_count: 99 })
  await settle()
  assert.equal(requests.length, 4)
  assert.equal(store.count, 0)
  requests[3]!.resolve({ unread_count: 5 })
  await reading
  assert.equal(store.count, 5)
  const hidden = store.refresh()
  store.stop()
  requests[4]!.resolve({ unread_count: 99 })
  await hidden
  assert.equal(store.count, 5)
})

test('评论重读只接受最新列表，离页后晚到写回执不提示成功也不留下本人正文', async () => {
  const oldOwn = deferred<unknown>()
  const write = deferred<unknown>()
  const hooks: Record<string, () => void> = {}
  const notices: unknown[][] = []
  let ownReads = 0
  Object.assign(globalThis, { uni: { $emit: (...args: unknown[]) => notices.push(args) } })
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/WishComments.vue', import.meta.url)) +
      '\nexport { load, own, body, submit }',
    {
      defineProps: () => ({
        wishId: 'wish-a',
        version: 1,
        contentVersion: 1,
        commentsEpoch: 1,
        commentsOpen: true,
      }),
      defineEmits: () => () => {},
      onUnmounted: () => {},
      onHide: (fn: () => void) => {
        hooks.hide = fn
      },
      useUserStore: () => ({ isLoggedIn: true, user: { id: 'account-a' } }),
      session: { getEpoch: () => 1, getToken: () => 'test-token' },
      interactionKey: () => 'stable-key',
      listWishComments: async () => ({ items: [], next_cursor: null }),
      listOwnWishComments: async () =>
        ++ownReads === 1
          ? oldOwn.promise
          : { items: [{ id: 'fresh', body: '刚发布' }], next_cursor: null },
      createWishComment: () => write.promise,
      updateWishComment: () => {},
      withdrawWishComment: () => {},
      setWishComments: () => {},
    },
  )
  await runtime.load()
  assert.equal(runtime.own.value[0].id, 'fresh')
  oldOwn.resolve({ items: [{ id: 'stale' }], next_cursor: null })
  await settle()
  assert.equal(runtime.own.value[0].id, 'fresh')
  runtime.body.value = '不应离页回填的评论'
  const submitting = runtime.submit()
  hooks.hide!()
  write.resolve({ id: 'late', body: '旧账号正文' })
  await submitting
  assert.deepEqual(runtime.own.value, [])
  assert.equal(runtime.body.value, '')
  assert.deepEqual(notices, [])
})
