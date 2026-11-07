import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import { isPublicContent } from '../src/utils/story.ts'

test('页内还愿墙重读保留内容，离页清理且丢弃晚到结果，返回重新读取', async () => {
  const hooks: Record<string, () => void> = {}
  const props = reactive({ storyId: '' })
  const user = reactive({ user: { id: 'wall-owner' } })
  let delayed = false
  let resolve!: (page: unknown) => void
  const content = {
    id: 'story-one',
    body: '合成故事',
    content_version: 1,
    school_related: false,
    notice_codes: [],
    notice_text: '',
  }
  const result = { items: [content], next_cursor: null }
  const page = await loadRuntime(
    pageScript(new URL('../src/components/StoryWall.vue', import.meta.url)) +
      '\nexport { load, rows };',
    {
      config: { useMock: false },
      session: { getEpoch: () => 1 },
      useUserStore: () => user,
      isPublicContent,
      defineProps: () => props,
      async getStory(id: string) {
        return { ...content, id }
      },
      defineExpose(value: { refresh: unknown }) {
        assert.equal(typeof value.refresh, 'function')
      },
      onMounted(fn: () => void) {
        hooks.mount = fn
      },
      onUnmounted(fn: () => void) {
        hooks.unmount = fn
      },
      onShow(fn: () => void) {
        hooks.show = fn
      },
      onHide(fn: () => void) {
        hooks.hide = fn
      },
      async listStories() {
        return delayed
          ? new Promise((done) => {
              resolve = done
            })
          : result
      },
    },
  )
  hooks.mount!()
  await settle()
  assert.equal(page.rows.value.length, 1)
  delayed = true
  const pending = page.load()
  assert.equal(page.rows.value.length, 1)
  hooks.hide!()
  resolve(result)
  await pending
  assert.equal(page.rows.value.length, 0)
  delayed = false
  hooks.show!()
  await settle()
  assert.equal(page.rows.value.length, 1)
  props.storyId = 'story-detail'
  await settle()
  assert.deepEqual(
    page.rows.value.map((row: { id: string }) => row.id),
    ['story-detail'],
  )
})
