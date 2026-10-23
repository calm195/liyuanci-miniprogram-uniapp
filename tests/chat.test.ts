import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import {
  canWriteConversation,
  mergeMessages,
  isMessageStatus,
  notificationConversation,
} from '../src/utils/chat.ts'
import { createVisiblePoller } from '../src/utils/visible-poller.ts'
import { messageStatusLabels } from '../src/types/chat.ts'
import type {
  Conversation,
  DeliveredMessage,
  MessageStatus,
  MessagesPage,
} from '../src/types/chat.ts'

const actor = {
  id: 'synthetic-student',
  version: 99,
  verification: 'verified' as const,
  allowed_actions: [],
}
const conversation: Conversation = {
  id: 'synthetic-conversation',
  version: 8,
  can_write: true,
  write_epoch: 4,
}
const delivered = (id: string, seq: number): DeliveredMessage => ({
  message_id: id,
  delivery_seq: seq,
  submitted_at: '2026-10-23T01:00:00Z',
  delivered_at: '2026-10-23T01:01:00Z',
  body: '合成消息',
})
type Transport = {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}

async function chatStore(user: { user: { id: string } }, session: { getEpoch: () => number }) {
  setActivePinia(createPinia())
  const module = await loadRuntime(
    readFileSync(new URL('../src/stores/chat.ts', import.meta.url), 'utf8'),
    { defineStore, useUserStore: () => user, session },
  )
  return module.useChatStore()
}

