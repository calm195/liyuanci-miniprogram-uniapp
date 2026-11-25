import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listWhisperPosts } from '@/api/whispers'
import { useLoginRefresh } from '@/composables/use-login'
import { useWhisperHug } from '@/composables/use-whisper-hug'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { mergeWhisperPage } from '@/utils/whisper-content'
import type { ContentSort } from '@/types/content'
import type { PublicPost } from '@/types/whispers'

export function useWhisperFeed(limit = 20) {
  const module = useWhispersStore()
  const items = ref<PublicPost[]>([])
  const cursor = ref<string | null>(null)
  const ready = ref(false)
  const keyword = ref('')
  const sort = ref<ContentSort>('time')
  const seen = new Set<string>()
  function clear() {
    items.value = []
    cursor.value = null
    ready.value = false
    seen.clear()
  }
  const page = useWhisperPage(clear, () => void load())
  async function load(more = false) {
    if (more && !cursor.value) return
    const previous = more ? cursor.value! : undefined
    await page.read(async (active) => {
      if (!more) await module.refresh(false)
      if (!active()) return
      if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
      const result = await listWhisperPosts(
        { limit, ...(previous ? { cursor: previous } : {}) },
        { keyword: keyword.value, sort: sort.value },
      )
      if (!active()) return
      if (!more) seen.clear()
      const merged = mergeWhisperPage(more ? items.value : [], result, previous, seen)
      items.value = merged.items
      cursor.value = merged.cursor
      ready.value = true
    }, more)
  }
  async function search(value: string, order: ContentSort) {
    if (page.busy.value || page.writing.value || page.retryReady.value) return
    keyword.value = value
    sort.value = order
    clear()
    await load()
  }
  const hug = useWhisperHug(
    page,
    (id) => items.value.find((item) => item.id === id),
    (post) => {
      items.value = items.value.map((item) => (item.id === post.id ? post : item))
    },
    () => load(),
  )
  page.onRefresh(() => load())
  onShow(() => {
    void load()
  })
  useLoginRefresh(() => load())
  return { ...page, items, cursor, ready, keyword, sort, load, search, hug }
}
