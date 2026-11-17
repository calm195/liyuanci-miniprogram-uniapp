<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import { ref, watch } from 'vue'
import { onShow, onHide, onUnload, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import FavoriteButton from '@/components/FavoriteButton.vue'
import { listFavorites } from '@/api/interactions'
import type { ContentKind, FavoriteItem } from '@/types/interactions'
import { session } from '@/utils/session'
const choices: { kind: ContentKind; label: string }[] = [
  { kind: 'wish', label: '心愿' },
  { kind: 'whisper_post', label: '悄悄话' },
  { kind: 'resource', label: '资料' },
]
const kind = ref<ContentKind>('wish')
const items = ref<FavoriteItem[]>([])
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const loggedIn = ref(false)
let visible = false
let generation = 0
const seen = new Set<string>()
async function load(more = false) {
  if (busy.value || (more && !cursor.value)) return
  loggedIn.value = !!session.getToken()
  if (!loggedIn.value) {
    items.value = []
    return
  }
  const current = ++generation
  const epoch = session.getEpoch()
  busy.value = true
  error.value = ''
  if (!more) {
    items.value = []
    cursor.value = null
    seen.clear()
  }
  try {
    const result = await listFavorites(kind.value, more ? (cursor.value ?? undefined) : undefined)
    if (!visible || current !== generation || epoch !== session.getEpoch()) return
    if (result.next_cursor && seen.has(result.next_cursor)) throw new Error('分页已变化，请刷新')
    if (result.next_cursor) seen.add(result.next_cursor)
    items.value = [
      ...(more ? items.value : []),
      ...result.items.filter(
        (item) =>
          !more ||
          !items.value.some((old) => old.kind === item.kind && old.target_id === item.target_id),
      ),
    ]
    cursor.value = result.next_cursor
  } catch {
    if (visible && current === generation) error.value = '收藏暂不可读取，请刷新后重试。'
  } finally {
    if (current === generation) busy.value = false
  }
}
function select(value: ContentKind) {
  if (busy.value) return
  kind.value = value
  void load()
}
function destination(item: FavoriteItem) {
  const path =
    item.kind === 'wish'
      ? 'wish-detail/index'
      : item.kind === 'whisper_post'
        ? 'whispers/detail'
        : 'resources/detail'
  return `/pages/${path}?id=${encodeURIComponent(item.target_id)}`
}
function leave() {
  visible = false
  clear()
}
function clear() {
  generation++
  items.value = []
  cursor.value = null
  busy.value = false
  error.value = ''
  seen.clear()
  loggedIn.value = !!session.getToken()
}
watch(
  () => session.getEpoch(),
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
onPullDownRefresh(async () => {
  try {
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding
    ><PageHeading
      title="我的收藏"
      description="收藏仅自己可见，内容下架后不再展示原文。" /><LoginLink
      v-if="!loggedIn"
      class="ui-link"
      >登录查看收藏</LoginLink
    ><view class="favorite-tabs"
      ><button
        v-for="choice in choices"
        :key="choice.kind"
        class="ui-button"
        :class="{ selected: kind === choice.kind }"
        :disabled="busy"
        @click="select(choice.kind)"
      >
        {{ choice.label }}
      </button></view
    ><text v-if="busy" class="ui-copy">加载中…</text
    ><view v-for="item in items" :key="item.kind + ':' + item.target_id" class="ui-section"
      ><navigator v-if="item.available" class="ui-link" :url="destination(item)"
        ><text class="ui-section-title">{{ item.content?.title || '查看收藏内容' }}</text
        ><text class="ui-copy">{{ item.content?.excerpt }}</text></navigator
      ><text v-else class="ui-copy">内容已不可查看</text
      ><FavoriteButton
        :kind="item.kind"
        :target-id="item.target_id"
        :favorited="true"
        @change="
          (active) => {
            if (!active) items = items.filter((entry) => entry !== item)
          }
        " /></view
    ><text v-if="loggedIn && !busy && !error && !items.length" class="ui-copy">暂时没有收藏</text
    ><button v-if="cursor" class="ui-button" :disabled="busy" @click="load(true)">加载更多</button
    ><button v-if="error" class="ui-button" :disabled="busy" @click="load()">重新加载</button
    ><AppNotice :message="error" kind="error"
  /></AppPage>
</template>
<style scoped>
.favorite-tabs {
  display: flex;
  gap: 16rpx;
  margin: 24rpx 0;
}
.favorite-tabs button {
  flex: 1;
}
.favorite-tabs .selected {
  background: var(--theme-teal);
  color: white;
}
</style>
