import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'

async function replies(
  target: string,
  pages: { items: { id: string }[]; next_cursor: string | null }[],
  root = 'root',
) {
  const anchor = ref('')
  const editor = {
    expanded: ref(true),
    rootId: ref('root'),
    replyId: ref(target),
    anchor,
    setAnchor: (value: string) => {
      anchor.value = value
    },
    body: ref('保留当前草稿'),
    retryReady: ref(true),
    close() {
      this.expanded.value = false
    },
  }
  const unmount: (() => void)[] = []
  let calls = 0
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/WhisperReplies.vue', import.meta.url)) +
      '\nexport { items, error, cursor, editorHere, repliesExpanded, toggleReplies, load }',
    {
      defineProps: () => ({
        post: { id: 'post', content_version: 3, comments_epoch: 2 },
        root: { id: root },
        editor,
      }),
      defineEmits: () => () => {},
      onUnmounted: (fn: () => void) => unmount.push(fn),
      session: { getEpoch: () => 1 },
      callWhisper: async () => {
        const page = pages[calls++]
        if (!page) throw new Error('未配置分页')
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            post_id: 'post',
            parent_content_version: 3,
            root_comment_id: root,
          })),
        }
      },
    },
  )
  await settle()
  return { editor, runtime, calls: () => calls, unmount: () => unmount.forEach((fn) => fn()) }
}

test('回复位置：根回复只有当前根锚点，收起和重新挂载不清控制器草稿或未知请求', async () => {
  const s = await replies('root', [])
  assert.equal(s.runtime.editorHere('root'), true)
  assert.equal(s.runtime.editorHere('other'), false)
  assert.equal(s.calls(), 0)
  s.editor.expanded.value = false
  await settle()
  assert.equal(s.editor.anchor.value, '')
  s.editor.expanded.value = true
  await settle()
  assert.equal(s.editor.anchor.value, 'root:root')
  s.unmount()
  assert.equal(s.editor.anchor.value, '')
  assert.equal(s.editor.body.value, '保留当前草稿')
  assert.equal(s.editor.retryReady.value, true)
})

test('回复位置：旧子回复链接自动读到对应页，只把编辑框放在命中的子回复下', async () => {
  const s = await replies('target', [
    { items: [{ id: 'earlier' }], next_cursor: 'next' },
    { items: [{ id: 'target' }], next_cursor: null },
  ])
  assert.equal(s.calls(), 2)
  assert.equal(s.runtime.editorHere('root'), false)
  assert.equal(s.runtime.editorHere('earlier'), false)
  assert.equal(s.runtime.editorHere('target'), true)
  assert.equal(s.editor.anchor.value, 'root:target')
})

test('回复位置：根缺失或跨页游标循环时保留无锚点恢复区，不无限读取或清稿', async () => {
  const missing = await replies('target', [], 'another-root')
  assert.equal(missing.calls(), 0)
  assert.equal(missing.editor.anchor.value, '')
  const cycle = await replies('target', [
    { items: [], next_cursor: 'a' },
    { items: [], next_cursor: 'b' },
    { items: [], next_cursor: 'a' },
  ])
  assert.equal(cycle.calls(), 3)
  assert.match(cycle.runtime.error.value, /回复列表已变化/)
  assert.equal(cycle.editor.anchor.value, '')
  assert.equal(cycle.editor.body.value, '保留当前草稿')
  assert.equal(cycle.editor.retryReady.value, true)
})

test('楼内列表：收起再展开复用已读分页，仍能加载后续回复', async () => {
  const s = await replies('root', [
    { items: [{ id: 'first' }], next_cursor: 'next' },
    { items: [{ id: 'second' }], next_cursor: null },
  ])
  await s.runtime.toggleReplies()
  assert.equal(s.runtime.repliesExpanded.value, true)
  assert.equal(s.calls(), 1)
  await s.runtime.toggleReplies()
  assert.equal(s.runtime.repliesExpanded.value, false)
  assert.equal(s.runtime.items.value.length, 1)
  await s.runtime.toggleReplies()
  assert.equal(s.calls(), 1)
  await s.runtime.load()
  assert.equal(s.calls(), 2)
  assert.deepEqual(
    s.runtime.items.value.map((item: { id: string }) => item.id),
    ['first', 'second'],
  )
  await s.runtime.toggleReplies()
  await s.runtime.toggleReplies()
  assert.equal(s.calls(), 2)
})

test('楼内列表：收起子回复输入框仍保留草稿和未知命令，再回复时可恢复原位置', async () => {
  const s = await replies('target', [{ items: [{ id: 'target' }], next_cursor: null }])
  assert.equal(s.runtime.repliesExpanded.value, true)
  await s.runtime.toggleReplies()
  await settle()
  assert.equal(s.editor.expanded.value, false)
  assert.equal(s.editor.body.value, '保留当前草稿')
  assert.equal(s.editor.retryReady.value, true)
  await s.runtime.toggleReplies()
  s.editor.expanded.value = true
  await settle()
  assert.equal(s.runtime.editorHere('target'), true)
  assert.equal(s.calls(), 1)
})
