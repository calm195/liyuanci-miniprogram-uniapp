<script setup lang="ts">
import { ref, watch } from 'vue'
import { onShow, onHide, onUnload, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
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
</script>
<template>
  <AppPage
    ><text class="title">我的收藏</text
    ><text class="subtitle">仅自己可见，内容下架后不再展示原文。</text
    ><navigator v-if="!loggedIn" url="/pages/login/index">登录查看收藏</navigator
    ><view class="favorite-tabs"
      ><button
        v-for="choice in choices"
        :key="choice.kind"
        :class="{ selected: kind === choice.kind }"
        :disabled="busy"
        @click="select(choice.kind)"
      >
        {{ choice.label }}
      </button></view
    ><text v-if="busy">加载中…</text
    ><view v-for="item in items" :key="item.kind + ':' + item.target_id" class="card"
      ><navigator v-if="item.available" :url="destination(item)"
        ><text class="section-title">{{ item.content?.title || '查看收藏内容' }}</text
        ><text>{{ item.content?.excerpt }}</text></navigator
      ><text v-else>内容已不可查看</text
      ><FavoriteButton
        :kind="item.kind"
        :target-id="item.target_id"
        :favorited="true"
        @change="
          (active) => {
            if (!active) items = items.filter((entry) => entry !== item)
          }
        " /></view
    ><text v-if="loggedIn && !busy && !error && !items.length">暂时没有收藏</text
    ><button v-if="cursor" :disabled="busy" @click="load(true)">加载更多</button
    ><button v-if="error" :disabled="busy" @click="load()">重新加载</button
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
