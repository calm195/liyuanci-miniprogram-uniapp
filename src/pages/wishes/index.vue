<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import WishPreview from '@/components/WishPreview.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useWishStore } from '@/stores/wishes'
import { canMeAction, canWishAction } from '@/utils/actions'
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
} from '@/api/wishes'
import { categories, campuses, rewards, genders } from '@/types/wish'
import type { WishInput, WishResult, WishState } from '@/types/wish'
import { emptyWish, validateWish, wishStateLabels, publicWishBody } from '@/utils/wish'
const user = useUserStore()
const store = useWishStore()
const own = ref(false)
const category = ref<WishInput['category'] | ''>('')
const campus = ref<WishInput['campus'] | ''>('')
const state = ref<WishState | ''>('')
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
let visible = false
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
    if (!own.value && !publicWishBody(wish)) return false
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
  if (!more) {
    items.value = []
    cursor.value = null
  }
  if (config.useMock) return
  if (own.value && !user.isLoggedIn) {
    error.value = '请先登录'
    return
  }
  busy.value = true
  try {
    const page = await listWishes(own.value, {
      ...(category.value ? { category: category.value } : {}),
      ...(campus.value ? { campus: campus.value } : {}),
      ...(own.value && state.value ? { state: state.value } : {}),
      ...(more && cursor.value ? { cursor: cursor.value } : {}),
    })
    if (!visible || current !== generation || epoch !== session.getEpoch()) return
    items.value = [
      ...(more ? items.value : []),
      ...page.items.filter((item) => !more || !items.value.some((old) => old.id === item.id)),
    ]
    cursor.value = page.next_cursor
    listEpoch.value = epoch
    listOwner.value = own.value ? user.user?.id || '' : ''
  } catch {
    if (visible && current === generation && epoch === session.getEpoch()) {
      items.value = []
      cursor.value = null
      error.value = '加载失败，请重试'
    }
  } finally {
    if (current === generation) busy.value = false
  }
}
function tab(value: boolean) {
  if (writing.value) return
  own.value = value
  state.value = ''
  void load()
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
      // 标签更新的省略与清除尚未冻结，只编排明确无标签的改版。
      if (wish && (wish.own_content?.identity_tags || form.value.identity_tags))
        throw new Error('身份标签更新规则尚未就绪，暂不能改版')
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
    visible && current === generation && epoch === session.getEpoch() && writeId === writeGeneration
  writing.value = true
  try {
    await command(`wish-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    if (!isCurrent()) return
    cancelEdit()
    own.value = true
    await load()
  } catch (failure) {
    if (!isCurrent()) return
    cancelEdit()
    if (failure instanceof RequestError && (failure.statusCode || failure.code) === 409) {
      await load()
      if (visible && epoch === session.getEpoch() && writeId === writeGeneration)
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
function selectGender(event: { detail: { value: string | number } }) {
  if (editingId.value) return
  const gender = genders[Number(event.detail.value) - 1]?.value
  form.value = { ...form.value }
  const tags = { ...form.value.identity_tags }
  if (gender) tags.gender = gender
  else delete tags.gender
  if (Object.keys(tags).length) form.value.identity_tags = tags
  else delete form.value.identity_tags
}
function selectIdentityCampus(event: { detail: { value: string | number } }) {
  if (editingId.value) return
  const campus = campuses[Number(event.detail.value) - 1]?.value
  const tags = { ...form.value.identity_tags }
  if (campus) tags.campus = campus
  else delete tags.campus
  form.value = { ...form.value }
  if (Object.keys(tags).length) form.value.identity_tags = tags
  else delete form.value.identity_tags
}
function selectFormOption(
  kind: 'category' | 'campus' | 'reward_method',
  event: { detail: { value: string | number } },
) {
  const index = Number(event.detail.value)
  if (kind === 'category' && categories[index]) form.value.category = categories[index].value
  if (kind === 'campus' && campuses[index]) form.value.campus = campuses[index].value
  if (kind === 'reward_method' && rewards[index]) form.value.reward_method = rewards[index].value
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
  void load()
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
  visible = false
  clearProjection()
}
watch(() => user.user?.id, clearProjection, { flush: 'sync' })
onLoad((query) => {
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
})
onShow(async () => {
  visible = true
  const entry = ++entryGeneration
  const compose = composeRequested
  composeRequested = false
  if (!config.useMock) await user.refresh().catch(() => {})
  if (!visible || entry !== entryGeneration) return
  await load()
  if (!visible || entry !== entryGeneration || !compose) return
  if (config.useMock || (config.wishWritesReady && canCreate.value)) edit()
  else error.value = '登录并通过学生认证后，才可以许愿。若已认证，请刷新资格后重试。'
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <AppPage tab="pond" title="心愿池">
    <view class="module-hero">
      <image src="/static/illustrations/pavilion.png" class="module-art" mode="aspectFit" />
      <text class="module-title">捞一捞，心愿有回响</text>
      <text class="module-subtitle">投一枚心愿，也做一次别人的锦鲤。</text>
    </view>
    <text v-if="config.useMock" class="notice">合成演示 · 仅填写虚构内容，不发送 API</text>
    <view v-if="!editing" class="segment-tabs">
      <button
        :class="{ selected: !own }"
        :disabled="writing"
        @click="runPageAction(() => tab(false))"
      >
        心愿广场
      </button>
      <navigator url="/pages/stories/index">还愿墙</navigator>
      <button
        :class="{ selected: own }"
        :disabled="writing"
        @click="runPageAction(() => tab(true))"
      >
        我的心愿
      </button>
    </view>
    <view v-if="error" class="notice"
      ><text>{{ error }}</text
      ><navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator
      ><navigator v-else-if="!canCreate" url="/pages/verification/index"
        >查看学生认证</navigator
      ></view
    >
    <view v-if="editing" class="card">
      <picker
        :range="categories.map((item) => item.label)"
        @change="runPageAction(() => selectFormOption('category', $event))"
        ><view
          >分类：{{ categories.find((item) => item.value === form.category)?.label }}</view
        ></picker
      >
      <picker
        :range="campuses.map((item) => item.label)"
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
        @change="runPageAction(() => selectFormOption('reward_method', $event))"
        ><view
          >报答：{{ rewards.find((item) => item.value === form.reward_method)?.label }}</view
        ></picker
      >
      <text>有效期（1 至 30 天，默认 7 天）</text
      ><input
        v-model.number="form.duration_days"
        placeholder-class="field-placeholder"
        type="number"
      />
      <picker
        v-if="!editingId"
        :range="['未填写', ...genders.map((item) => item.label)]"
        @change="runPageAction(() => selectGender($event))"
      >
        <view
          >性别标签（可选）：{{
            genders.find((item) => item.value === form.identity_tags?.gender)?.label || '未填写'
          }}</view
        >
      </picker>
      <picker
        v-if="!editingId"
        :range="['未填写', ...campuses.map((item) => item.label)]"
        @change="runPageAction(() => selectIdentityCampus($event))"
      >
        <view
          >身份校区标签（可选）：{{
            campuses.find((item) => item.value === form.identity_tags?.campus)?.label || '未填写'
          }}</view
        >
      </picker>
      <text>身份标签可不填写。</text>
      <button
        :disabled="writing || (!config.useMock && !config.wishWritesReady)"
        @click="runPageAction(() => save())"
      >
        {{ config.useMock ? '保存合成草稿' : '保存草稿' }}</button
      ><button :disabled="writing" @click="runPageAction(() => cancelEdit())">取消</button>
    </view>

    <view v-else>
      <scroll-view class="chip-scroll" scroll-x :show-scrollbar="false">
        <button
          class="filter-chip"
          :class="{ selected: !category }"
          :disabled="writing"
          @click="runPageAction(() => selectFilter('category', { detail: { value: 0 } }))"
        >
          全部
        </button>
        <button
          v-for="(item, index) in categories"
          :key="item.value"
          class="filter-chip"
          :class="{ selected: category === item.value }"
          :disabled="writing"
          @click="runPageAction(() => selectFilter('category', { detail: { value: index + 1 } }))"
        >
          {{ item.label }}
        </button>
      </scroll-view>
      <view class="filter-row">
        <picker
          :range="['全部校区', ...campuses.map((item) => item.label)]"
          :disabled="writing"
          @change="runPageAction(() => selectFilter('campus', $event))"
          ><view
            >{{ campuses.find((item) => item.value === campus)?.label || '全部校区' }} ▾</view
          ></picker
        >
        <picker
          v-if="own"
          :range="['全部状态', ...Object.values(wishStateLabels)]"
          :disabled="writing"
          @change="runPageAction(() => selectFilter('state', $event))"
          ><view>{{ state ? wishStateLabels[state] : '全部状态' }} ▾</view></picker
        >
        <button class="small-link" :disabled="busy || writing" @click="runPageAction(() => load())">
          {{ busy ? '加载中…' : '刷新心愿' }}
        </button>
      </view>
      <view v-if="!busy && !error && !rows.length" class="empty-state"
        ><text>暂时没有符合条件的心愿</text><text>换个分类看看，或写下自己的期待。</text></view
      >
      <view v-for="wish in rows" :key="wish.id" :class="{ card: own }">
        <WishPreview :wish="wish" :own="own" />
        <text v-if="own && wish.review_result?.reason"
          >驳回原因：{{ wish.review_result.reason }}</text
        >
        <text v-if="own && wish.review_result?.revision_suggestion"
          >修改建议：{{ wish.review_result.revision_suggestion }}</text
        >
        <view v-if="!config.useMock && own">
          <button
            :disabled="!config.wishWritesReady || writing || !allowed(wish, 'putWishesIdContent')"
            @click="runPageAction(() => edit(wish))"
          >
            编辑
          </button>
          <button
            :disabled="!config.wishWritesReady || writing || !allowed(wish, 'deleteWishesIdDraft')"
            @click="runPageAction(() => act(wish, 'delete'))"
          >
            删除草稿
          </button>
          <button
            :disabled="
              !config.wishWritesReady || writing || !allowed(wish, 'postWishesIdSubmitReview')
            "
            @click="runPageAction(() => act(wish, 'submit'))"
          >
            提交审核
          </button>
          <button
            :disabled="!config.wishWritesReady || writing || !allowed(wish, 'postWishesIdPublish')"
            @click="runPageAction(() => act(wish, 'publish'))"
          >
            上架
          </button>
        </view>
        <view v-if="config.useMock && own">
          <button
            v-if="['draft', 'rejected'].includes(wish.current_state)"
            @click="runPageAction(() => edit(wish))"
          >
            编辑
          </button>
          <button
            v-if="['draft', 'rejected'].includes(wish.current_state)"
            @click="runPageAction(() => act(wish, 'submit'))"
          >
            提交合成审核
          </button>
          <button
            v-if="wish.current_state === 'draft'"
            @click="runPageAction(() => act(wish, 'delete'))"
          >
            删除草稿
          </button>
          <button
            v-if="wish.current_state === 'pending_review'"
            @click="runPageAction(() => act(wish, 'approve'))"
          >
            演示：审核通过
          </button>
          <button
            v-if="wish.current_state === 'pending_review'"
            @click="runPageAction(() => act(wish, 'reject'))"
          >
            演示：审核驳回
          </button>
          <button
            v-if="wish.current_state === 'ready'"
            @click="runPageAction(() => act(wish, 'publish'))"
          >
            合成上架
          </button>
        </view>
      </view>

      <button
        v-if="!config.useMock && cursor"
        :disabled="busy || writing"
        @click="runPageAction(() => load(true))"
      >
        加载更多
      </button>
      <button
        v-if="config.useMock || (config.wishWritesReady && canCreate)"
        class="floating-compose"
        :disabled="writing"
        @click="runPageAction(() => edit())"
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
