<script setup lang="ts">
import { openMainPage } from '@/utils/navigation'
import { onPullDownRefresh } from '@dcloudio/uni-app'
import ShareActions from '@/components/ShareActions.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppPage from '@/components/AppPage.vue'
import ProfileAvatar from '@/components/ProfileAvatar.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import ContentStats from '@/components/ContentStats.vue'
import FavoriteButton from '@/components/FavoriteButton.vue'
import WishImages from '@/components/WishImages.vue'
import WishComments from '@/components/WishComments.vue'
import { useContentView } from '@/composables/use-content-view'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useWishStore } from '@/stores/wishes'
import WishSupportButton from '@/components/WishSupportButton.vue'
import { getWish, getPublicWish, changeWishState } from '@/api/wishes'
import type { WishLifecycleAction } from '@/api/wishes'
import type { WishPublicContent, WishResult, WishSupport } from '@/types/wish'
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
import { useHiddenWishes } from '@/composables/use-hidden-wishes'
import { openWishActionGate, type WishActionReady } from '@/composables/use-wish-action-return'
import { isShareBrowseOnly, prepareSharedWishBackStack } from '@/utils/shared-wish-navigation'

const user = useUserStore()
const recordView = useContentView('wish')
const hiddenWishes = useHiddenWishes()
const menuOpen = ref(false)
const demo = useWishStore()
const id = ref('')
const reference = ref<string>()
const sharedEntry = ref(false)
const publicShare = ref<WishPublicContent | null>(null)
const wish = ref<WishResult | null>(null)
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const notice = ref('')
const actionError = ref('')
const openingAction = ref(false)
const browseOnly = ref(false)
const refreshExpiry = ref(false)
const snapshotEpoch = ref(-1)
const snapshotOwner = ref('')
const sharedApplication = ref<{ owner: string; epoch: number } | null>(null)
let generation = 0
let writeGeneration = 0
let visible = false
type SharedAction = 'apply' | 'report' | 'block'
let actionReturn: { action: SharedAction; target: string; ready?: WishActionReady } | null = null

