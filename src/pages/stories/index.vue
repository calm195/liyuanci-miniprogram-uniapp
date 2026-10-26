<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { listStories, getStory } from '@/api/stories'
import { isPublicContent } from '@/utils/story'
import type { WishPublicContent } from '@/types/wish'
import PublicContent from '@/components/PublicContent.vue'
const user = useUserStore()
const id = ref('')
const items = ref<WishPublicContent[]>([])
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const readEpoch = ref(-1)
const rows = computed(() => (readEpoch.value === session.getEpoch() ? items.value : []))
let visible = false
let generation = 0
const usedCursors = new Set<string>()
function clear() {
  items.value = []
  cursor.value = null
  readEpoch.value = -1
  usedCursors.clear()
}
async function load(more = false) {
  if (busy.value || (more && (!cursor.value || id.value || readEpoch.value !== session.getEpoch())))
    return
  const current = ++generation
  const epoch = session.getEpoch()
  const active = () => visible && current === generation && epoch === session.getEpoch()
  const next = more ? cursor.value! : undefined
  if (!more) clear()
  error.value = ''
  if (config.useMock) {
    error.value = '还愿墙需连接真实服务。'
    return
  }
  busy.value = true
  try {
    const page = id.value
      ? { items: [await getStory(id.value)], next_cursor: null }
      : await listStories(next)
    if (!active()) return
    if (
      !Array.isArray(page.items) ||
      !page.items.every(isPublicContent) ||
      (id.value && page.items[0]?.id !== id.value) ||
      (page.next_cursor !== null &&
        (typeof page.next_cursor !== 'string' ||
          !page.next_cursor ||
          page.next_cursor === next ||
          usedCursors.has(page.next_cursor)))
    )
      throw new Error('故事分页无效')
    items.value = [
      ...(more ? items.value : []),
      ...page.items.filter((item) => !more || !items.value.some((old) => old.id === item.id)),
    ]
    cursor.value = page.next_cursor
    if (next) usedCursors.add(next)
    readEpoch.value = epoch
  } catch {
    if (!active()) return
    clear()
    error.value = id.value
      ? '故事不存在或当前不可公开查看，请刷新后重试。'
      : '还愿墙暂不可读取，请刷新后重试。'
  } finally {
    if (current === generation) busy.value = false
  }
}
function leave() {
  visible = false
  generation++
  clear()
  busy.value = false
  error.value = ''
}
watch(
  () => user.user?.id,
  () => {
    generation++
    clear()
    busy.value = false
  },
  { flush: 'sync' },
)
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
})
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <AppPage>
    <text class="title">{{ id ? '还愿故事' : '还愿墙' }}</text>
    <button :disabled="busy" @click="runPageAction(() => load())">刷新</button>
    <navigator url="/pages/wishes/index">从我的心愿管理还愿故事</navigator>
    <text v-if="busy">加载中…</text>
    <view v-for="content in rows" :key="content.id" class="card">
      <PublicContent :content="content" kind="story" />
      <navigator v-if="!id" :url="`/pages/stories/index?id=${encodeURIComponent(content.id)}`"
        >查看故事</navigator
      >
      <navigator :url="`/pages/share/index?kind=story&id=${encodeURIComponent(content.id)}`"
        >分享故事</navigator
      >
    </view>
    <text v-if="!busy && !error && !rows.length">暂无可展示的公开故事</text>
    <button v-if="cursor && rows.length" :disabled="busy" @click="runPageAction(() => load(true))">
      加载下一页
    </button>
    <text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
