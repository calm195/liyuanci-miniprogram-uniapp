<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useWishStore } from '@/stores/wishes'
import { getWish, changeWishState } from '@/api/wishes'
import type { WishLifecycleAction } from '@/api/wishes'
import type { WishResult } from '@/types/wish'
import { categories, campuses, rewards } from '@/types/wish'
import { canWishAction } from '@/utils/actions'
import { RequestError } from '@/utils/request'
import { session } from '@/utils/session'
import { wishStateLabels } from '@/utils/wish'

const user = useUserStore()
const demo = useWishStore()
const id = ref('')
const wish = ref<WishResult | null>(null)
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const notice = ref('')
const refreshExpiry = ref(false)
const snapshotEpoch = ref(-1)
const snapshotOwner = ref('')
let generation = 0
let writeGeneration = 0
let visible = false

// 路由只携带标识；正文与权限始终重新读取，不从列表或本地缓存恢复。
const currentWish = computed(() => {
  if (
    snapshotEpoch.value !== session.getEpoch() ||
    snapshotOwner.value !== (user.user?.id || '') ||
    (snapshotOwner.value && !user.validated)
  )
    return null
  return wish.value
})
const content = computed(() => {
  const value = currentWish.value
  if (!value || value.privacy_review_required) return null
  if (value.own_content) return value.own_content
  if (value.participant) return value.participant
  return value.current_state === 'published' ? value.public || null : null
})
const publicContent = computed(() => {
  const value = currentWish.value
  if (!value || value.privacy_review_required) return null
  return value.participant || (value.current_state === 'published' ? value.public : null)
})
const operations = {
  withdraw: 'postWishesIdWithdraw',
  rollback: 'postWishesIdRollback',
  complete: 'postWishesIdComplete',
  'exception-exit': 'postWishesIdExceptionExit',
} as const
function allowed(action: WishLifecycleAction) {
  return (
    !config.useMock &&
    config.wishWritesReady &&
    canWishAction(user.user, user.validated, currentWish.value, id.value, operations[action])
  )
}
function clearProjection() {
  wish.value = null
  snapshotEpoch.value = -1
  snapshotOwner.value = ''
  refreshExpiry.value = false
}
function selectRefreshExpiry(event: unknown) {
  const value = (event as { detail?: { value?: unknown } } | null)?.detail?.value
  if (typeof value === 'boolean' && !busy.value && !writing.value) refreshExpiry.value = value
}
async function load() {
  const current = ++generation
  const epoch = session.getEpoch()
  const isCurrent = () => visible && current === generation && epoch === session.getEpoch()
  clearProjection()
  error.value = ''
  if (!id.value) {
    error.value = '心愿链接无效，请从广场或我的心愿重新进入。'
    return
  }
  busy.value = true
  try {
    if (!config.useMock && session.getToken()) await user.refresh(false)
    if (!isCurrent()) return
    const result = config.useMock
      ? demo.demoWishes.find((item) => item.id === id.value)
      : await getWish(id.value)
    if (!isCurrent()) return
    if (!result || result.id !== id.value) throw new Error('心愿不存在或当前不可查看。')
    wish.value = result
    snapshotEpoch.value = epoch
    snapshotOwner.value = user.user?.id || ''
  } catch (failure) {
    if (!isCurrent()) return
    clearProjection()
    const status = failure instanceof RequestError ? failure.statusCode : 0
    error.value =
      status === 404
        ? '心愿不存在或当前不可查看。'
        : status === 403
          ? '当前账号无权查看这条心愿。'
          : '详情读取失败，请重新登录或刷新后重试。'
  } finally {
    if (visible && current === generation) busy.value = false
  }
}
function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '确认操作',
      content: message,
      confirmText: '确认',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
}
async function act(action: WishLifecycleAction, target?: 'matching' | 'published') {
  if (busy.value || writing.value || !allowed(action)) return
  const selected = currentWish.value!
  const writeId = ++writeGeneration
  const current = generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const refresh = target === 'published' && refreshExpiry.value
  const isCurrent = () =>
    visible &&
    current === generation &&
    epoch === session.getEpoch() &&
    owner === user.user?.id &&
    writeId === writeGeneration
  const messages = {
    withdraw: '撤下后将不再公开，旧申请会失效。是否继续？',
    rollback:
      target === 'matching'
        ? '恢复原应愿人与原会话；活跃心愿已满时回退会被拒绝。是否继续？'
        : `回退将解除当前匹配，旧申请失效、旧会话只读。${refresh ? '刷新期限后需重新审核。' : '保留原截止时间，已到期时不会重新公开。'}是否继续？`,
    complete: '确认实现后聊天将只读，待审消息会取消。是否确认心愿已实现？',
    'exception-exit':
      '仅符合处罚或拉黑退出条件时可解除匹配；退出后心愿撤回，旧会话只读。是否继续？',
  }
  writing.value = true
  error.value = ''
  notice.value = ''
  try {
    if (!(await confirmAction(messages[action]))) return
    // 确认弹窗也可能跨越会话或页面生命周期，确认后再次核对当前对象与动作。
    if (!isCurrent() || currentWish.value !== selected || !allowed(action)) return
    if (action === 'rollback' && !target) return
    await changeWishState(
      selected,
      action,
      `wish-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      action === 'rollback' && target ? { target, refresh_expiry: refresh } : undefined,
    )
    if (!isCurrent()) return
    await load()
    if (visible && epoch === session.getEpoch() && writeId === writeGeneration)
      notice.value = '操作已受理，请以重新读取的心愿状态为准。'
  } catch (failure) {
    if (!isCurrent()) return
    clearProjection()
    if (failure instanceof RequestError && failure.statusCode === 409) {
      const limit = failure.error_code === 'ACTIVE_WISH_LIMIT'
      await load()
      if (visible && epoch === session.getEpoch() && writeId === writeGeneration)
        notice.value = limit
          ? '活跃心愿已满，请先释放额度，再手动重试。'
          : '心愿状态已变化，已重新读取，请确认后手动操作。'
    } else {
      error.value = '操作未完成，请刷新当前资格和心愿后重试。'
    }
  } finally {
    if (writeId === writeGeneration) writing.value = false
  }
}
function leave() {
  visible = false
  generation++
  writeGeneration++
  clearProjection()
  busy.value = false
  writing.value = false
  notice.value = ''
  error.value = ''
}
watch(
  () => user.user?.id,
  () => {
    if (wish.value && snapshotOwner.value !== (user.user?.id || '')) {
      generation++
      writeGeneration++
      clearProjection()
      writing.value = false
      busy.value = false
      error.value = '会话已变化，请刷新详情。'
    }
  },
  { flush: 'sync' },
)
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
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
    <text class="title">心愿详情</text>
    <text v-if="config.useMock" class="notice">合成演示 · 详情只读，不发送 API</text>
    <button :disabled="busy || writing" @click="load">刷新详情</button>
    <text v-if="busy">加载中…</text>
    <view v-if="currentWish" class="card">
      <text>当前状态：{{ wishStateLabels[currentWish.current_state] || '未知状态' }}</text>
      <text v-if="currentWish.privacy_review_required">内容暂不可查看</text>
      <template v-else-if="content">
        <text class="body">{{ content.body }}</text>
        <text v-if="content.category"
          >分类：{{ categories.find((item) => item.value === content?.category)?.label }}</text
        >
        <text v-if="content.campus"
          >校区：{{ campuses.find((item) => item.value === content?.campus)?.label }}</text
        >
        <text v-if="content.reward_method"
          >报答：{{ rewards.find((item) => item.value === content?.reward_method)?.label }}</text
        >
        <text v-if="publicContent?.school_related">未经证实</text>
        <text v-if="currentWish.expires_at">截止时间：{{ currentWish.expires_at }}</text>
      </template>
      <text v-else>当前没有可展示的正文。</text>
      <template v-if="!currentWish.privacy_review_required && currentWish.own_content">
        <text v-if="currentWish.review_result?.reason"
          >驳回原因：{{ currentWish.review_result.reason }}</text
        >
        <text v-if="currentWish.review_result?.revision_suggestion"
          >修改建议：{{ currentWish.review_result.revision_suggestion }}</text
        >
      </template>
    </view>
    <view v-if="currentWish && !config.useMock" class="card">
      <text>可用操作以当前账号、心愿状态和服务端授权为准。</text>
      <button v-if="allowed('withdraw')" :disabled="writing || busy" @click="act('withdraw')">
        撤下心愿
      </button>
      <button v-if="allowed('complete')" :disabled="writing || busy" @click="act('complete')">
        确认实现
      </button>
      <template v-if="allowed('rollback')">
        <button
          v-if="currentWish.current_state === 'realized'"
          :disabled="writing || busy"
          @click="act('rollback', 'matching')"
        >
          回退为应愿中（保留原应愿人）
        </button>
        <template v-if="currentWish.current_state === 'matching'">
          <view class="option">
            <text>回退时刷新有效期（需重新审核）</text>
            <switch
              :checked="refreshExpiry"
              :disabled="writing || busy"
              @change="selectRefreshExpiry"
            />
          </view>
          <button :disabled="writing || busy" @click="act('rollback', 'published')">
            回退并解除当前匹配
          </button>
        </template>
      </template>
      <button
        v-if="allowed('exception-exit')"
        :disabled="writing || busy"
        @click="act('exception-exit')"
      >
        异常退出
      </button>
    </view>
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
  margin-bottom: 20rpx;
}
button {
  margin-top: 16rpx;
}
.body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.option {
  margin-top: 24rpx;
}
.notice {
  margin-top: 24rpx;
  padding: 20rpx;
  background: #fff1cc;
}
.error {
  margin-top: 24rpx;
  color: #b42318;
}
</style>
