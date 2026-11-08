<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { listStories, getStory, resolveShare } from '@/api/stories'
import { isPublicContent } from '@/utils/story'
import type { WishPublicContent } from '@/types/wish'
import PublicContent from '@/components/PublicContent.vue'
import ContentSearchBar from '@/components/ContentSearchBar.vue'
import ShareActions from '@/components/ShareActions.vue'
import type { ContentSort } from '@/types/content'
const user = useUserStore()
const props = defineProps<{ storyId?: string; shareRef?: string; readOnly?: boolean }>()
const emit = defineEmits<{ shareContent: [content: WishPublicContent | null] }>()
const id = computed(() => props.storyId || '')
const detail = computed(() => !!id.value || props.shareRef !== undefined)
const items = ref<WishPublicContent[]>([])
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const keyword = ref('')
const sort = ref<ContentSort>('time')
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
  if (
    !visible ||
    busy.value ||
    (more && (!cursor.value || detail.value || readEpoch.value !== session.getEpoch()))
  )
    return
  const current = ++generation
  const epoch = session.getEpoch()
  const active = () => visible && current === generation && epoch === session.getEpoch()
  const next = more ? cursor.value! : undefined
  if (!more) {
    if (detail.value) items.value = []
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
    const reference = props.shareRef
    let targetId = id.value
    if (reference !== undefined) {
      // 先验证扫码引用，再走好友和朋友圈共用的匿名详情读取。
      if (!reference) throw new Error('分享引用无效')
      const share = await resolveShare(reference)
      if (!active()) return
      if (share?.target_kind !== 'story' || !isPublicContent(share.target))
        throw new Error('分享内容不可用')
      targetId = share.target.id
    }
    const page = targetId
      ? {
          items: [await getStory(targetId, reference === undefined && !props.readOnly)],
          next_cursor: null,
        }
      : await listStories(next, { keyword: keyword.value, sort: sort.value })
    if (!active()) return
    if (
      !Array.isArray(page.items) ||
      !page.items.every(isPublicContent) ||
      (targetId && page.items[0]?.id !== targetId) ||
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
    error.value = detail.value
      ? '故事不存在或当前不可公开查看，请刷新后重试。'
      : '还愿墙暂不可读取，请刷新后重试。'
  } finally {
    if (current === generation) busy.value = false
  }
}
async function search(value: string, order: ContentSort) {
  if (busy.value) return
  keyword.value = value
  sort.value = order
  clear()
  await load()
}
function openStory(storyId: string) {
  uni.navigateTo({ url: `/pages/stories/index?id=${encodeURIComponent(storyId)}` })
}
function leave() {
  visible = false
  generation++
  clear()
  busy.value = false
  error.value = ''
}
const identity = [() => user.user?.id, () => session.getEpoch(), id, () => props.shareRef] as const
watch(
  identity,
  () => {
    generation++
    clear()
    busy.value = false
  },
  { flush: 'sync' },
)
watch(identity, () => {
  if (visible) void load()
})
watch(
  () => (detail.value && !busy.value ? (rows.value[0] ?? null) : null),
  (content) => emit('shareContent', content),
  { flush: 'sync' },
)
function show() {
  visible = true
  void load()
}
onMounted(show)
onUnmounted(leave)
defineExpose({ refresh: load, show, hide: leave })
</script>
<template>
  <view class="story-wall">
    <ContentSearchBar
      v-if="!detail && !config.useMock"
      :keyword="keyword"
      :sort="sort"
      :disabled="busy"
      @search="search"
    />
    <text v-if="busy && !rows.length" class="wall-state">正在加载故事…</text>
    <view v-for="content in rows" :key="content.id" class="story-card">
      <text v-if="content.title" class="story-title">{{ content.title }}</text>
      <PublicContent :content="content" kind="story" :compact="!detail" :read-only="readOnly">
        <template #actions>
          <ShareActions
            v-if="
              detail &&
              !readOnly &&
              !busy &&
              user.validated &&
              user.user?.verification === 'verified'
            "
            kind="story"
            :content="content"
          />
          <button
            v-if="!detail"
            class="story-link"
            :loading="isPageActionPending('story-wall-open:' + content.id)"
            @click="runPageAction(() => openStory(content.id), 'story-wall-open:' + content.id)"
          >
            阅读故事 ›
          </button>
        </template>
      </PublicContent>
    </view>
    <view v-if="!busy && !error && !rows.length" class="wall-state">
      <text>{{ keyword ? '暂时没有符合条件的还愿故事' : '还没有公开的还愿故事' }}</text>
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
    <text v-if="readOnly && error" class="wall-state">分享的故事暂不可查看。</text>
    <AppNotice :message="error" kind="error" />
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
