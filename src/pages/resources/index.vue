<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import { dictionaryLabel } from '@/features/dictionaries/catalog'
const resourceFeedbackChoices = computed(() =>
  resourceFeedbackCodes.map((kind) => ({
    kind,
    label: dictionaryLabel('resource_feedback', kind),
  })),
)
import { onPullDownRefresh } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import FeedPageHero from '@/components/FeedPageHero.vue'
import AppIcon from '@/components/AppIcon.vue'
import ContentStats from '@/components/ContentStats.vue'
import ResourceContribution from '@/components/ResourceContribution.vue'
import { listResourceCategories, listResources } from '@/api/resources'
import { useResourcePage, resourceFailure } from '@/composables/use-resource-page'
import { mergeResourcePage, resourceFeedbackCodes } from '@/utils/resources'
import { normalizeResourceText } from '@/utils/resource-schema'
import type { ResourceCategory, ResourceSummary } from '@/types/resource'
const items = ref<ResourceSummary[]>([])
const categories = ref<ResourceCategory[]>([])
const category = ref('')
const keyword = ref('')
const submittedKeyword = ref('')
const cursor = ref<string | null>(null)
const contribution = ref(false)
const seen = new Set<string>()
let queryGeneration = 0
function clear() {
  queryGeneration++
  items.value = []
  categories.value = []
  cursor.value = null
  category.value = ''
  keyword.value = ''
  submittedKeyword.value = ''
  contribution.value = false
  seen.clear()
}
const page = useResourcePage(clear)
const { ready, busy, error, gate, notice, user } = page
const visible = computed(() => ready.value && user.validated)
const categoryNames = computed(() => ['全部分类', ...categories.value.map((c) => c.name)])
const selectedIndex = computed(() => categories.value.findIndex((c) => c.id === category.value) + 1)
async function load() {
  await page.enter(async (active) => {
    let next: string | undefined
    let catalog: ResourceCategory[] = []
    const catalogSeen = new Set<string>()
    do {
      const result = await listResourceCategories({ limit: 100, ...(next ? { cursor: next } : {}) })
      if (!active()) return
      catalog = mergeResourcePage(catalog, result, next, catalogSeen)
      next = result.next_cursor ?? undefined
    } while (next)
    const result = await listResources({
      limit: 20,
      ...(category.value ? { category_id: category.value } : {}),
      ...(submittedKeyword.value ? { q: submittedKeyword.value } : {}),
    })
    if (!active()) return
    seen.clear()
    categories.value = catalog
    items.value = mergeResourcePage([], result, undefined, seen)
    cursor.value = result.next_cursor
  })
}
async function search(more = false) {
  if (!visible.value || (more && (busy.value || !cursor.value))) return
  let q: string
  try {
    q = more ? submittedKeyword.value : normalizeResourceText('q', keyword.value) || ''
  } catch (failure) {
    error.value = resourceFailure(failure)
    return
  }
  const current = ++queryGeneration
  const active = page.ticket()
  const previous = more ? (cursor.value ?? undefined) : undefined
  if (!more) {
    items.value = []
    cursor.value = null
    seen.clear()
    submittedKeyword.value = q
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await listResources({
      limit: 20,
      ...(q ? { q } : {}),
      ...(category.value ? { category_id: category.value } : {}),
      ...(previous ? { cursor: previous } : {}),
    })
    if (!active() || current !== queryGeneration) return
    items.value = mergeResourcePage(more ? items.value : [], result, previous, seen)
    cursor.value = result.next_cursor
  } catch (failure) {
    if (active() && current === queryGeneration) {
      items.value = []
      cursor.value = null
      seen.clear()
      page.fail(failure)
    }
  } finally {
    if (active() && current === queryGeneration) busy.value = false
  }
}
function changeCategory(event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value)
  if (!Number.isInteger(index) || index < 0 || index > categories.value.length) return
  category.value = categories.value[index - 1]?.id || ''
  return search()
}
function resetSearch() {
  keyword.value = ''
  category.value = ''
  return search()
}
function openContribution() {
  if (visible.value) contribution.value = true
}
onShow(() => {
  void load()
})
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
  <AppPage tab="resources" title="资料共享" responsive-padding>
    <FeedPageHero
      title="资料广场"
      illustration="pavilion"
      description="少一点独自摸索，多一份同行的力量。"
    />
    <view class="ce-layout">
      <view v-if="gate" class="ui-section ce-panel ui-stack">
        <text class="ui-section-title">关于资料广场</text>
        <text class="ui-copy">资料广场提供学习资料检索、文件下载和资料状态反馈。</text>
        <text class="ui-copy">{{ gate }}</text>
        <LoginLink v-if="!user.isLoggedIn" class="ui-button ui-button-primary">微信登录</LoginLink>
        <navigator
          v-else-if="user.user?.verification !== 'verified'"
          class="ui-link"
          url="/pages/verification/index"
          >查看学生认证</navigator
        >
      </view>
      <AppNotice :message="error" kind="error" /><AppNotice :message="notice" kind="info" />
      <text v-if="busy" class="ui-state">正在加载资料…</text>
      <template v-if="visible">
        <view class="resource-filters">
          <view class="resource-search">
            <input
              v-model="keyword"
              class="ui-input"
              :maxlength="-1"
              placeholder="搜索资料标题或简介"
              aria-label="搜索资料标题或简介"
              confirm-type="search"
              @confirm="runPageAction(() => search())"
            />
            <button
              class="ui-button"
              :loading="isPageActionPending('pages-resources-index-button-3')"
              @click="runPageAction(() => search(), 'pages-resources-index-button-3')"
            >
              搜索
            </button>
          </view>
          <scroll-view class="resource-categories" scroll-x :show-scrollbar="false">
            <button
              v-for="(name, index) in categoryNames"
              :key="index"
              class="category-chip"
              :class="{ selected: selectedIndex === index }"
              :aria-pressed="selectedIndex === index"
              :loading="isPageActionPending('resource-category:' + index)"
              @click="
                runPageAction(
                  () => changeCategory({ detail: { value: index } }),
                  'resource-category:' + index,
                )
              "
            >
              {{ name }}
            </button>
          </scroll-view>
          <view v-if="keyword || category" class="resource-reset">
            <button
              class="ui-button"
              :loading="isPageActionPending('pages-resources-index-button-4')"
              @click="runPageAction(() => resetSearch(), 'pages-resources-index-button-4')"
            >
              清空筛选
            </button>
          </view>
        </view>
        <text v-if="!busy && !error && !items.length" class="ui-state"
          >暂无符合条件的资料，换个关键词或看看其他分类。</text
        >
        <view v-if="items.length" class="resource-list">
          <navigator
            v-for="item in items"
            :key="item.id"
            :url="'/pages/resources/detail?id=' + item.id"
            class="ui-section resource-row"
          >
            <view class="resource-file"><AppIcon name="book" :size="48" /></view>
            <view class="resource-copy">
              <text class="ui-meta">{{ item.category.name }}</text>
              <text class="ui-section-title">{{ item.title }}</text>
              <text class="ui-copy resource-excerpt">{{
                item.description_excerpt || '暂无简介'
              }}</text>
              <view v-if="item.feedback_summary" class="feedback-summary"
                ><text
                  v-for="feedback in resourceFeedbackChoices"
                  :key="feedback.kind"
                  class="ui-meta"
                  >{{ feedback.label }} {{ item.feedback_summary[feedback.kind] }}</text
                ></view
              >
              <ContentStats :views="item.view_count" /><text class="ui-link"
                >查看介绍与下载信息 ›</text
              >
            </view>
          </navigator>
        </view>
        <button
          v-if="cursor"
          class="ui-button"
          :disabled="busy"
          :loading="isPageActionPending('pages-resources-index-button-5')"
          @click="runPageAction(() => search(true), 'pages-resources-index-button-5')"
        >
          加载更多
        </button>
        <ResourceContribution :open="contribution" @close="contribution = false" />
      </template>
    </view>
    <view v-if="visible" class="compose-space" aria-hidden="true" />
    <button
      v-if="visible"
      class="floating-compose resource-compose"
      :loading="isPageActionPending('pages-resources-index-button-2')"
      @click="runPageAction(() => openContribution(), 'pages-resources-index-button-2')"
    >
      ＋ 贡献资料
    </button>
  </AppPage>
