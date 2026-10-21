<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useWishStore } from '@/stores/wishes'
import { listWishes } from '@/api/wishes'
import { categories, campuses, rewards } from '@/types/wish'
import type { WishInput, WishResult, WishState } from '@/types/wish'
import { emptyWish, validateWish, wishStateLabels, publicWishBody, ownWishBody } from '@/utils/wish'
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
const form = ref(emptyWish())
let generation = 0
let visible = false
const rows = computed(() => {
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
    if (!visible || current !== generation) return
    items.value = [
      ...(more ? items.value : []),
      ...page.items.filter((item) => !more || !items.value.some((old) => old.id === item.id)),
    ]
    cursor.value = page.next_cursor
  } catch {
    if (current === generation) {
      items.value = []
      cursor.value = null
      error.value = '加载失败，请重试'
    }
  } finally {
    if (current === generation) busy.value = false
  }
}
function tab(value: boolean) {
  own.value = value
  state.value = ''
  void load()
}
function edit(wish?: WishResult) {
  if (!config.useMock) return
  editing.value = true
  editingId.value = wish?.id
  form.value = wish?.own_content ? { ...wish.own_content } : emptyWish()
}
function save() {
  error.value = validateWish(form.value)
  if (error.value) return
  try {
    store.save(form.value, editingId.value)
    editing.value = false
    own.value = true
    form.value = emptyWish()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '保存失败'
  }
}
function act(wish: WishResult, action: 'submit' | 'approve' | 'reject' | 'publish' | 'delete') {
  error.value = ''
  try {
    store.transition(wish.id, action)
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '操作失败'
  }
}
function cancelEdit() {
  editing.value = false
  form.value = emptyWish()
}
function selectFilter(
  kind: 'category' | 'campus' | 'state',
  event: { detail: { value: string | number } },
) {
  const index = Number(event.detail.value) - 1
  if (kind === 'category') category.value = categories[index]?.value || ''
  if (kind === 'campus') campus.value = campuses[index]?.value || ''
  if (kind === 'state') state.value = (Object.keys(wishStateLabels)[index] as WishState) || ''
  void load()
}
function leave() {
  visible = false
  generation++
  items.value = []
  cursor.value = null
  busy.value = false
  form.value = emptyWish()
  editing.value = false
}
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <view class="page">
    <text class="title">文字心愿</text>
    <text v-if="config.useMock" class="notice"
      >合成演示 · 仅填写虚构内容，不发送 API，不代表真实审核或上架</text
    >
    <view class="tabs"
      ><button @click="tab(false)">心愿广场</button
      ><button @click="tab(true)">我的心愿</button></view
    >
    <button v-if="config.useMock" @click="edit()">写一条合成心愿</button>
    <text v-else>真实写入待服务与动作授权契约联调；当前提供列表查询。</text>
    <view v-if="editing" class="card">
      <picker
        :range="categories.map((item) => item.label)"
        @change="form.category = categories[Number($event.detail.value)]!.value"
        ><view
          >分类：{{ categories.find((item) => item.value === form.category)?.label }}</view
        ></picker
      >
      <picker
        :range="campuses.map((item) => item.label)"
        @change="form.campus = campuses[Number($event.detail.value)]!.value"
        ><view>校区：{{ campuses.find((item) => item.value === form.campus)?.label }}</view></picker
      >
      <textarea
        v-model="form.body"
        :maxlength="-1"
        placeholder="写下你的文字心愿（最多 500 个字）"
      />
      <text>{{ Array.from(form.body).length }}/500</text>
      <picker
        :range="rewards.map((item) => item.label)"
        @change="form.reward_method = rewards[Number($event.detail.value)]!.value"
        ><view
          >报答：{{ rewards.find((item) => item.value === form.reward_method)?.label }}</view
        ></picker
      >
      <text>有效期（1 至 30 天，默认 7 天）</text
      ><input v-model.number="form.duration_days" type="number" />
      <button @click="save">保存合成草稿</button><button @click="cancelEdit">取消</button>
    </view>
    <view v-else class="filters">
      <picker
        :range="['全部分类', ...categories.map((item) => item.label)]"
        @change="selectFilter('category', $event)"
        ><view
          >分类：{{ categories.find((item) => item.value === category)?.label || '全部' }}</view
        ></picker
      >
      <picker
        :range="['全部校区', ...campuses.map((item) => item.label)]"
        @change="selectFilter('campus', $event)"
        ><view
          >校区：{{ campuses.find((item) => item.value === campus)?.label || '全部' }}</view
        ></picker
      >
      <picker
        v-if="own"
        :range="['全部状态', ...Object.values(wishStateLabels)]"
        @change="selectFilter('state', $event)"
        ><view>状态：{{ state ? wishStateLabels[state] : '全部' }}</view></picker
      >
      <button :disabled="busy" @click="load()">刷新</button>
      <text v-if="busy">加载中…</text><text v-if="!busy && !rows.length">暂无符合条件的心愿</text>
      <view v-for="wish in rows" :key="wish.id" class="card">
        <text>{{ wishStateLabels[wish.current_state] }}</text>
        <text v-if="wish.privacy_review_required">内容暂不可查看</text>
        <text v-else>{{ own ? ownWishBody(wish) : publicWishBody(wish) }}</text>
        <text v-if="wish.public?.school_related">未经证实</text>
        <text v-if="own && wish.review_result?.reason"
          >驳回原因：{{ wish.review_result.reason }}</text
        >
        <text v-if="own && wish.review_result?.revision_suggestion"
          >修改建议：{{ wish.review_result.revision_suggestion }}</text
        >
        <view v-if="config.useMock && own">
          <button v-if="['draft', 'rejected'].includes(wish.current_state)" @click="edit(wish)">
            编辑
          </button>
          <button
            v-if="['draft', 'rejected'].includes(wish.current_state)"
            @click="act(wish, 'submit')"
          >
            提交合成审核
          </button>
          <button v-if="wish.current_state === 'draft'" @click="act(wish, 'delete')">
            删除草稿
          </button>
          <button v-if="wish.current_state === 'pending_review'" @click="act(wish, 'approve')">
            演示：审核通过
          </button>
          <button v-if="wish.current_state === 'pending_review'" @click="act(wish, 'reject')">
            演示：审核驳回
          </button>
          <button v-if="wish.current_state === 'ready'" @click="act(wish, 'publish')">
            合成上架
          </button>
        </view>
      </view>
      <button v-if="!config.useMock && cursor" :disabled="busy" @click="load(true)">
        加载下一页
      </button>
    </view>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>
<style scoped>
.page {
  padding: 32rpx;
}
.title {
  font-size: 40rpx;
  font-weight: bold;
}
.notice {
  background: #fff1cc;
  padding: 20rpx;
}
.card {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: white;
}
text {
  display: block;
  margin-bottom: 20rpx;
}
button,
picker {
  margin-top: 16rpx;
}
textarea {
  width: 100%;
  padding: 24rpx 0;
}
input {
  padding: 20rpx 0;
}
.error {
  color: #b42318;
}
.filters {
  padding-top: 20rpx;
}
</style>
