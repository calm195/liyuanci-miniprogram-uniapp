import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import { callWhisper } from '@/api/whispers'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { mergeWhisperPage } from '@/utils/whisper-content'
import type { PublicPost } from '@/types/whispers'

export function useWhisperFeed(limit = 20) {
  const module = useWhispersStore()
  const items = ref<PublicPost[]>([])
  const cursor = ref<string | null>(null)
  const ready = ref(false)
  const seen = new Set<string>()
  function clear() {
    items.value = []
    cursor.value = null
    ready.value = false
    seen.clear()
  }
  const page = useWhisperPage(clear)
  async function load(more = false) {
    if (more && !cursor.value) return
    const previous = more ? cursor.value! : undefined
    await page.read(async (active) => {
      if (!more) await module.refresh(false)
      if (!active()) return
      if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
      const result = await callWhisper('whisperPostsList', {
        query: { limit, ...(previous ? { cursor: previous } : {}) },
      })
      if (!active()) return
      if (!more) seen.clear()
      const merged = mergeWhisperPage(more ? items.value : [], result, previous, seen)
      items.value = merged.items
      cursor.value = merged.cursor
      ready.value = true
    }, more)
  }
  async function hug(target: PublicPost) {
    if (
      !items.value.includes(target) ||
      target.viewer_is_author ||
      !target.my_hug ||
      !canWhisperAction('PublicPost', target, 'whisperHugSet')
    )
      return
    await page.write(
      'whisperHugSet',
      {
        path: { post_id: target.id },
        data: {
          active: !target.my_hug.active,
          expected_post_version: target.version,
          expected_hug_version: target.my_hug.version,
        },
        key: whisperKey(),
      },
      (result) => {
        if (result.post_id !== target.id) throw new Error('抱抱回执目标不匹配，请下拉重试。')
        items.value = items.value.map((item) =>
          item.id === result.post_id
            ? { ...item, hug_count: result.hug_count, my_hug: result.my_hug }
            : item,
        )
        page.notice.value = result.my_hug.active ? '已送出抱抱。' : '已取消抱抱。'
      },
      () => load(),
    )
  }
  page.onRefresh(() => load())
  onShow(() => {
    void load()
  })
  return { ...page, items, cursor, ready, load, hug }
}