test('REQ-007 / AR-001：慢审后达按最终序号合并，空页不推进，错误游标与重复拒绝', () => {
  const b = delivered('synthetic-b', 1)
  const a = delivered('synthetic-a', 2)
  const first = mergeMessages([], { items: [b], next_after_seq: 1 }, 0)
  const second = mergeMessages(first.items, { items: [a], next_after_seq: 2 }, first.afterSeq)
  assert.deepEqual(
    second.items.map((item) => item.message_id),
    ['synthetic-b', 'synthetic-a'],
  )
  assert.equal(mergeMessages(second.items, { items: [], next_after_seq: 2 }, 2).afterSeq, 2)
  assert.throws(() => mergeMessages([], { items: [], next_after_seq: 1 }, 0))
  assert.throws(() => mergeMessages([], { items: [a, b], next_after_seq: 1 }, 0))
  assert.throws(() => mergeMessages([b], { items: [b], next_after_seq: 1 }, 1))
  assert.equal(canWriteConversation(actor, true, conversation, 'synthetic-other'), false)
  assert.equal(
    canWriteConversation(actor, true, { ...conversation, can_write: false }, conversation.id),
    false,
  )
  assert.equal(
    canWriteConversation(actor, true, { ...conversation, write_epoch: -1 }, conversation.id),
    false,
  )
  assert.equal(
    isMessageStatus(
      { message_id: 'synthetic-a', status: 'pending', delivery_seq: 1 },
      'synthetic-a',
    ),
    false,
  )
})
test('REQ-007：可见轮询在请求完成后等3秒，不重叠；停止丢弃旧任务的再次调度', async () => {
  let complete: (() => void) | undefined
  const queued = new Map<number, () => void>()
  const delays: number[] = []
  let sequence = 0
  let calls = 0
  const poller = createVisiblePoller(
    async () => {
      calls++
      await new Promise<void>((resolve) => {
        complete = resolve
      })
    },
    {
      set: (callback, delay) => {
        delays.push(delay)
        queued.set(++sequence, callback)
        return sequence as unknown as ReturnType<typeof setTimeout>
      },
      clear: (timer) => {
        queued.delete(timer as unknown as number)
      },
    },
  )
  poller.start()
  assert.equal(calls, 1)
  assert.equal(queued.size, 0)
  complete!()
  await settle()
  assert.deepEqual(delays, [3000])
  const callback = queued.values().next().value!
  queued.clear()
  callback()
  assert.equal(calls, 2)
  poller.stop()
  complete!()
  await settle()
  assert.equal(queued.size, 0)
})
test('REQ-018：真实Pinia只保存回执与状态，换账号和同账号新会话均清空', async () => {
  let epoch = 1
  const user = reactive({ user: { ...actor } })
  const store = await chatStore(user, { getEpoch: () => epoch })
  store.track(conversation.id, {
    message_id: 'synthetic-outgoing',
    status: 'pending_scan',
    delivery_seq: null,
  })
  assert.equal(store.receipts[conversation.id][0].status, 'pending')
  assert.equal(
    Object.prototype.hasOwnProperty.call(store.receipts[conversation.id][0], 'body'),
    false,
  )
  epoch++
  store.syncSession()
  assert.deepEqual(store.receipts, {})
  store.track(conversation.id, {
    message_id: 'synthetic-new',
    status: 'pending_scan',
    delivery_seq: null,
  })
  user.user.id = 'synthetic-other'
  assert.deepEqual(store.receipts, {})
})
async function setup() {
  let epoch = 1
  let target: Conversation | null = { ...conversation }
  const user = reactive({
    user: { ...actor },
    validated: true,
    isLoggedIn: true,
    refresh: async () => {},
  })
  const session = { getEpoch: () => epoch, getToken: () => 'synthetic-token' }
  const store = await chatStore(user, session)
  const calls: Transport[] = []
  const pages: MessagesPage[] = []
  const statuses: Record<string, MessageStatus> = {}
  const hooks: Record<string, (query?: { id: string }) => void> = {}
  let stops = 0
  let pollTask: (() => Promise<void>) | undefined
  class RequestError extends Error {
    statusCode: number
    constructor(status: number) {
      super('合成错误')
      this.statusCode = status
    }
  }
  let command: (input: Transport) => Promise<unknown> = async () => ({
    message_id: 'synthetic-outgoing',
    status: 'pending_scan',
    delivery_seq: null,
  })
  let reads: (input: Transport) => Promise<unknown> = async (input) => {
    if (input.url.startsWith('/me/conversations'))
      return { items: target ? [{ ...target }] : [], next_cursor: null }
    if (input.url.startsWith('/conversations/'))
      return (
        pages.shift() || {
          items: [],
          next_after_seq: Number(/after_seq=(\d+)/.exec(input.url)![1]),
        }
      )
    const id = input.url.split('/')[3]!
    return statuses[id] || { message_id: id, status: 'pending', delivery_seq: null }
  }
  const request = async (input: Transport) => {
    calls.push(structuredClone(input))
    return input.method ? command(input) : reads(input)
  }
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/chat.ts', import.meta.url), 'utf8'),
    { request },
  )
  Object.assign(globalThis, {
    uni: {
      showModal: (input: { success: (result: { confirm: boolean }) => void }) =>
        input.success({ confirm: true }),
    },
  })
  const page = await loadRuntime(
    pageScript(new URL('../src/pages/chat/index.vue', import.meta.url)) +
      '\nexport { refresh, send, draft, attempt, afterSeq, timeline, outgoing, canSend, error, notice, sending, reading };',
    {
      ...api,
      config: { useMock: false },
      useUserStore: () => user,
      useChatStore: () => store,
      session,
      RequestError,
      canWriteConversation,
      mergeMessages,
      isMessageStatus,
      messageStatusLabels,
      createVisiblePoller: (task: () => Promise<void>) => {
        pollTask = task
        return {
          start: () => {
            void task()
          },
          stop: () => {
            stops++
          },
        }
      },
      onLoad: (fn: typeof hooks.load) => {
        hooks.load = fn!
      },
      onShow: (fn: typeof hooks.show) => {
        hooks.show = fn!
      },
      onHide: (fn: typeof hooks.hide) => {
        hooks.hide = fn!
      },
      onUnload: (fn: typeof hooks.unload) => {
        hooks.unload = fn!
      },
    },
  )
  hooks.load!({ id: conversation.id })
  hooks.show!()
  await settle()
  return {
    page,
    calls,
    pages,
    statuses,
    store,
    user,
    hooks,
    api,
    RequestError,
    session,
    stops: () => stops,
    poll: () => pollTask!(),
    setTarget: (value: Conversation | null) => {
      target = value
    },
    setCommand: (value: typeof command) => {
      command = value
    },
    setReads: (value: typeof reads) => {
      reads = value
    },
    changeSession: () => {
      epoch++
    },
  }
}
const writes = (calls: Transport[]) => calls.filter((call) => call.method)
test('REQ-007：202仅进入待审回执，审核状态序号不推进聊天增量；慢审A后达不漏读', async () => {
  const s = await setup()
  s.page.draft.value = ' 合成原文 '
  await s.page.send()
  assert.deepEqual(writes(s.calls)[0]!.data, {
    body: ' 合成原文 ',
    client_message_id: writes(s.calls)[0]!.data!.client_message_id,
    expected_write_epoch: 4,
  })
  assert.equal(s.page.timeline.value.length, 0)
  assert.equal(s.page.outgoing.value[0].status, 'pending')
  s.statuses['synthetic-outgoing'] = {
    message_id: 'synthetic-outgoing',
    status: 'delivered',
    delivery_seq: 2,
  }
  s.pages.push({ items: [delivered('synthetic-b', 1)], next_after_seq: 1 })
  await s.poll()
  assert.equal(s.page.afterSeq.value, 1)
  s.pages.push({ items: [delivered('synthetic-outgoing', 2)], next_after_seq: 2 })
  await s.poll()
  assert.equal(s.page.afterSeq.value, 2)
  assert.equal(s.page.timeline.value.length, 2)
  assert.equal(s.page.outgoing.value.length, 0)
  await s.poll()
  assert.equal(s.page.afterSeq.value, 2)
})
test('REQ-007：503/弱网重试复用client_message_id、正文、写代次和幂等键', async () => {
  const s = await setup()
  let count = 0
  s.setCommand(async () => {
    if (++count === 1) throw new s.RequestError(503)
    return { message_id: 'synthetic-outgoing', status: 'pending_scan', delivery_seq: null }
  })
  s.page.draft.value = '原合成消息'
  await s.page.send()
  assert.ok(s.page.attempt.value)
  s.page.draft.value = '不能替换原重试正文'
  await s.page.send(true)
  assert.equal(writes(s.calls).length, 2)
  assert.deepEqual(writes(s.calls)[1]!.data, writes(s.calls)[0]!.data)
  assert.deepEqual(writes(s.calls)[1]!.header, writes(s.calls)[0]!.header)
  assert.equal(s.page.attempt.value, null)
})
test('REQ-007/018：409不自动重写，只读、失效资格和空白消息不能发送', async () => {
  const s = await setup()
  s.page.draft.value = '  '
  await s.page.send()
  assert.equal(writes(s.calls).length, 0)
  s.page.draft.value = '合成消息'
  s.setCommand(async () => {
    s.setTarget({ ...conversation, can_write: false, write_epoch: 5 })
    throw new s.RequestError(409)
  })
  await s.page.send()
  assert.equal(writes(s.calls).length, 1)
  assert.equal(s.page.canSend.value, false)
  assert.match(s.page.error.value, /手动发送/)
  await s.page.send()
  assert.equal(writes(s.calls).length, 1)
  s.user.validated = false
  assert.equal(s.page.timeline.value.length, 0)
})
test('REQ-018：离开停止轮询、清正文与输入；迟到发送不写回执，新会话不读旧记录', async () => {
  const s = await setup()
  let finish: ((value: unknown) => void) | undefined
  s.setCommand(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  s.page.draft.value = '不可恢复的合成输入'
  const pending = s.page.send()
  await s.page.send()
  assert.equal(writes(s.calls).length, 1)
  s.hooks.hide!()
  assert.equal(s.page.draft.value, '')
  assert.equal(s.page.timeline.value.length, 0)
  assert.equal(s.stops(), 1)
  finish!({ message_id: 'synthetic-late', status: 'pending_scan', delivery_seq: null })
  await pending
  assert.deepEqual(s.store.receipts, {})
  s.setTarget({ ...conversation, id: 'synthetic-new-conversation' })
  s.hooks.load!({ id: 'synthetic-new-conversation' })
  s.hooks.show!()
  await settle()
  assert.ok(
    s.calls.some(
      (item) =>
        item.url === '/conversations/synthetic-new-conversation/messages?after_seq=0&limit=50',
    ),
  )
  assert.equal(s.page.outgoing.value.length, 0)
})
test('REQ-018：失去会话读取权或403时移除旧时间线和发送资格，账号变化清回执', async () => {
  const s = await setup()
  s.pages.push({ items: [delivered('synthetic-readable', 1)], next_after_seq: 1 })
  await s.poll()
  assert.equal(s.page.timeline.value.length, 1)
  s.setReads(async () => {
    throw new s.RequestError(403)
  })
  await s.poll()
  assert.equal(s.page.timeline.value.length, 0)
  assert.equal(s.page.canSend.value, false)
  s.user.user.id = 'synthetic-other'
  assert.deepEqual(s.store.receipts, {})
})
test('REQ-007：会话在分页后才能授权；游标循环拒绝，离开后不继续翻页', async () => {
  const calls: Transport[] = []
  let active = true
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/chat.ts', import.meta.url), 'utf8'),
    {
      request: async (input: Transport) => {
        calls.push(input)
        return input.url.includes('cursor=')
          ? { items: [conversation], next_cursor: null }
          : { items: [], next_cursor: 'synthetic.cursor' }
      },
    },
  )
  assert.equal((await api.findConversation(conversation.id)).id, conversation.id)
  assert.equal(calls[1]!.url, '/me/conversations?cursor=synthetic.cursor')
  active = false
  const previous = calls.length
  assert.equal(await api.findConversation(conversation.id, () => active), null)
  assert.equal(calls.length, previous)
  const loop = await loadRuntime(
    readFileSync(new URL('../src/api/chat.ts', import.meta.url), 'utf8'),
    { request: async () => ({ items: [], next_cursor: 'same.cursor' }) },
  )
  await assert.rejects(() => loop.findConversation('synthetic-missing'), /游标异常/)
})
test('REQ-006：仅送达通知可解析为会话，其他不透明引用不能当URL跳转', () => {
  assert.equal(
    notificationConversation({
      id: 'synthetic-n',
      version: 1,
      kind: 'message_delivered',
      read: false,
      target_ref: conversation.id,
    }),
    conversation.id,
  )
  for (const kind of ['crisis_care', 'penalty_notice', 'message_reviewed', 'unknown'])
    assert.equal(
      notificationConversation({
        id: 'synthetic-n',
        version: 1,
        kind,
        read: false,
        target_ref: 'https://example.invalid',
      }),
      null,
    )
})
async function setupInbox() {
  const user = reactive({
    user: { ...actor, verification: 'rejected' },
    isLoggedIn: true,
    validated: true,
    refresh: async () => {},
  })
  const hooks: Record<string, () => void> = {}
  const calls: Transport[] = []
  const navigations: string[] = []
  let rows = [
    {
      id: 'synthetic-notification',
      version: 6,
      read: false,
      kind: 'message_delivered',
      target_ref: conversation.id,
      notice: '通用合成提示',
    },
  ]
  class RequestError extends Error {
    statusCode = 409
  }
  let command = async (input: Transport) => ({
    ...rows[0],
    read: true,
    version: Number(input.data!.expected_version) + 1,
  })
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/chat.ts', import.meta.url), 'utf8'),
    {
      request: async (input: Transport) => {
        calls.push(structuredClone(input))
        if (input.method) return command(input)
        return input.url.startsWith('/me/notifications')
          ? { items: structuredClone(rows), next_cursor: 'notification.cursor' }
          : { items: [conversation], next_cursor: null }
      },
    },
  )
  Object.assign(globalThis, {
    uni: {
      navigateTo: (input: { url: string }) => {
        navigations.push(input.url)
      },
    },
  })
  const page = await loadRuntime(
    pageScript(new URL('../src/pages/inbox/index.vue', import.meta.url)) +
      '\nexport { load, selectTab, markRead, openNotification, notificationRows, unreadCount, notice, error };',
    {
      ...api,
      useUserStore: () => user,
      config: { useMock: false },
      session: { getEpoch: () => 1, getToken: () => 'synthetic-token' },
      RequestError,
      notificationConversation,
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
  hooks.show!()
  await settle()
  page.selectTab('notifications')
  await settle()
  return {
    page,
    calls,
    navigations,
    hooks,
    user,
    RequestError,
    setRows: (value: typeof rows) => {
      rows = value
    },
    setCommand: (value: typeof command) => {
      command = value
    },
  }
}
test('REQ-006/018：通知已读绑定本人列表对象与通知6而非Me99，已读不代表普通写权限', async () => {
  const s = await setupInbox()
  assert.equal(s.page.unreadCount.value, 1)
  await s.page.markRead({ ...s.page.notificationRows.value[0] })
  assert.equal(writes(s.calls).length, 0)
  s.page.openNotification(s.page.notificationRows.value[0])
  assert.deepEqual(s.navigations, [`/pages/chat/index?id=${conversation.id}`])
  await s.page.markRead(s.page.notificationRows.value[0])
  assert.deepEqual(writes(s.calls)[0]!.data, { expected_version: 6 })
  assert.ok(writes(s.calls)[0]!.header?.['Idempotency-Key'])
  assert.equal(s.page.unreadCount.value, 0)
  await s.page.markRead(s.page.notificationRows.value[0])
  assert.equal(writes(s.calls).length, 1)
})
test('REQ-006：通知分页只传本人游标，409重读不重发，离开或账号变化清列表与跳转依据', async () => {
  const s = await setupInbox()
  await s.page.load(true)
  assert.ok(s.calls.some((input) => input.url === '/me/notifications?cursor=notification.cursor'))
  assert.equal(s.page.notificationRows.value.length, 1)
  s.setCommand(async () => {
    throw new s.RequestError('合成冲突')
  })
  await s.page.markRead(s.page.notificationRows.value[0])
  assert.equal(writes(s.calls).length, 1)
  assert.match(s.page.notice.value, /手动确认/)
  const old = s.page.notificationRows.value[0]
  s.user.user.id = 'synthetic-other'
  s.page.openNotification(old)
  assert.equal(s.navigations.length, 0)
  assert.equal(s.page.notificationRows.value.length, 0)
  s.hooks.hide!()
  assert.equal(s.page.unreadCount.value, 0)
})
