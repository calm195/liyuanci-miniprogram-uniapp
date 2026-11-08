<script setup lang="ts">
import { openMainPage } from '@/utils/navigation'
import { onPullDownRefresh } from '@dcloudio/uni-app'
import PublicContent from '@/components/PublicContent.vue'
import ShareActions from '@/components/ShareActions.vue'
import AppPage from '@/components/AppPage.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useWishStore } from '@/stores/wishes'
import { getWish, getPublicWish, changeWishState } from '@/api/wishes'
import type { WishLifecycleAction } from '@/api/wishes'
import type { WishPublicContent, WishResult } from '@/types/wish'
import { categories, campuses, rewards } from '@/types/wish'
import { canWishAction } from '@/utils/actions'
import { canApplyToWish } from '@/utils/application'
import { RequestError } from '@/utils/request'
import { session } from '@/utils/session'
import { wishStateLabels } from '@/utils/wish'
import { displayTime } from '@/utils/time'
import { resolveShare } from '@/api/stories'
import { isPublicContent } from '@/utils/story'
import { shareReference } from '@/utils/share'
import { useContentShare } from '@/composables/use-content-share'

const user = useUserStore()
const demo = useWishStore()
const id = ref('')
const reference = ref<string>()
const sharedEntry = ref(false)
const sharedProjection = ref<WishPublicContent | null>(null)
const publicShare = ref<WishPublicContent | null>(null)
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
let pendingView = true

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
const shareTarget = useContentShare('wish', () =>
  !sharedEntry.value && !busy.value && currentWish.value?.current_state === 'published'
    ? publicShare.value
    : null,
)
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
  sharedProjection.value = null
  publicShare.value = null
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
  error.value = ''
  publicShare.value = null
  if (sharedEntry.value) {
    sharedProjection.value = null
    busy.value = true
    try {
      let targetId = id.value
      if (reference.value !== undefined) {
        // 先验证扫码引用，再走好友和朋友圈共用的匿名详情读取。
        if (!reference.value) throw new Error('分享引用无效')
        const resolved = await resolveShare(reference.value)
        if (!isCurrent()) return
        if (resolved?.target_kind !== 'wish' || !isPublicContent(resolved.target))
          throw new Error('分享内容不可用')
        targetId = resolved.target.id
      }
      if (!targetId) throw new Error('分享内容不可用')
      const trackView = pendingView
      pendingView = false
      const result = await getPublicWish(targetId, trackView)
      if (!isCurrent()) return
      if (result?.id !== targetId || !result.public || !isPublicContent(result.public))
        throw new Error('分享内容不可用')
      sharedProjection.value = result.public
    } catch {
      if (isCurrent()) error.value = '分享内容已失效或暂不可查看。'
    } finally {
      if (visible && current === generation) busy.value = false
    }
    return
  }
  if (!id.value) {
    error.value = '心愿链接无效，请从广场或我的心愿重新进入。'
    return
  }
  busy.value = true
  try {
    if (!config.useMock && session.getToken()) await user.refresh(false, true)
    if (!isCurrent()) return
    const trackView = pendingView
    pendingView = false
    const result = config.useMock
      ? demo.demoWishes.find((item) => item.id === id.value)
      : await getWish(id.value, trackView)
    if (!isCurrent()) return
    if (!result || result.id !== id.value) throw new Error('心愿不存在或当前不可查看。')
    wish.value = result
    snapshotEpoch.value = epoch
    snapshotOwner.value = user.user?.id || ''
    if (
      !config.useMock &&
      result.current_state === 'published' &&
      !result.privacy_review_required &&
      user.validated &&
      user.user?.verification === 'verified'
    ) {
      // 作者详情可能是私有投影，分享卡片只使用匿名读取的公开版本。
      const projection = result.public ?? (await getPublicWish(id.value).catch(() => null))?.public
      if (isCurrent() && projection?.id === id.value && isPublicContent(projection))
        publicShare.value = projection
    }
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
  reference.value = shareReference(query)
  sharedEntry.value = reference.value !== undefined || query?.shared === '1'
  id.value = typeof query?.id === 'string' ? query.id : ''
  pendingView = true
})
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
  <AppPage :hide-entry-prompts="sharedEntry">
    <template v-if="sharedEntry">
      <text v-if="busy">加载中…</text>
      <view v-if="sharedProjection" class="card">
        <text class="title">{{ sharedProjection.title || '公开心愿' }}</text>
        <PublicContent :content="sharedProjection" read-only />
      </view>
      <text v-if="error" class="notice">分享的心愿暂不可查看。</text>
    </template>
    <text v-if="!sharedEntry" class="title">{{ content?.title || '未命名心愿' }}</text>
    <text v-if="!sharedEntry && config.useMock" class="notice"
      >合成演示 · 详情只读，不发送 API</text
    >

    <text v-if="!sharedEntry && busy">加载中…</text>
    <view v-if="currentWish" class="card">
      <view class="detail-tags">
        <text class="category-pill">{{
          wishStateLabels[currentWish.current_state] || '未知状态'
        }}</text>
        <text v-if="content?.category" class="category-pill">{{
          categories.find((item) => item.value === content?.category)?.label
        }}</text>
        <text v-if="content?.campus" class="category-pill mint">{{
          campuses.find((item) => item.value === content?.campus)?.label
        }}</text>
        <text v-if="content?.reward_method" class="category-pill">{{
          content.reward_text ||
          rewards.find((item) => item.value === content?.reward_method)?.label
        }}</text>
      </view>
      <text v-if="currentWish.privacy_review_required">内容暂不可查看</text>
      <template v-else-if="content">
        <text class="whitespace-pre-wrap break-words">{{ content.body }}</text>
        <text v-if="publicContent?.school_related">未经证实</text>
        <navigator
          v-if="publicContent?.author"
          :url="`/pages/public-profile/index?id=${encodeURIComponent(publicContent.author.id)}`"
        >
          {{ publicContent.author.nickname || '查看公开主页' }}
        </navigator>
        <navigator
          v-if="publicContent?.author && currentWish.current_state === 'published'"
          class="moderation-link"
          :url="`/pages/blacklist/index?targetId=${encodeURIComponent(publicContent.author.id)}&sourceId=${encodeURIComponent(id)}&sourceKind=wish`"
          >屏蔽发布者</navigator
        >
        <text v-if="currentWish.expires_at" class="subtitle"
          >截止时间（北京时间）{{ displayTime(currentWish.expires_at) }}</text
        >
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
    <view v-if="currentWish && !config.useMock" class="card detail-actions">
      <view
        v-if="canWishAction(user.user, user.validated, currentWish, id, 'putWishesIdContent')"
        role="button"
        @click="
          runPageAction(() =>
            openMainPage(`/pages/wishes/index?own=1&edit=${encodeURIComponent(id)}`),
          )
        "
        >编辑心愿</view
      >
      <navigator
        v-if="!writing && !busy && canApplyToWish(user.user, user.validated, currentWish)"
        :url="`/pages/applications/index?wishId=${encodeURIComponent(currentWish.id)}`"
        >申请应愿</navigator
      >
      <navigator
        v-if="!writing && !busy && currentWish.own_content"
        :url="`/pages/applications/index?wishId=${encodeURIComponent(currentWish.id)}`"
        >查看应愿申请</navigator
      >
      <button
        v-if="allowed('withdraw')"
        :disabled="writing || busy"
        :loading="isPageActionPending('pages-wish-detail-index-button-2')"
        @click="runPageAction(() => act('withdraw'), 'pages-wish-detail-index-button-2')"
      >
        撤下心愿
      </button>
      <button
        v-if="allowed('complete')"
        :disabled="writing || busy"
        :loading="isPageActionPending('pages-wish-detail-index-button-3')"
        @click="runPageAction(() => act('complete'), 'pages-wish-detail-index-button-3')"
      >
        确认实现
      </button>
      <template v-if="allowed('rollback')">
        <button
          v-if="currentWish.current_state === 'realized'"
          :disabled="writing || busy"
          :loading="isPageActionPending('pages-wish-detail-index-button-4')"
          @click="
            runPageAction(() => act('rollback', 'matching'), 'pages-wish-detail-index-button-4')
          "
        >
          回退为应愿中（保留原应愿人）
        </button>
        <template v-if="currentWish.current_state === 'matching'">
          <view class="mt-3">
            <text>回退时刷新有效期（需重新审核）</text>
            <switch
              :checked="refreshExpiry"
              :disabled="writing || busy"
              @change="runPageAction(() => selectRefreshExpiry($event))"
            />
          </view>
          <button
            :disabled="writing || busy"
            :loading="isPageActionPending('pages-wish-detail-index-button-5')"
            @click="
              runPageAction(() => act('rollback', 'published'), 'pages-wish-detail-index-button-5')
            "
          >
            回退并解除当前匹配
          </button>
        </template>
      </template>
      <button
        v-if="allowed('exception-exit')"
        :disabled="writing || busy"
        :loading="isPageActionPending('pages-wish-detail-index-button-6')"
        @click="runPageAction(() => act('exception-exit'), 'pages-wish-detail-index-button-6')"
      >
        异常退出
      </button>
    </view>
    <navigator
      v-if="
        currentWish && ['matching', 'realized', 'fulfilled'].includes(currentWish.current_state)
      "
      url="/pages/inbox/index?view=conversations"
      >查看聊天会话</navigator
    >
    <navigator
      v-if="
        currentWish?.own_content &&
        !currentWish.privacy_review_required &&
        ['realized', 'fulfilled'].includes(currentWish.current_state) &&
        !config.useMock
      "
      :url="`/pages/story-editor/index?wishId=${encodeURIComponent(currentWish.id)}`"
      >管理我的还愿故事</navigator
    >
    <view
      v-if="currentWish && !currentWish.privacy_review_required && (publicContent || shareTarget)"
      class="detail-footer"
    >
      <navigator
        v-if="publicContent && !currentWish.own_content"
        class="moderation-link"
        :url="`/pages/report/index?kind=wish&id=${encodeURIComponent(id)}`"
        >举报此心愿</navigator
      >
      <ShareActions v-if="shareTarget" kind="wish" :content="shareTarget" />
    </view>
    <AppNotice :message="notice" kind="info" />
    <AppNotice :message="error" kind="error" />
  </AppPage>
</template>

<style scoped>
.detail-tags,
.detail-actions,
.detail-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20rpx;
}
.detail-footer {
  justify-content: space-between;
  margin-top: 32rpx;
}
.detail-actions button {
  margin: 0;
  flex: 1;
}
.whitespace-pre-wrap {
  display: block;
  font-size: 32rpx;
  line-height: 1.8;
  margin: 32rpx 0;
}
</style>
