<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import AppIcon from '@/components/AppIcon.vue'
import ResourceContribution from '@/components/ResourceContribution.vue'
import { listResourceCategories, listResources } from '@/api/resources'
import { useResourcePage, resourceFailure } from '@/composables/use-resource-page'
import { mergeResourcePage } from '@/utils/resources'
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
    const result = await listResources({ limit: 20 })
    if (!active()) return
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
  void search()
}
function resetSearch() {
  keyword.value = ''
  category.value = ''
  void search()
}
function openContribution() {
  if (visible.value) contribution.value = true
}
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage tab="resources" title="资料广场">
    <view class="module-hero"
      ><text class="module-title">好资料，一起分享</text
      ><text class="module-subtitle">少一点独自摸索，多一份同行的力量。</text></view
    >
    <view v-if="gate" class="empty-state"
      ><AppIcon name="book" :size="64" />
      <text>{{ gate }}</text>
      <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
      <navigator v-else url="/pages/verification/index">查看学生认证</navigator>
    </view>
    <view v-if="error" class="card">
      <text>{{ error }}</text>
      <button :disabled="busy" @click="runPageAction(() => load())">刷新重试</button>
      <navigator url="/pages/safety/index">警告与申诉</navigator>
    </view>
    <text v-if="busy" class="page-footnote">正在加载资料…</text
    ><text v-if="notice" class="notice">{{ notice }}</text>
    <template v-if="visible">
      <view class="card">
        <view class="section-heading"
          ><text class="section-title">发现资料</text
          ><button class="small-link" @click="runPageAction(() => openContribution())">
            资料投稿 ＋
          </button></view
        >
        <picker :range="categoryNames" :value="selectedIndex" @change="changeCategory"
          ><view>分类：{{ categoryNames[selectedIndex] }}</view></picker
        >
        <input
          v-model="keyword"
          :maxlength="-1"
          placeholder="搜索资料标题或简介"
          confirm-type="search"
          @confirm="runPageAction(() => search())"
        />
        <view class="flex gap-3"
          ><button class="primary-button flex-1" @click="runPageAction(() => search())">
            搜索资料</button
          ><button class="flex-1" @click="runPageAction(() => resetSearch())">
            清空筛选
          </button></view
        >
      </view>
      <view v-if="!busy && !error && !items.length" class="empty-state"
        ><AppIcon name="search" :size="52" /><text>暂无符合条件的资料</text
        ><text>换个关键词，或看看其他分类。</text></view
      >
      <navigator
        v-for="item in items"
        :key="item.id"
        :url="'/pages/resources/detail?id=' + item.id"
        class="resource-card"
      >
        <text class="category-pill mint">{{ item.category.name }}</text>
        <text class="resource-title">{{ item.title }}</text>
        <text class="resource-text">{{ item.description_excerpt || '暂无简介' }}</text
        ><view class="card-footer"
          ><text class="ui-text">查看介绍与下载信息</text><AppIcon name="arrow" :size="30"
        /></view>
      </navigator>
      <button v-if="cursor" :disabled="busy" @click="runPageAction(() => search(true))">
        加载更多
      </button>
      <ResourceContribution :open="contribution" @close="contribution = false" />
    </template>
  </AppPage>
</template>
<style scoped>
.resource-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
