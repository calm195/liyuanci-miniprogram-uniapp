<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { listStories, getStory } from '@/api/stories'
import { isPublicContent } from '@/utils/story'
import type { WishPublicContent } from '@/types/wish'
import PublicContent from '@/components/PublicContent.vue'
const user = useUserStore()
const props = defineProps<{ storyId?: string }>()
const id = computed(() => props.storyId || '')
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
  if (!more) {
    cursor.value = null
    usedCursors.clear()
  }
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
function openStory(storyId: string) {
  const encoded = encodeURIComponent(storyId)
  uni.navigateTo({
    url: id.value
      ? `/pages/share/index?kind=story&id=${encoded}`
      : `/pages/stories/index?id=${encoded}`,
  })
}
function leave() {
  visible = false
  generation++
  clear()
  busy.value = false
  error.value = ''
}
watch(
  [() => user.user?.id, id],
  () => {
    generation++
    clear()
    busy.value = false
  },
  { flush: 'sync' },
)
watch(id, () => {
  if (visible) void load()
})
onMounted(() => {
  visible = true
  void load()
})
onUnmounted(leave)
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
defineExpose({ refresh: load })
</script>
<template>
  <view class="story-wall">
    <text v-if="busy && !rows.length" class="wall-state">正在加载故事…</text>
    <view v-for="content in rows" :key="content.id" class="story-card">
      <text v-if="content.title" class="story-title">{{ content.title }}</text>
      <PublicContent :content="content" kind="story" :compact="!id">
        <template #actions>
          <button
            class="story-link"
            :loading="isPageActionPending('story-wall-open:' + content.id)"
            @click="runPageAction(() => openStory(content.id), 'story-wall-open:' + content.id)"
          >
            {{ id ? '分享故事 ›' : '阅读故事 ›' }}
          </button>
        </template>
      </PublicContent>
    </view>
    <view v-if="!busy && !error && !rows.length" class="wall-state">
      <text>还没有公开的还愿故事</text>
    </view>
    <button
      v-if="cursor && rows.length"
      class="wall-more"
      :disabled="busy"
      :loading="isPageActionPending('components-StoryWall-button-1')"
      @click="runPageAction(() => load(true), 'components-StoryWall-button-1')"
    >
      加载下一页
    </button>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>

<style scoped>
.story-card {
  padding: 26rpx;
  margin-bottom: 20rpx;
  border: 1px solid var(--theme-line);
  border-radius: 24rpx;
  background: var(--theme-surface);
}
.story-title {
  display: block;
  margin-bottom: 12rpx;
  color: var(--theme-ink);
  font-size: 32rpx;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.story-link {
  width: auto;
  min-height: 56rpx;
  margin: 0 0 0 auto;
  padding: 0 6rpx;
  border: 0;
  background: transparent;
  color: var(--theme-teal);
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}
.wall-state {
  display: block;
  padding: 30rpx;
  margin-bottom: 20rpx;
  border-radius: 24rpx;
  background: var(--theme-surface);
  color: var(--theme-muted);
  text-align: center;
}
.wall-more {
  color: var(--theme-teal);
  background: var(--theme-surface);
  border: 1px solid var(--theme-line);
}
</style>