</template>
<style scoped>
.resource-compose.resource-compose {
  left: auto;
  right: 28rpx;
}
.compose-space {
  height: 88rpx;
}

.ce-layout {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.ce-panel {
  margin-bottom: 0;
}
.resource-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.resource-row {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
  margin: 0;
  color: var(--theme-ink);
}
.resource-file {
  flex: 0 0 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96rpx;
  border-radius: 18rpx;
  background: var(--theme-mint);
}
.resource-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.resource-search {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.resource-search .ui-input {
  min-width: 0;
  flex: 1;
  margin: 0;
}
.resource-search .ui-button {
  flex: 0 0 auto;
  margin: 0;
  width: auto;
}
.resource-categories {
  width: 100%;
  white-space: nowrap;
  margin-top: 24rpx;
}
.resource-categories .category-chip {
  display: inline-flex;
  width: auto;
  margin: 0 12rpx 0 0;
  padding: 12rpx 24rpx;
  min-height: 64rpx;
  border: 0;
  border-radius: 16rpx;
  background: var(--theme-surface);
  color: var(--theme-muted);
  font-size: 24rpx;
}
.resource-categories .selected {
  background: var(--theme-brand);
  color: var(--theme-on-brand);
}
.resource-reset {
  display: flex;
  justify-content: flex-end;
  margin-top: 16rpx;
}
.resource-reset .ui-button {
  width: auto;
  margin: 0;
  font-size: 24rpx;
}
.feedback-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.resource-excerpt {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
