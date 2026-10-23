<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { getWish } from '@/api/wishes'
import {
  listMyApplications,
  listWishApplications,
  applyToWish,
  withdrawApplication,
  acceptApplication,
} from '@/api/applications'
import { applicationStatusLabels } from '@/types/application'
import type { ApplicationStatus, WishApplication } from '@/types/application'
import type { WishResult } from '@/types/wish'
import {
  applicationMessageError,
  canApplyToWish,
  canManageApplications,
  canAcceptApplication,
  canWithdrawApplication,
} from '@/utils/application'
import { wishStateLabels } from '@/utils/wish'

const user = useUserStore()
const wishId = ref('')
const wish = ref<WishResult | null>(null)
const items = ref<WishApplication[]>([])
const cursor = ref<string | null>(null)
const status = ref<ApplicationStatus | ''>('')
const message = ref('')
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const notice = ref('')
const readEpoch = ref(-1)
const readOwner = ref('')
let generation = 0
let writeGeneration = 0
let visible = false
const scoped = computed(
  () =>
    readEpoch.value === session.getEpoch() && readOwner.value === user.user?.id && user.validated,
)
const currentWish = computed(() => (scoped.value ? wish.value : null))
const ownerMode = computed(() => !!wishId.value && !!currentWish.value?.own_content)
const rows = computed(() => (scoped.value ? items.value : []))
const mayApply = computed(
  () =>
    scoped.value &&
    !config.useMock &&
    config.wishWritesReady &&
    canApplyToWish(user.user, user.validated, currentWish.value),
)
function clearProjection() {
  wish.value = null
  items.value = []
  cursor.value = null
  readEpoch.value = -1
  readOwner.value = ''
  message.value = ''
}
async function load(more = false) {
  if (more && (!scoped.value || !cursor.value || busy.value)) return
  const current = ++generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const isCurrent = () =>
    visible && current === generation && epoch === session.getEpoch() && owner === user.user?.id
  const nextCursor = more ? cursor.value! : undefined
  if (!more) clearProjection()
  error.value = ''
  if (config.useMock) {
    error.value = '应愿功能需连接真实服务，请关闭合成演示模式后使用。'
    return
  }
  if (!session.getToken() || !owner) {
    error.value = '请先登录后查看应愿申请。'
    return
  }
  busy.value = true
  try {
    await user.refresh(false)
    if (!isCurrent()) return
    const target = wishId.value ? await getWish(wishId.value) : null
    if (!isCurrent()) return
    if (target && target.id !== wishId.value) throw new Error('心愿目标不匹配')
    const owned = !!target?.own_content
    const page = !wishId.value
      ? await listMyApplications({
          ...(status.value ? { status: status.value } : {}),
          cursor: nextCursor,
        })
      : owned && canManageApplications(user.user, user.validated, target)
        ? await listWishApplications(wishId.value, nextCursor)
        : { items: [], next_cursor: null }
    if (!isCurrent()) return
    // 许愿人只显示同一心愿的已审有效申请，拒绝将待审或其他目标混入列表。
    const incoming = owned
      ? page.items.filter((item) => item.wish_id === wishId.value && item.status === 'active')
      : page.items
    wish.value = target
    items.value = [
      ...(more ? items.value : []),
      ...incoming.filter((item) => !more || !items.value.some((old) => old.id === item.id)),
    ]
    cursor.value = page.next_cursor
    readEpoch.value = epoch
    readOwner.value = owner
  } catch (failure) {
    if (!isCurrent()) return
    clearProjection()
    error.value =
      failure instanceof RequestError && failure.statusCode === 404
        ? '心愿不存在或当前不可查看。'
        : '申请读取失败，请刷新当前资格后重试。'
  } finally {
    if (visible && current === generation) busy.value = false
  }
}
function mayAccept(application: WishApplication) {
  return (
    !config.useMock &&
    config.wishWritesReady &&
    ownerMode.value &&
    items.value.includes(application) &&
    canAcceptApplication(user.user, user.validated, currentWish.value, application)
  )
}
function mayWithdraw(application: WishApplication) {
  return (
    !config.useMock &&
    config.wishWritesReady &&
    !wishId.value &&
    scoped.value &&
    items.value.includes(application) &&
    canWithdrawApplication(user.user, user.validated, application)
  )
}
function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) =>
    uni.showModal({
      title: '确认操作',
      content: message,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  )
}
// 写入只使用当前读取的精确对象；确认期间换页、换账号或版本变化都放弃旧操作。
async function write(
  authorized: () => boolean,
  command: (key: string) => Promise<unknown>,
  success: string,
  confirmation?: string,
) {
  if (busy.value || writing.value || !authorized()) return
  const current = generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const writeId = ++writeGeneration
  const isCurrent = () =>
    visible &&
    current === generation &&
    epoch === session.getEpoch() &&
    owner === user.user?.id &&
    writeId === writeGeneration
  writing.value = true
  error.value = ''
  notice.value = ''
  try {
    if (confirmation && !(await confirm(confirmation))) return
    if (!isCurrent() || !authorized()) return
    await command(`application-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    if (!isCurrent()) return
    await load()
    if (visible && epoch === session.getEpoch() && writeId === writeGeneration)
      notice.value = success
  } catch (failure) {
    if (!isCurrent()) return
    clearProjection()
    if (failure instanceof RequestError && failure.statusCode === 409) {
      await load()
      if (visible && epoch === session.getEpoch() && writeId === writeGeneration)
        notice.value = '心愿或申请状态已变化，已重新读取，请确认后手动操作。'
    } else error.value = '操作未完成，请刷新当前资格与申请后重试。'
  } finally {
    if (writeId === writeGeneration) writing.value = false
  }
}
async function submit() {
  error.value = applicationMessageError(message.value)
  if (error.value || !mayApply.value) return
  const target = currentWish.value!
  const input = message.value
  await write(
    () => mayApply.value && currentWish.value === target,
    (key) => applyToWish(target.id, target.content_version!, input, key),
    '申请已受理，留言审核后才会交给许愿人。可在“我的应愿”查看处理状态。',
  )
}
async function accept(application: WishApplication) {
  const target = currentWish.value
  if (!target) return
  await write(
    () => currentWish.value === target && mayAccept(application),
    (key) => acceptApplication(application, target.version, key),
    '已确定应愿人，请查看心愿的最新状态。',
    '确定后将建立唯一匹配，其他未终结申请会失效。是否选择这位应愿人？',
  )
}
async function withdraw(application: WishApplication) {
  await write(
    () => mayWithdraw(application),
    (key) => withdrawApplication(application, key),
    '申请已撤销。',
    '是否撤销这条应愿申请？撤销后旧审核不会恢复该申请。',
  )
}
function selectStatus(event: { detail: { value: string | number } }) {
  if (busy.value || writing.value) return
  status.value =
    (Object.keys(applicationStatusLabels)[Number(event.detail.value) - 1] as ApplicationStatus) ||
    ''
  notice.value = ''
  void load()
}
function leave() {
  visible = false
  generation++
  writeGeneration++
  clearProjection()
  writing.value = false
  busy.value = false
  error.value = ''
  notice.value = ''
}
watch(
  () => user.user?.id,
  () => {
    if (readOwner.value && readOwner.value !== user.user?.id) {
      generation++
      writeGeneration++
      clearProjection()
      writing.value = false
      busy.value = false
      error.value = '会话已变化，请重新读取申请。'
    }
  },
  { flush: 'sync' },
)
onLoad((query) => {
  wishId.value = typeof query?.wishId === 'string' ? query.wishId : ''
})
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <view class="page">
    <text class="title">{{ wishId ? (ownerMode ? '心愿申请列表' : '申请应愿') : '我的应愿' }}</text>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
    <navigator v-if="wishId" url="/pages/applications/index">查看我的应愿</navigator>
    <picker
      v-if="!wishId"
      :range="['全部状态', ...Object.values(applicationStatusLabels)]"
      @change="selectStatus"
    >
      <view>状态：{{ status ? applicationStatusLabels[status] : '全部' }}</view>
    </picker>
    <button :disabled="busy || writing" @click="load()">刷新</button>
    <text v-if="busy">加载中…</text>
    <view v-if="currentWish" class="card">
      <navigator :url="`/pages/wish-detail/index?id=${encodeURIComponent(currentWish.id)}`"
        >查看心愿详情</navigator
      >
      <text>心愿状态：{{ wishStateLabels[currentWish.current_state] || '未知状态' }}</text>
      <text v-if="currentWish.privacy_review_required">内容暂不可查看</text>
      <template v-if="mayApply">
        <text>申请留言（可不填，最多100个字）</text>
        <textarea
          v-model="message"
          :disabled="writing"
          :maxlength="-1"
          placeholder="说说你希望如何帮助对方"
        />
        <text>{{ Array.from(message).length }}/100</text>
        <button :disabled="busy || writing" @click="submit">提交应愿申请</button>
      </template>
      <text v-else-if="!ownerMode">当前无法申请，请以心愿状态和当前账号权限为准。</text>
      <text v-if="ownerMode">仅显示审核通过且当前可处理的申请。</text>
    </view>
    <text v-if="!busy && scoped && !rows.length && (!wishId || ownerMode)">暂无可展示的申请</text>
    <view v-for="application in rows" :key="application.id" class="card">
      <text>{{ applicationStatusLabels[application.status] || '未知状态' }}</text>
      <navigator
        v-if="!wishId"
        :url="`/pages/wish-detail/index?id=${encodeURIComponent(application.wish_id)}`"
        >查看目标心愿</navigator
      >
      <template v-if="ownerMode && application.status === 'active'">
        <navigator
          :url="`/pages/report/index?kind=application&id=${encodeURIComponent(application.id)}&contextId=${encodeURIComponent(wishId)}`"
          >举报此申请留言</navigator
        >
        <text>{{ application.message || '对方未填写留言' }}</text>
        <navigator
          v-if="application.applicant"
          :url="`/pages/public-profile/index?id=${encodeURIComponent(application.applicant.id)}`"
        >
          {{ application.applicant.nickname || '查看申请者公开主页' }}
        </navigator>
        <button :disabled="busy || writing || !mayAccept(application)" @click="accept(application)">
          确定这位应愿人
        </button>
      </template>
      <template v-if="!wishId">
        <text v-if="application.message !== undefined">我的留言：{{ application.message }}</text>
        <text v-if="application.review_result?.reason"
          >驳回原因：{{ application.review_result.reason }}</text
        >
        <text v-if="application.review_result?.revision_suggestion"
          >修改建议：{{ application.review_result.revision_suggestion }}</text
        >
        <button
          v-if="mayWithdraw(application)"
          :disabled="busy || writing"
          @click="withdraw(application)"
        >
          撤销申请
        </button>
      </template>
    </view>
    <button v-if="scoped && cursor" :disabled="busy || writing" @click="load(true)">
      加载下一页
    </button>
    <navigator url="/pages/inbox/index">前往聊天与通知</navigator>
    <text v-if="notice" class="notice">{{ notice }}</text>
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
.card {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: white;
}
text {
  display: block;
  margin: 20rpx 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
button,
picker,
navigator {
  margin-top: 16rpx;
}
textarea {
  width: 100%;
  padding: 20rpx 0;
}
.notice {
  background: #fff1cc;
  padding: 20rpx;
}
.error {
  color: #b42318;
}
</style>
