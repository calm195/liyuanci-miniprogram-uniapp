import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
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
      const merged = mergeWhisperPage(more ? items.value : [], result, previous, seen)
      items.value = merged.items
      cursor.value = merged.cursor
      ready.value = true
    }, more)
  }
  onShow(() => {
    void load()
  })
  return { ...page, items, cursor, ready, load }
}
