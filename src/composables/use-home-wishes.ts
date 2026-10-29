import { computed, ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { listWishes } from '@/api/wishes'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useWishStore } from '@/stores/wishes'
import { publicWishBody } from '@/utils/wish'
import { session } from '@/utils/session'
import type { WishResult } from '@/types/wish'

export function useHomeWishes() {
  const user = useUserStore()
  const demo = useWishStore()
  const items = ref<WishResult[]>([])
  const busy = ref(false)
  const error = ref('')
  const epoch = ref(-1)
  let visible = false
  let generation = 0
  const rows = computed(() =>
    config.useMock
      ? demo.demoWishes.filter((wish) => publicWishBody(wish)).slice(0, 2)
      : epoch.value === session.getEpoch()
        ? items.value
        : [],
  )
  function clear() {
    generation++
    items.value = []
    epoch.value = -1
    busy.value = false
    error.value = ''
  }
  async function load() {
    clear()
    if (config.useMock || !visible) return
    const current = generation
    const started = session.getEpoch()
    const active = () => visible && current === generation && started === session.getEpoch()
    busy.value = true
    try {
      const page = await listWishes(false, { limit: 2 })
      if (!active()) return
      // 首页同样只消费已上架公开投影，不能拿本人草稿或屏障正文填充卡片。
      items.value = page.items.filter((wish) => publicWishBody(wish)).slice(0, 2)
      epoch.value = started
    } catch {
      if (active()) error.value = '心愿暂时没有捞上来，请稍后再试。'
    } finally {
      if (active()) busy.value = false
    }
  }
  function leave() {
    visible = false
    clear()
  }
  watch(
    () => user.user?.id,
    () => {
      clear()
      if (visible) void load()
    },
    { flush: 'sync' },
  )
  onShow(() => {
    visible = true
    void load()
  })
  onHide(leave)
  onUnload(leave)
  return { rows, busy, error, load }
}
