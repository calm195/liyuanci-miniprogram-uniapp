import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { createPinia, defineStore } from 'pinia'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'

async function setup() {
  const identity = reactive({ epoch: 1, id: 'synthetic-owner' })
  const session = { getEpoch: () => identity.epoch, getToken: () => 'synthetic-token' }
  const user = {
    get isLoggedIn() {
      return !!identity.id
    },
    get user() {
      return identity.id ? { id: identity.id } : null
    },
  }
  const storeModule = await loadRuntime(
    readFileSync(new URL('../src/stores/wish-comment-commands.ts', import.meta.url), 'utf8'),
    { defineStore, session, useUserStore: () => user },
  )
  const recovery = storeModule.useWishCommentCommands(createPinia())
  const calls: unknown[][] = []
  let status = 408
  let readStatus = 0
  const props = reactive({
    wishId: 'synthetic-wish',
    version: 3,
    commentsEpoch: 2,
    commentsOpen: true,
  })
  let nextKey = 0
  Object.assign(globalThis, { uni: { $emit: () => {} } })
  async function mount() {
    const hooks: Record<string, () => void> = {}
    const empty = async () => {
      if (readStatus) throw { statusCode: readStatus }
      return { items: [], next_cursor: null }
    }
    const runtime = await loadRuntime(
      pageScript(new URL('../src/components/WishComments.vue', import.meta.url)) +
        '\nexport { body, submit, pending, pendingControl, own, withdraw, runControl, load }',
      {
        defineProps: () => props,
        defineEmits: () => () => {},
        useUserStore: () => user,
        useWishCommentCommands: () => recovery,
        session,
        onHide: (fn: () => void) => {
          hooks.hide = fn
        },
        onShow: (fn: () => void) => {
          hooks.show = fn
        },
        onUnmounted: (fn: () => void) => {
          hooks.unmount = fn
        },
        interactionKey: () => `original-${++nextKey}`,
        listWishComments: empty,
        listOwnWishComments: empty,
        createWishComment: async (...args: unknown[]) => {
          calls.push(args)
          if (status) throw { statusCode: status }
          return { id: 'receipt' }
        },
        updateWishComment: async () => {},
        setWishComments: async () => {},
        withdrawWishComment: async (...args: unknown[]) => {
          calls.push(args)
          if (status) throw { statusCode: status }
        },
      },
    )
    await settle()
    return { runtime, hooks }
  }
  return {
    mount,
    identity,
    recovery,
    calls,
    props,
    setReadStatus: (value: number) => {
      readStatus = value
    },
    setStatus: (value: number) => {
      status = value
    },
  }
}

test('评论408/429与页面重建保留同body、版本和key，成功回执后才清除', async () => {
  const s = await setup()
  const first = await s.mount()
  first.runtime.body.value = '合成评论正文'
  await first.runtime.submit()
  first.hooks.hide!()
  assert.equal(first.runtime.body.value, '')
  assert.equal(s.recovery.get('synthetic-wish').pending.input.body, '合成评论正文')
  first.hooks.unmount!()
  s.setStatus(429)
  const second = await s.mount()
  assert.equal(second.runtime.body.value, '合成评论正文')
  await second.runtime.submit()
  second.hooks.hide!()
  second.hooks.show!()
  s.setStatus(0)
  await second.runtime.submit()
  assert.equal(s.calls.length, 3)
  assert.deepEqual(s.calls[0], s.calls[1])
  assert.deepEqual(s.calls[1], s.calls[2])
  assert.equal(s.recovery.get('synthetic-wish'), null)
})

test('评论撤回429保存原版本跨隐藏重试；换号立即清理正文与命令', async () => {
  const s = await setup()
  const { runtime, hooks } = await s.mount()
  s.setStatus(429)
  const item = { id: 'comment', version: 5, body: '合成隐私正文' }
  await runtime.withdraw(item)
  item.version = 99
  hooks.hide!()
  hooks.show!()
  s.setStatus(0)
  await runtime.runControl()
  assert.deepEqual(s.calls[0], s.calls[1])
  runtime.body.value = '另一条未确认正文'
  s.setStatus(408)
  await runtime.submit()
  s.identity.epoch++
  s.identity.id = 'different-owner'
  assert.equal(runtime.body.value, '')
  assert.equal(runtime.pending.value, null)
  assert.equal(s.recovery.get('synthetic-wish'), null)
})

test('明确拒绝403清除待确认命令及私有正文，不产生新键重发', async () => {
  const s = await setup()
  const { runtime } = await s.mount()
  runtime.body.value = '不应保留的正文'
  s.setStatus(403)
  await runtime.submit()
  assert.equal(runtime.body.value, '')
  assert.equal(s.recovery.get('synthetic-wish'), null)
  assert.equal(s.calls.length, 1)
})

test('评论关闭仍可核实未知原命令，读取403清除命令与私有正文', async () => {
  const s = await setup()
  const { runtime } = await s.mount()
  runtime.body.value = '同一条合成评论'
  await runtime.submit()
  s.props.commentsOpen = false
  s.props.commentsEpoch++
  await settle()
  s.setStatus(0)
  await runtime.submit()
  assert.deepEqual(s.calls[0], s.calls[1])
  s.props.commentsOpen = true
  runtime.body.value = '权限变化后应清理'
  s.setStatus(429)
  await runtime.submit()
  s.setReadStatus(403)
  await runtime.load()
  assert.equal(runtime.body.value, '')
  assert.equal(runtime.pending.value, null)
  assert.equal(s.recovery.get('synthetic-wish'), null)
})
