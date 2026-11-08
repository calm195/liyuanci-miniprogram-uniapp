import { computed, ref, watch } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import { listHotContent } from '@/api/hot-content'
import type { HotContentEntry } from '@/api/hot-content'
import type { HotContentKind } from '@/types/content'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useHiddenWishes } from './use-hidden-wishes'

export function useHotContent() {
  const wish = ref<HotContentEntry[]>([])
  const { hidden } = useHiddenWishes()
  const whisper = ref<HotContentEntry[]>([])
  const busy = ref({ wish: false, whisper: false })
  const errors = ref({ wish: '', whisper: '' })
  const generations = { wish: 0, whisper: 0 }
  let visible = false
  const requested = new Set<HotContentKind>()

  async function load(kind: HotContentKind) {
    requested.add(kind)
    if (config.useMock || !visible) return
    const current = ++generations[kind]
    const epoch = session.getEpoch()
    const active = () => visible && generations[kind] === current && session.getEpoch() === epoch
    const rows = kind === 'wish' ? wish : whisper
    rows.value = []
    busy.value[kind] = true
    errors.value[kind] = ''
    try {
      const entries = await listHotContent(kind)
      if (active()) rows.value = entries
    } catch {
      if (active()) errors.value[kind] = '热点暂时无法加载，请下拉刷新。'
    } finally {
      if (active()) busy.value[kind] = false
    }
  }

  function clear() {
    generations.wish++
    generations.whisper++
    wish.value = []
    whisper.value = []
    busy.value = { wish: false, whisper: false }
    errors.value = { wish: '', whisper: '' }
  }
  function leave() {
    visible = false
    clear()
  }
  watch(
    () => session.getEpoch(),
    () => {
      clear()
      if (visible)
        requested.forEach((kind) => {
          void load(kind)
        })
    },
    { flush: 'sync' },
  )
  onShow(() => {
    visible = true
  })
  onHide(leave)
  onUnload(leave)
  return {
    wish: computed(() => wish.value.filter((item) => !hidden.value.has(item.id))),
    whisper,
    busy,
    errors,
    load,
  }
}
