import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript } from './support/page-runtime.ts'

test('公共评论操作栏分别遵守回复、展开和屏蔽权限，不能越过业务锁定', async () => {
  const props = reactive({
    canReply: false,
    replyDisabled: false,
    canExpand: false,
    expandDisabled: false,
    expanded: false,
    canBlock: false,
    blockDisabled: false,
    blockLoading: false,
  })
  const events: string[] = []
  const controls = await loadRuntime(
    pageScript(new URL('../src/components/CommentActionBar.vue', import.meta.url)) +
      '\nexport { reply, toggle, block }',
    { defineProps: () => props, defineEmits: () => (event: string) => events.push(event) },
  )
  controls.reply()
  controls.toggle()
  controls.block()
  assert.deepEqual(events, [])
  Object.assign(props, {
    canReply: true,
    canExpand: true,
    canBlock: true,
    replyDisabled: true,
    expandDisabled: true,
    blockDisabled: true,
  })
  controls.reply()
  controls.toggle()
  controls.block()
  assert.deepEqual(events, [])
  Object.assign(props, { replyDisabled: false, expandDisabled: false, blockDisabled: false })
  controls.reply()
  controls.toggle()
  props.blockLoading = true
  controls.block()
  props.blockLoading = false
  controls.block()
  assert.deepEqual(events, ['reply', 'toggle', 'block'])
  assert.equal(props.expanded, false, '展开状态仍由对应业务列表管理')
})

test('公共楼内分页仅在展开且可继续读取时发出事件，隐藏和读取中不重复触发', async () => {
  const props = reactive({ expanded: false, loading: false, hasMore: true, retry: false })
  const events: string[] = []
  const replies = await loadRuntime(
    pageScript(new URL('../src/components/CommentReplies.vue', import.meta.url)) +
      '\nexport { more }',
    { defineProps: () => props, defineEmits: () => (event: string) => events.push(event) },
  )
  replies.more()
  props.expanded = true
  props.loading = true
  replies.more()
  assert.deepEqual(events, [])
  props.loading = false
  replies.more()
  props.hasMore = false
  replies.more()
  assert.deepEqual(events, ['more'])
  props.retry = true
  replies.more()
  assert.deepEqual(events, ['more', 'more'])
  assert.equal(props.retry, true, '是否恢复成功仍由业务请求结果决定')
})
