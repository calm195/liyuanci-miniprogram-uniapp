<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import WishPreview from '@/components/WishPreview.vue'
import StoryWall from '@/components/StoryWall.vue'
import ContentSearchBar from '@/components/ContentSearchBar.vue'
import type { ContentSort } from '@/types/content'
import { computed, ref, watch } from 'vue'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useWishStore } from '@/stores/wishes'
import { canMeAction, canWishAction } from '@/utils/actions'
import { canManageApplications } from '@/utils/application'
import { useHiddenWishes } from '@/composables/use-hidden-wishes'
import type { WishAction } from '@/utils/actions'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import {
  listWishes,
  createWish,
  updateWish,
  deleteWishDraft,
  submitWishReview,
  publishWish,
  getWish,
} from '@/api/wishes'
import { categories, campuses, rewards } from '@/types/wish'
import type { WishInput, WishResult, WishState } from '@/types/wish'
import { emptyWish, validateWish, wishStateLabels, publicWishBody } from '@/utils/wish'
const props = defineProps<{ mainTab?: boolean }>()
const user = useUserStore()
const { hidden } = useHiddenWishes()
const store = useWishStore()
const own = ref(false)
const wall = ref(false)
const storyWall = ref<{ refresh: () => Promise<void> } | null>(null)
const requestedEdit = ref('')
const category = ref<WishInput['category'] | ''>('')
const campus = ref<WishInput['campus'] | ''>('')
const state = ref<WishState | ''>('')
const keyword = ref('')
const sort = ref<ContentSort>('time')
const items = ref<WishResult[]>([])
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const editing = ref(false)
const editingId = ref<string>()
const editingWish = ref<WishResult | null>(null)
const writing = ref(false)
const listEpoch = ref(-1)
const listOwner = ref('')
let writeGeneration = 0
const canCreate = computed(() =>
  canMeAction(user.user, user.user?.id || '', 'postWishes', user.validated),
)
function allowed(wish: WishResult, action: WishAction) {
  return (
    own.value &&
    listEpoch.value === session.getEpoch() &&
    listOwner.value === user.user?.id &&
    items.value.includes(wish) &&
    canWishAction(user.user, user.validated, wish, wish.id, action)
  )
}
const form = ref(emptyWish())
let generation = 0
const visible = ref(false)
let composeRequested = false
let entryGeneration = 0
const rows = computed(() => {
  if (
    !config.useMock &&
    (listEpoch.value !== session.getEpoch() || (own.value && listOwner.value !== user.user?.id))
  )
    return []
  const list = config.useMock ? store.demoWishes : items.value
  return list.filter((wish) => {
    if (!own.value && (!publicWishBody(wish) || hidden.value.has(wish.id))) return false
    const content = own.value ? wish.own_content : wish.public
    return (
      (!category.value || content?.category === category.value) &&
      (!campus.value || content?.campus === campus.value) &&
      (!own.value || !state.value || wish.current_state === state.value)
    )
  })
})
async function load(more = false) {
  const current = ++generation
  const epoch = session.getEpoch()
  error.value = ''
  if (!more) cursor.value = null
  if (config.useMock) return
  if (own.value && !user.isLoggedIn) {
    error.value = '请先登录'
    return
  }
  busy.value = true
  try {
    const page = await listWishes(own.value, {
      ...(!own.value ? { keyword: keyword.value, sort: sort.value } : {}),
      ...(category.value ? { category: category.value } : {}),
      ...(campus.value ? { campus: campus.value } : {}),
      ...(own.value && state.value ? { state: state.value } : {}),
      ...(more && cursor.value ? { cursor: cursor.value } : {}),
    })
    if (!visible.value || current !== generation || epoch !== session.getEpoch()) return
    items.value = [
      ...(more ? items.value : []),
      ...page.items.filter((item) => !more || !items.value.some((old) => old.id === item.id)),
    ]
    cursor.value = page.next_cursor
    listEpoch.value = epoch
    listOwner.value = own.value ? user.user?.id || '' : ''
  } catch {
    if (visible.value && current === generation && epoch === session.getEpoch()) {
      items.value = []
      cursor.value = null
      error.value = '加载失败，请重试'
    }
  } finally {
    if (current === generation) busy.value = false
  }
}
async function search(value: string, order: ContentSort) {
  keyword.value = value
  sort.value = order
  items.value = []
  await load()
}
function tab(value: boolean) {
  if (writing.value) return
  own.value = value
  wall.value = false
  items.value = []
  state.value = ''
  return load()
}
function edit(wish?: WishResult) {
  if (writing.value) return
  if (!config.useMock && !(wish ? allowed(wish, 'putWishesIdContent') : canCreate.value)) return
  editing.value = true
  editingWish.value = wish || null
  editingId.value = wish?.id
  form.value = wish?.own_content ? { ...emptyWish(), ...wish.own_content } : emptyWish()
}
async function save() {
  error.value = validateWish(form.value)
  if (error.value) return
  try {
    if (!config.useMock) {
      if (!config.wishWritesReady || writing.value) return
      const wish = editingWish.value
      if (wish ? !allowed(wish, 'putWishesIdContent') : !canCreate.value) return
      await write(async (key) => {
        if (wish) await updateWish(wish, form.value, false, key)
        else await createWish(form.value, key)
      })
      return
    }
    store.save(form.value, editingId.value)
    editing.value = false
    own.value = true
    form.value = emptyWish()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '保存失败'
  }
}
async function act(
  wish: WishResult,
  action: 'submit' | 'approve' | 'reject' | 'publish' | 'delete',
) {
  error.value = ''
  try {
    if (!config.useMock) {
      if (!config.wishWritesReady || writing.value || action === 'approve' || action === 'reject')
        return
      const operation = {
        submit: 'postWishesIdSubmitReview',
        publish: 'postWishesIdPublish',
        delete: 'deleteWishesIdDraft',
      } as const
      if (!allowed(wish, operation[action])) return
      await write((key) =>
        action === 'submit'
          ? submitWishReview(wish, key)
          : action === 'publish'
            ? publishWish(wish, key)
            : deleteWishDraft(wish, key),
      )
      return
    }
    store.transition(wish.id, action)
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '操作失败'
  }
}
// 写入后或冲突后重新读投影；不会自动重放命令。
async function write(command: (key: string) => Promise<unknown>) {
  const current = generation
  const epoch = session.getEpoch()
  const writeId = ++writeGeneration
  const isCurrent = () =>
    visible.value &&
    current === generation &&
    epoch === session.getEpoch() &&
    writeId === writeGeneration
  writing.value = true
  try {
    await command(`wish-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    if (!isCurrent()) return
    uni.$emit?.('app:notice', { message: '心愿操作已受理，状态以最新查询为准。', kind: 'success' })
    cancelEdit()
    own.value = true
    await load()
  } catch (failure) {
    if (!isCurrent()) return
    cancelEdit()
    if (failure instanceof RequestError && (failure.statusCode || failure.code) === 409) {
      await load()
      if (visible.value && epoch === session.getEpoch() && writeId === writeGeneration)
        error.value = '心愿状态已变化，已重新读取，请确认后手动操作。'
    } else {
      items.value = []
      cursor.value = null
      error.value = '操作未完成，请刷新当前资格和心愿后重试。'
    }
  } finally {
    if (writeId === writeGeneration) writing.value = false
  }
}
function selectFormOption(
  kind: 'category' | 'campus' | 'reward_method',
  event: { detail: { value: string | number } },
) {
  const index = Number(event.detail.value)
  if (kind === 'category' && categories[index]) form.value.category = categories[index].value
  if (kind === 'campus' && campuses[index]) form.value.campus = campuses[index].value
  if (kind === 'reward_method' && rewards[index]) {
    form.value.reward_method = rewards[index].value
    if (form.value.reward_method !== 'custom') delete form.value.reward_text
  }
}
function cancelEdit() {
  editing.value = false
  editingWish.value = null
  editingId.value = undefined
  form.value = emptyWish()
}
function selectFilter(
  kind: 'category' | 'campus' | 'state',
  event: { detail: { value: string | number } },
) {
  if (writing.value) return
  const index = Number(event.detail.value) - 1
  if (kind === 'category') category.value = categories[index]?.value || ''
  if (kind === 'campus') campus.value = campuses[index]?.value || ''
  if (kind === 'state') state.value = (Object.keys(wishStateLabels)[index] as WishState) || ''
  items.value = []
  return load()
}
function clearProjection() {
  generation++
  writeGeneration++
  listEpoch.value = -1
  listOwner.value = ''
  writing.value = false
  editingId.value = undefined
  editingWish.value = null
  items.value = []
  cursor.value = null
  busy.value = false
  form.value = emptyWish()
  editing.value = false
}
function leave() {
  entryGeneration++
  visible.value = false
  clearProjection()
}
watch(() => user.user?.id, clearProjection, { flush: 'sync' })
function applyNavigationQuery(query: Record<string, string | undefined> | undefined) {
  // 导航参数仅选择视图，发布资格仍由最新账号动作判定。
  own.value = query?.own === '1'
  const selected = categories.find((item) => item.value === query?.category)
  category.value = selected?.value || ''
  const selectedState = query?.state
  state.value =
    own.value &&
    typeof selectedState === 'string' &&
    Object.prototype.hasOwnProperty.call(wishStateLabels, selectedState)
      ? (selectedState as WishState)
      : ''
  composeRequested = query?.compose === '1'
  requestedEdit.value = typeof query?.edit === 'string' ? query.edit : ''
}
async function show(query?: Record<string, string | undefined>) {
  if (query) applyNavigationQuery(query)
  visible.value = true
  const entry = ++entryGeneration
  const compose = composeRequested
  composeRequested = false
  if (!config.useMock) await user.refresh(false, true).catch(() => {})
  if (!visible.value || entry !== entryGeneration) return
  if (compose) {
    if (config.useMock || (config.wishWritesReady && canCreate.value)) {
      edit()
      return
    }
  }
  await load()
  if (!visible.value || entry !== entryGeneration) return
  if (requestedEdit.value) {
    const editId = requestedEdit.value
    requestedEdit.value = ''
    try {
      const target = await getWish(editId)
      if (!visible.value || entry !== entryGeneration) return
      if (!items.value.some((item) => item.id === target.id)) items.value.unshift(target)
      edit(target)
    } catch {
      error.value = '当前心愿不可编辑，请下拉更新状态。'
    }
    return
  }
  if (compose) error.value = '登录并通过学生认证后，才可以许愿。若已认证，请刷新资格后重试。'
}
async function refresh() {
  try {
    if (wall.value) await storyWall.value?.refresh()
    else if (editing.value) {
      // 编辑期间保留当前目标与草稿，保存仍由原始对象版本保护并发更新。
      if (!config.useMock) await user.refresh(false, true)
    } else await load()
  } finally {
    uni.stopPullDownRefresh()
  }
}
defineExpose({ show, leave, refresh })
</script>
<template>
  <AppPage :tab="props.mainTab ? 'pond' : undefined" :title="props.mainTab ? '心愿池' : undefined">
    <view class="module-hero">
      <image src="/static/illustrations/pavilion.png" class="module-art" mode="aspectFit" />
      <text class="module-title">捞一捞，心愿有回响</text>
      <text class="module-subtitle">投一枚心愿，也做一次别人的锦鲤。</text>
    </view>
    <text v-if="config.useMock" class="notice">合成演示 · 仅填写虚构内容，不发送 API</text>
    <view v-if="!editing" class="segment-tabs">
      <button
        :class="{ selected: !own && !wall }"
        :disabled="writing"
        :loading="isPageActionPending('pages-wishes-index-button-1')"
        @click="runPageAction(() => tab(false), 'pages-wishes-index-button-1')"
      >
        心愿广场
      </button>
      <button
        :class="{ selected: wall }"
        :loading="isPageActionPending('src-pages-wishes-index.vue-action-2')"
        @click="
          runPageAction(() => {
            wall = true
          }, 'src-pages-wishes-index.vue-action-2')
        "
      >
        还愿墙
      </button>
      <button
        :class="{ selected: own && !wall }"
        :disabled="writing"
        :loading="isPageActionPending('pages-wishes-index-button-2')"
        @click="runPageAction(() => tab(true), 'pages-wishes-index-button-2')"
      >
        我的心愿
      </button>
    </view>
    <StoryWall v-if="wall && visible" ref="storyWall" />
    <AppNotice :message="!wall ? error : ''" kind="error" />
    <view v-if="!wall && (!user.isLoggedIn || !canCreate)" class="qualification-links">
      <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
      <navigator v-else url="/pages/verification/index">查看学生认证</navigator>
    </view>
    <view v-if="editing && !wall" class="card">
      <input v-model="form.title" placeholder="给心愿起个标题（最多40个字）" :maxlength="40" />
      <picker
        :range="categories.map((item) => item.label)"
        :value="categories.findIndex((item) => item.value === form.category)"
        @change="runPageAction(() => selectFormOption('category', $event))"
        ><view
          >分类：{{ categories.find((item) => item.value === form.category)?.label }}</view
        ></picker
      >
      <picker
        :range="campuses.map((item) => item.label)"
        :value="campuses.findIndex((item) => item.value === form.campus)"
        @change="runPageAction(() => selectFormOption('campus', $event))"
        ><view>校区：{{ campuses.find((item) => item.value === form.campus)?.label }}</view></picker
      >
      <textarea
        v-model="form.body"
        placeholder-class="field-placeholder"
        :maxlength="-1"
        placeholder="写下你的文字心愿（最多 500 个字）"
      />
      <text>{{ Array.from(form.body).length }}/500</text>
      <picker
        :range="rewards.map((item) => item.label)"
        :value="rewards.findIndex((item) => item.value === form.reward_method)"
        @change="runPageAction(() => selectFormOption('reward_method', $event))"
        ><view
          >报答：{{ rewards.find((item) => item.value === form.reward_method)?.label }}</view
        ></picker
      >
      <input
        v-if="form.reward_method === 'custom'"
        v-model="form.reward_text"
        :maxlength="100"
        placeholder="想怎样表达感谢？"
      />
      <text>有效期（1 至 30 天，默认 7 天）</text
      ><input
        v-model.number="form.duration_days"
        placeholder-class="field-placeholder"
        type="number"
      />
      <button
        :disabled="writing || (!config.useMock && !config.wishWritesReady)"
        :loading="isPageActionPending('pages-wishes-index-button-3')"
        @click="runPageAction(() => save(), 'pages-wishes-index-button-3')"
      >
        {{ config.useMock ? '保存合成草稿' : '保存草稿' }}</button
      ><button
        :disabled="writing"
        :loading="isPageActionPending('pages-wishes-index-button-4')"
        @click="runPageAction(() => cancelEdit(), 'pages-wishes-index-button-4')"
      >
        取消
      </button>
    </view>

    <view v-else-if="!wall">
      <ContentSearchBar
        v-if="!own && !config.useMock"
        :keyword="keyword"
        :sort="sort"
        support-sort
        :disabled="busy || writing"
        @search="search"
      />
      <scroll-view class="chip-scroll" scroll-x :show-scrollbar="false">
        <button
          class="filter-chip"
          :class="{ selected: !category }"
          :disabled="writing"
          :loading="isPageActionPending('pages-wishes-index-button-5')"
          @click="
            runPageAction(
              () => selectFilter('category', { detail: { value: 0 } }),
              'pages-wishes-index-button-5',
            )
          "
        >
          全部
        </button>
        <button
          v-for="(item, index) in categories"
          :key="item.value"
          class="filter-chip"
          :class="{ selected: category === item.value }"
          :disabled="writing"
          :loading="isPageActionPending('pages-wishes-index-button-6' + ':' + item.value)"
          @click="
            runPageAction(
              () => selectFilter('category', { detail: { value: index + 1 } }),
              'pages-wishes-index-button-6' + ':' + item.value,
            )
          "
        >
          {{ item.label }}
        </button>
      </scroll-view>
      <view class="filter-row">
        <picker
          :range="['全部校区', ...campuses.map((item) => item.label)]"
          :value="campuses.findIndex((item) => item.value === campus) + 1"
          :disabled="writing"
          @change="runPageAction(() => selectFilter('campus', $event))"
          ><view
            >{{ campuses.find((item) => item.value === campus)?.label || '全部校区' }} ▾</view
          ></picker
        >
        <picker
          v-if="own"
          :range="['全部状态', ...Object.values(wishStateLabels)]"
          :value="Object.keys(wishStateLabels).indexOf(state) + 1"
          :disabled="writing"
          @change="runPageAction(() => selectFilter('state', $event))"
          ><view>{{ state ? wishStateLabels[state] : '全部状态' }} ▾</view></picker
        >
      </view>
      <text v-if="busy && !rows.length" class="page-footnote">正在加载心愿…</text>
      <view v-if="!busy && !error && !rows.length" class="empty-state"
        ><text>暂时没有符合条件的心愿</text><text>换个分类看看，或写下自己的期待。</text></view
      >
      <view v-for="wish in rows" :key="wish.id" :class="{ card: own }">
        <WishPreview :wish="wish" :own="own" @support-change="sort === 'support' && load()" />
        <text v-if="own && wish.review_result?.reason"
          >驳回原因：{{ wish.review_result.reason }}</text
        >
        <text v-if="own && wish.review_result?.revision_suggestion"
          >修改建议：{{ wish.review_result.revision_suggestion }}</text
        >
        <navigator
          v-if="own && !config.useMock && canManageApplications(user.user, user.validated, wish)"
          class="application-queue-link"
          :url="`/pages/applications/index?wishId=${encodeURIComponent(wish.id)}`"
        >
          <text>查看应愿申请 ›</text>
          <text v-if="wish.unread_application_count" class="category-pill">
            {{ wish.unread_application_count }} 个新申请
          </text>
        </navigator>
        <view v-if="!config.useMock && own" class="wish-actions">
          <button
            v-if="allowed(wish, 'deleteWishesIdDraft')"
            :disabled="!config.wishWritesReady || writing"
            :loading="isPageActionPending('pages-wishes-index-button-9' + ':' + wish.id)"
            @click="
              runPageAction(
                () => act(wish, 'delete'),
                'pages-wishes-index-button-9' + ':' + wish.id,
              )
            "
          >
            删除草稿
          </button>
          <button
            v-if="allowed(wish, 'postWishesIdSubmitReview')"
            :disabled="!config.wishWritesReady || writing"
            :loading="isPageActionPending('pages-wishes-index-button-10' + ':' + wish.id)"
            @click="
              runPageAction(
                () => act(wish, 'submit'),
                'pages-wishes-index-button-10' + ':' + wish.id,
              )
            "
          >
            提交审核
          </button>
          <button
            v-if="allowed(wish, 'postWishesIdPublish')"
            :disabled="!config.wishWritesReady || writing"
            :loading="isPageActionPending('pages-wishes-index-button-11' + ':' + wish.id)"
            @click="
              runPageAction(
                () => act(wish, 'publish'),
                'pages-wishes-index-button-11' + ':' + wish.id,
              )
            "
          >
            上架
          </button>
        </view>
        <view v-if="config.useMock && own" class="wish-actions">
          <button
            v-if="['draft', 'rejected'].includes(wish.current_state)"
            :loading="isPageActionPending('pages-wishes-index-button-13' + ':' + wish.id)"
            @click="
              runPageAction(
                () => act(wish, 'submit'),
                'pages-wishes-index-button-13' + ':' + wish.id,
              )
            "
          >
            提交合成审核
          </button>
          <button
            v-if="wish.current_state === 'draft'"
            :loading="isPageActionPending('pages-wishes-index-button-14' + ':' + wish.id)"
            @click="
              runPageAction(
                () => act(wish, 'delete'),
                'pages-wishes-index-button-14' + ':' + wish.id,
              )
            "
          >
            删除草稿
          </button>
          <button
            v-if="wish.current_state === 'pending_review'"
            :loading="isPageActionPending('pages-wishes-index-button-15' + ':' + wish.id)"
            @click="
              runPageAction(
                () => act(wish, 'approve'),
                'pages-wishes-index-button-15' + ':' + wish.id,
              )
            "
          >
            演示：审核通过
          </button>
          <button
            v-if="wish.current_state === 'pending_review'"
            :loading="isPageActionPending('pages-wishes-index-button-16' + ':' + wish.id)"
            @click="
              runPageAction(
                () => act(wish, 'reject'),
                'pages-wishes-index-button-16' + ':' + wish.id,
              )
            "
          >
            演示：审核驳回
          </button>
          <button
            v-if="wish.current_state === 'ready'"
            :loading="isPageActionPending('pages-wishes-index-button-17' + ':' + wish.id)"
            @click="
              runPageAction(
                () => act(wish, 'publish'),
                'pages-wishes-index-button-17' + ':' + wish.id,
              )
            "
          >
            合成上架
          </button>
        </view>
      </view>

      <button
        v-if="!config.useMock && cursor"
        :disabled="busy || writing"
        :loading="isPageActionPending('pages-wishes-index-button-18')"
        @click="runPageAction(() => load(true), 'pages-wishes-index-button-18')"
      >
        加载更多
      </button>
      <button
        v-if="config.useMock || (config.wishWritesReady && canCreate)"
        class="floating-compose"
        :disabled="writing"
        :loading="isPageActionPending('pages-wishes-index-button-19')"
        @click="runPageAction(() => edit(), 'pages-wishes-index-button-19')"
      >
        ＋ 许个心愿
      </button>
      <navigator
        v-else
        :url="user.isLoggedIn ? '/pages/verification/index' : '/pages/login/index'"
        class="floating-compose"
        >{{ user.isLoggedIn ? '认证后许愿' : '登录后许愿' }}</navigator
      >
    </view>
  </AppPage>
</template>

<style scoped>
.application-queue-link {
  display: flex;
  align-items: center;
  gap: 16rpx;
  color: var(--theme-teal);
  margin-top: 16rpx;
}

.wish-actions {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}
.wish-actions button {
  flex: 1;
  margin: 0;
  font-size: 26rpx;
}
</style>