// 路由只携带标识；正文与权限始终重新读取，不从列表或本地缓存恢复。
const sharedSupport = ref<{ owner: string; epoch: number; state: WishSupport } | null>(null)
const currentWish = computed(() => {
  if (sharedEntry.value) return wish.value
  if (
    snapshotEpoch.value !== session.getEpoch() ||
    snapshotOwner.value !== (user.user?.id || '') ||
    (!sharedEntry.value && snapshotOwner.value && !user.validated)
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
const supportState = computed(() => {
  const saved = sharedSupport.value
  if (sharedEntry.value && saved?.owner === user.user?.id && saved?.epoch === session.getEpoch())
    return saved.state
  return currentWish.value?.support
})
const publicContent = computed(() => {
  const value = currentWish.value
  if (!value || value.privacy_review_required) return null
  return (
    value.participant ||
    (value.current_state === 'published'
      ? value.public ||
        (publicShare.value?.content_version === value.content_version ? publicShare.value : null)
      : null)
  )
})
const sharedActions = computed(
  () =>
    sharedEntry.value &&
    !config.useMock &&
    !!publicContent.value &&
    !currentWish.value?.is_owner &&
    !publicContent.value.is_owner &&
    publicContent.value.author?.id !== (user.validated ? user.user?.id : null),
)
const applicationInProgress = computed(() =>
  sharedEntry.value
    ? user.validated &&
      sharedApplication.value?.owner === user.user?.id &&
      sharedApplication.value?.epoch === session.getEpoch()
    : currentWish.value?.application_in_progress === true,
)
const moderationAvailable = computed(
  () =>
    !config.useMock &&
    !currentWish.value?.own_content &&
    !!publicContent.value &&
    !currentWish.value?.is_owner &&
    !publicContent.value.is_owner &&
    publicContent.value.author?.id !== (user.validated ? user.user?.id : null),
)
const contentHidden = computed(() => hiddenWishes.hidden.value.has(currentWish.value?.id || ''))
function toggleContentVisibility() {
  const target = currentWish.value?.id
  if (!target || !moderationAvailable.value || busy.value || openingAction.value) return
  actionError.value = ''
  notice.value = ''
  if (browseOnly.value) {
    actionError.value = '请先点击微信的「前往小程序」，再继续操作。'
    return
  }
  try {
    notice.value = hiddenWishes.toggle(target) ? '已标记为不看此内容。' : '已取消不看此内容。'
  } catch {
    actionError.value = '设置保存失败，请重试。'
  }
}
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
    !sharedEntry.value &&
    !config.useMock &&
    config.wishWritesReady &&
    canWishAction(user.user, user.validated, currentWish.value, id.value, operations[action])
  )
}
function clearProjection() {
  wish.value = null
  publicShare.value = null
  sharedApplication.value = null
  sharedSupport.value = null
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
  const isCurrent = () =>
    visible && current === generation && (sharedEntry.value || epoch === session.getEpoch())
  error.value = ''
  publicShare.value = null
  if (sharedEntry.value) {
    clearProjection()
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
      const result = await getPublicWish(targetId)
      if (!isCurrent()) return
      if (
        result?.id !== targetId ||
        result.current_state !== 'published' ||
        result.privacy_review_required ||
        result.public?.id !== targetId ||
        !isPublicContent(result.public)
      )
        throw new Error('分享内容不可用')
      void recordView(targetId)
      // 分享入口复用完整详情布局，只接收公开字段。
      wish.value = {
        id: result.id,
        version: result.version,
        current_state: result.current_state,
        expires_at: result.expires_at,
        allowed_actions: [],
        public: result.public,
        support: result.support,
      }
      const owner = user.user?.id
      if (!browseOnly.value && owner && user.validated) {
        // 分享正文保持匿名，单独读取当前账号自己的申请状态。
        const scoped = await getWish(targetId, false, true).catch(() => null)
        if (
          isCurrent() &&
          epoch === session.getEpoch() &&
          owner === user.user?.id &&
          scoped?.id === targetId &&
          wish.value
        ) {
          if (scoped.support) sharedSupport.value = { owner, epoch, state: scoped.support }
          if (scoped.application_in_progress) sharedApplication.value = { owner, epoch }
        }
      }
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
    const result = config.useMock
      ? demo.demoWishes.find((item) => item.id === id.value)
      : await getWish(id.value)
    if (!isCurrent()) return
    if (!result || result.id !== id.value) throw new Error('心愿不存在或当前不可查看。')
    wish.value = result
    if (!config.useMock && result.current_state === 'published' && !result.privacy_review_required)
      void recordView(result.id)
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
function openPage(url: string) {
  return new Promise<void>((resolve, reject) => {
    uni.navigateTo({ url, success: () => resolve(), fail: reject })
  })
}
async function openSharedAction(action: SharedAction) {
  const target = currentWish.value?.id || ''
  const author = publicContent.value?.author?.id
  if (
    !(action === 'apply' ? sharedActions.value : moderationAvailable.value) ||
    !target ||
    busy.value ||
    openingAction.value
  )
    return
  menuOpen.value = false
  if (browseOnly.value) {
    actionError.value = '请先点击微信的「前往小程序」，再继续操作。'
    return
  }
  const current = generation
  const active = () => visible && current === generation && currentWish.value?.id === target
  async function openGate(gate: 'login' | 'verification') {
    const owner = user.user?.id
    const epoch = session.getEpoch()
    const intent: NonNullable<typeof actionReturn> = { action, target }
    actionReturn = intent
    try {
      await openWishActionGate(gate, (ready) => {
        if (actionReturn !== intent) return
        intent.ready =
          ready && (gate === 'login' || (ready.owner === owner && ready.epoch === epoch))
            ? ready
            : undefined
      })
    } catch (failure) {
      if (actionReturn === intent) actionReturn = null
      throw failure
    }
  }
  openingAction.value = true
  actionError.value = ''
  try {
    if (session.getToken()) {
      try {
        await user.refresh(false, true)
      } catch (failure) {
        if (session.getToken()) throw failure
      }
    }
    if (!active()) return
    if (!session.getToken()) {
      await openGate('login')
      return
    }
    if (!user.validated || !user.user) throw new Error('资格读取失败')
    if (user.user.verification !== 'verified') {
      await openGate('verification')
      return
    }
    const account = user.user
    const epoch = session.getEpoch()
    // 展示仍用匿名公开投影，操作资格使用同一心愿的最新会话投影。
    const scoped = await getWish(target)
    if (
      !active() ||
      epoch !== session.getEpoch() ||
      !user.validated ||
      user.user?.id !== account.id
    )
      return
    if (
      scoped?.id !== target ||
      (action === 'apply' && scoped.current_state !== 'published') ||
      scoped.privacy_review_required ||
      scoped.own_content ||
      (scoped.public || scoped.participant)?.id !== target ||
      scoped.is_owner === true ||
      (scoped.public || scoped.participant)?.is_owner === true ||
      (scoped.public || scoped.participant)?.author?.id === account.id
    ) {
      actionError.value = '该心愿当前不可操作，请刷新后查看。'
      return
    }
    const queryId = encodeURIComponent(target)
    if (action === 'apply' && scoped.application_in_progress) {
      sharedApplication.value = { owner: account.id, epoch }
    } else if (action === 'apply' && canApplyToWish(user.user, user.validated, scoped)) {
      await openPage(`/pages/applications/index?wishId=${queryId}`)
    } else if (
      action === 'report' &&
      ['postReports', 'getReportTypes'].every((permission) =>
        user.user?.allowed_actions.includes(permission),
      )
    ) {
      await openPage(`/pages/report/index?kind=wish&id=${queryId}`)
    } else if (
      action === 'block' &&
      (scoped.public || scoped.participant)?.author &&
      (scoped.public || scoped.participant)?.author?.id === author
    ) {
      await openPage(
        `/pages/blacklist/index?targetId=${encodeURIComponent(author || '')}&sourceId=${queryId}&sourceKind=wish`,
      )
    } else {
      actionError.value = '当前账号或心愿状态不支持此操作。'
    }
  } catch {
    if (active()) actionError.value = '暂时无法进入操作，请重试。'
  } finally {
    if (active()) openingAction.value = false
  }
}
async function showDetail() {
  visible = true
  browseOnly.value = sharedEntry.value && isShareBrowseOnly()
  if (sharedEntry.value && (await prepareSharedWishBackStack(reference.value, id.value))) return
  if (!visible) return
  const intent = actionReturn
  actionReturn = null
  await load()
  if (
    visible &&
    intent?.ready &&
    intent.target === currentWish.value?.id &&
    intent.ready.owner === user.user?.id &&
    intent.ready.epoch === session.getEpoch()
  )
    await openSharedAction(intent.action)
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
        ? '恢复原应愿人与原会话。是否继续？'
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
      await load()
      if (visible && epoch === session.getEpoch() && writeId === writeGeneration)
        notice.value = '心愿状态已变化，已重新读取，请确认后手动操作。'
    } else {
      error.value = '操作未完成，请刷新当前资格和心愿后重试。'
    }
  } finally {
    if (writeId === writeGeneration) writing.value = false
  }
}
function leave() {
  menuOpen.value = false
  visible = false
  generation++
  writeGeneration++
  clearProjection()
  busy.value = false
  writing.value = false
  notice.value = ''
  actionError.value = ''
  openingAction.value = false
  error.value = ''
}
watch(
  () => user.user?.id,
  () => {
    if (sharedEntry.value) return
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
})
onShow(() => void showDetail())
onHide(leave)
onUnload(() => {
  actionReturn = null
  leave()
})
onPullDownRefresh(async () => {
  try {
    if (!openingAction.value) await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>

<template>
  <AppPage :hide-entry-prompts="sharedEntry">
    <text v-if="!sharedEntry || currentWish" class="title">{{
      content?.title || (sharedEntry ? '公开心愿' : '未命名心愿')
    }}</text>
    <text v-if="sharedEntry && error" class="notice">分享的心愿暂不可查看。</text>
    <text v-if="browseOnly" class="notice">点击微信的「前往小程序」后可登录、认证和操作。</text>
    <text v-if="!sharedEntry && config.useMock" class="notice"
      >合成演示 · 详情只读，不发送 API</text
    >

    <text v-if="busy">加载中…</text>
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
        <WishSupportButton
          v-if="!browseOnly && supportState"
          id="wish-detail-support"
          :wish-id="currentWish.id"
          :count="supportState.support_count"
          :supported="supportState.supported"
        />
        <button
          v-if="moderationAvailable"
          class="detail-icon-button"
          aria-label="更多心愿操作"
          :aria-expanded="menuOpen"
          :disabled="busy || openingAction"
          @click="menuOpen = !menuOpen"
        >
          <AppIcon name="more" :size="38" />
        </button>
      </view>
      <view v-if="menuOpen && moderationAvailable" class="detail-menu">
        <button
          :loading="isPageActionPending('wish-menu-report')"
          :disabled="openingAction"
          @click="runPageAction(() => openSharedAction('report'), 'wish-menu-report')"
        >
          举报
        </button>
        <button
          v-if="publicContent?.author"
          :loading="isPageActionPending('wish-menu-block')"
          :disabled="openingAction"
          @click="runPageAction(() => openSharedAction('block'), 'wish-menu-block')"
        >
          不看此人
        </button>
      </view>
      <text v-if="currentWish.privacy_review_required">内容暂不可查看</text>
      <template v-else-if="content">
        <navigator
          v-if="publicContent?.author?.id && publicContent.author.profile_available !== false"
          class="wish-author"
          :url="`/pages/public-profile/index?id=${encodeURIComponent(publicContent.author.id)}`"
        >
          <ProfileAvatar :src="publicContent.author.avatar_url" />
          <view class="author-copy"
            ><text>{{ publicContent.author.nickname || '查看公开主页' }}</text>
            <text v-if="publicContent.author.display_id" class="subtitle"
              >ID {{ publicContent.author.display_id }}</text
            >
          </view>
        </navigator>
        <view
          v-if="publicContent?.author && !publicContent.author.id"
          class="wish-author anonymous-author"
          ><ProfileAvatar /><text>{{
            publicContent.author.nickname || publicContent.author.display_id || '匿名同学'
          }}</text></view
        >
        <text
          v-if="publicContent?.first_published_at || publicContent?.published_at"
          class="subtitle"
          >发布
          {{
            displayTime(publicContent.first_published_at || publicContent.published_at || '')
          }}</text
        >
        <IdentityTags :tags="publicContent?.author?.identity_tags" />
        <text class="whitespace-pre-wrap break-words">{{ content.body }}</text>
        <WishImages
          v-if="(publicContent?.images ?? currentWish.images)?.length"
          :images="publicContent?.images ?? currentWish.images ?? []"
          :wish-id="currentWish.id"
        />
        <ContentStats
          :applications="publicContent?.application_count ?? currentWish.application_count"
          :comments="publicContent?.comment_count ?? currentWish.comment_count"
          :views="publicContent?.view_count ?? currentWish.view_count"
        />
        <FavoriteButton
          v-if="currentWish.current_state === 'published'"
          kind="wish"
          :target-id="currentWish.id"
          :favorited="publicContent?.favorited ?? currentWish.favorited"
        />
        <text v-if="publicContent?.school_related">未经证实</text>

        <button
          v-if="moderationAvailable"
          class="detail-icon-button"
          :aria-label="contentHidden ? '取消不看此内容' : '不看此内容'"
          :aria-pressed="contentHidden"
          :disabled="busy || openingAction"
          :loading="isPageActionPending('wish-hide-content')"
          @click="runPageAction(toggleContentVisibility, 'wish-hide-content')"
        >
          <AppIcon name="thumb-down" :active="contentHidden" :size="40" />
        </button>
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
    <view v-if="sharedActions" class="card detail-actions">
      <button
        :disabled="busy || openingAction || applicationInProgress"
        :loading="isPageActionPending('shared-wish-apply')"
        @click="runPageAction(() => openSharedAction('apply'), 'shared-wish-apply')"
      >
        {{ applicationInProgress ? '申请中' : '申请应愿' }}
      </button>
    </view>
    <view v-if="!sharedEntry && currentWish && !config.useMock" class="card detail-actions">
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
        v-if="
          !applicationInProgress &&
          !writing &&
          !busy &&
          canApplyToWish(user.user, user.validated, currentWish)
        "
        :url="`/pages/applications/index?wishId=${encodeURIComponent(currentWish.id)}`"
        >申请应愿</navigator
      >
      <button v-else-if="applicationInProgress" disabled>申请中</button>
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
      v-if="
        !sharedEntry &&
        currentWish &&
        !currentWish.privacy_review_required &&
        (publicContent || shareTarget)
      "
      class="detail-footer"
    >
      <ShareActions v-if="shareTarget" kind="wish" :content="shareTarget" />
    </view>
    <WishComments
      v-if="
        !config.useMock &&
        !browseOnly &&
        currentWish?.current_state === 'published' &&
        !currentWish.privacy_review_required
      "
      :key="currentWish.id + ':' + snapshotEpoch"
      :wish-id="currentWish.id"
      :version="currentWish.version"
      :content-version="currentWish.content_version ?? publicContent?.content_version"
      :comments-epoch="currentWish.comments_epoch ?? publicContent?.comments_epoch"
      :comments-open="currentWish.comments_open ?? publicContent?.comments_open"
      :owner="currentWish.is_owner === true || !!currentWish.own_content"
      @refresh="load"
    />
    <AppNotice :message="notice" kind="info" />
    <AppNotice :message="actionError" kind="error" />
    <AppNotice v-if="!sharedEntry" :message="error" kind="error" />
    <view
      v-if="sharedEntry && !browseOnly"
      class="moderation-link"
      role="button"
      @click="runPageAction(() => openMainPage('/pages/index/index'))"
      >返回首页</view
    >
  </AppPage>
</template>

<style scoped>
.wish-author {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 12rpx 0 24rpx;
}
.wish-author :deep(.avatar-image) {
  width: 76rpx;
  height: 76rpx;
}
.author-copy {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.detail-tags,
.detail-actions,
.detail-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20rpx;
}
.detail-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  margin: 0;
  padding: 0;
  background: transparent;
  border: 0;
}
.detail-icon-button::after {
  border: 0;
}
.detail-menu {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}
.detail-menu button {
  margin: 0;
  font-size: 26rpx;
}
.detail-footer {
  justify-content: flex-end;
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
