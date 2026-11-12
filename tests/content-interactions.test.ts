import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import { identityFor } from '../src/utils/whisper-content.ts'
import { matchesSchema } from '../src/utils/whispers-schema.ts'
import { whisperSchemas } from '../src/utils/whispers-contract-extensions.ts'
import { emptyWish, validateWish } from '../src/utils/wish.ts'

test('浏览事件每页面实例独立、并发不重报、失败使用同一个事件键', async () => {
  const calls: string[] = []
  let next = 0
  let fail = true
  const module = await loadRuntime(
    readFileSync(new URL('../src/composables/use-content-view.ts', import.meta.url), 'utf8'),
    {
      interactionKey: () => `event-${++next}`,
      recordContentView: async (_kind: string, _id: string, event: string) => {
        calls.push(event)
        if (fail) throw new Error('network')
      },
    },
  )
  const view = module.useContentView('wish')
  await Promise.all([view('target'), view('target')])
  assert.deepEqual(calls, ['event-1'])
  fail = false
  await view('target')
  await view('target')
  assert.deepEqual(calls, ['event-1', 'event-1'])
  await module.useContentView('wish')('target')
  assert.equal(calls.at(-1), 'event-2')
})

test('收藏未知结果保留目标与幂等键，重试成功后才显示已收藏', async () => {
  const props = reactive({ kind: 'wish', targetId: 'wish-a', favorited: false })
  const calls: unknown[][] = []
  let fail = true
  let dispose = () => {}
  const events: unknown[] = []
  Object.assign(globalThis, { uni: { $emit: (...args: unknown[]) => events.push(args) } })
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/FavoriteButton.vue', import.meta.url)) +
      '\nexport { toggle, active, pending, error }',
    {
      defineProps: () => props,
      defineEmits: () => () => {},
      onUnmounted: (fn: () => void) => {
        dispose = fn
      },
      interactionKey: () => 'stable-key',
      session: { getEpoch: () => 1, getToken: () => 'test-token' },
      setFavorite: async (...args: unknown[]) => {
        calls.push(args)
        if (fail) throw new Error('timeout')
        return { favorited: true }
      },
    },
  )
  await runtime.toggle()
  assert.equal(runtime.active.value, false)
  assert.equal(runtime.pending.value.key, 'stable-key')
  fail = false
  await runtime.toggle()
  assert.deepEqual(calls[0], calls[1])
  assert.equal(runtime.active.value, true)
  assert.equal(runtime.pending.value, null)
  assert.equal(events.length, 1)
  props.targetId = 'wish-b'
  await settle()
  assert.equal(runtime.active.value, false)
  dispose()
})

test('半匿名仅选校区会省略其他标签，空标签及未知标签拒绝', () => {
  const config = {
    enabled: true,
    semi_available: true,
    grade_dictionary: { version: 2, items: [{ code: 'undergraduate_5', label: '大五' }] },
  } as never
  assert.deepEqual(identityFor('semi', { campus: 'wushan', gender: '', grade: '' }, config, null), {
    mode: 'semi',
    tags: { campus: 'wushan' },
    dictionary_version: 2,
  })
  assert.throws(() => identityFor('semi', { campus: '', gender: '', grade: '' }, config, null))
  assert.equal(
    matchesSchema(whisperSchemas.Tags!, { campus: 'wushan', account_id: 'hidden' }, whisperSchemas),
    false,
  )
  assert.equal(
    validateWish({ ...emptyWish(), title: '测试', body: '测试', image_ids: ['a', 'b', 'c', 'd'] }),
    '最多选择三张不同的照片',
  )
  assert.equal(
    validateWish({ ...emptyWish(), title: '测试', body: '测试', image_ids: ['a', 'a'] }),
    '最多选择三张不同的照片',
  )
})

test('编辑楼内回复保留原回复目标，撤回未知结果保留原版本与幂等键', async () => {
  const updates: unknown[][] = []
  const withdrawals: unknown[][] = []
  let fail = true
  const props = reactive({
    wishId: 'wish-a',
    version: 4,
    contentVersion: 2,
    commentsEpoch: 1,
    commentsOpen: true,
    owner: false,
  })
  const empty = async () => ({ items: [], next_cursor: null })
  Object.assign(globalThis, { uni: { $emit: () => {} } })
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/WishComments.vue', import.meta.url)) +
      '\nexport { beginEdit, submit, withdraw, runControl, pendingControl, body }',
    {
      defineProps: () => props,
      defineEmits: () => () => {},
      onUnmounted: () => {},
      useUserStore: () => ({ isLoggedIn: true, user: { id: 'viewer' } }),
      session: { getEpoch: () => 1, getToken: () => 'test-token' },
      interactionKey: () => 'stable-key',
      listWishComments: empty,
      listOwnWishComments: empty,
      updateWishComment: async (...args: unknown[]) => {
        updates.push(args)
        return { id: 'reply-a' }
      },
      withdrawWishComment: async (...args: unknown[]) => {
        withdrawals.push(args)
        if (fail) throw new Error('timeout')
      },
      createWishComment: async () => {},
      setWishComments: async () => {},
    },
  )
  await settle()
  const reply = {
    id: 'reply-a',
    version: 3,
    root_comment_id: 'root-a',
    reply_to_comment_id: 'reply-b',
    body: '楼内回复',
    kind: 'comment',
  }
  runtime.beginEdit(reply)
  runtime.body.value = '补充回应'
  await runtime.submit()
  assert.equal((updates[0]![1] as { reply_to_comment_id: string }).reply_to_comment_id, 'reply-b')
  assert.equal((updates[0]![1] as { root_comment_id: string }).root_comment_id, 'root-a')
  await runtime.withdraw(reply)
  assert.equal(runtime.pendingControl.value.key, 'stable-key')
  reply.version = 99
  fail = false
  await runtime.runControl()
  assert.deepEqual(withdrawals[0], withdrawals[1])
  assert.equal((withdrawals[1]![0] as { version: number }).version, 3)
  assert.equal(runtime.pendingControl.value, null)
})

test('半匿名标签可从已选性别改为不公开，保留其他已选标签', async () => {
  const events: unknown[][] = []
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/WhisperIdentity.vue', import.meta.url)) +
      '\nexport { pick }',
    {
      defineProps: () => ({
        mode: 'semi',
        tags: { campus: 'wushan', gender: 'female', grade: '' },
        config: null,
        nickname: null,
        disabled: false,
      }),
      defineEmits:
        () =>
        (...args: unknown[]) =>
          events.push(args),
      campuses: [{ value: 'wushan', label: '五山' }],
      genders: [{ value: 'female', label: '女' }],
      semiReady: () => true,
    },
  )
  runtime.pick('gender', { detail: { value: 0 } })
  assert.deepEqual(events, [['update:tags', { campus: 'wushan', gender: '', grade: '' }]])
})
