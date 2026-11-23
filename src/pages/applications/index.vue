<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import { onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useActionRecoveryStore } from '@/stores/action-recovery'
import type { ApplicationManageRecovery, ApplicationSubmitRecovery } from '@/stores/action-recovery'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { getWish } from '@/api/wishes'
import { readNotification } from '@/api/chat'
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
const recovery = useActionRecoveryStore()
const wishId = ref('')
const applicationId = ref('')
const wish = ref<WishResult | null>(null)
const items = ref<WishApplication[]>([])
const cursor = ref<string | null>(null)
const usedCursors = new Set<string>()
const status = ref<ApplicationStatus | ''>('')
const message = ref('')
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const notice = ref('')
const readEpoch = ref(-1)
const readOwner = ref('')
const pendingCommand = ref<ApplicationSubmitRecovery | null>(null)
const pendingManage = ref<ApplicationManageRecovery | null>(null)
const manageRecoveryKey = () => `applications:${wishId.value || 'mine'}`
type SubmissionStatus = ApplicationStatus | 'in_progress'
const submitted = ref<{ owner: string; epoch: number; status: SubmissionStatus } | null>(null)
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
const ownsCommand = (command: { owner: string; epoch: number } | null) =>
  !!command && command.owner === user.user?.id && command.epoch === session.getEpoch()
const mayRetry = computed(
  () => !config.useMock && config.wishWritesReady && ownsCommand(pendingCommand.value),
)
const submittedStatus = computed(() =>
  ownsCommand(submitted.value) ? submitted.value?.status : undefined,
)
const applicationInProgress = computed(
  () =>
    currentWish.value?.application_in_progress === true ||
    submittedStatus.value === 'pending_scan' ||
    submittedStatus.value === 'pending_review' ||
    submittedStatus.value === 'active' ||
    submittedStatus.value === 'in_progress',
)
const mayApply = computed(
  () =>
    scoped.value &&
    !applicationInProgress.value &&
    !submittedStatus.value &&
    !mayRetry.value &&
    !config.useMock &&
    config.wishWritesReady &&
    canApplyToWish(user.user, user.validated, currentWish.value),
)
function checkCursor(next: unknown) {
  // 游标仅在当前读取链内使用；重复或畸形值停止翻页，刷新后重新建立读取链。
  if (next === null) return
  if (typeof next !== 'string' || !next || usedCursors.has(next))
    throw new Error('分页游标异常，请刷新后重试')
  usedCursors.add(next)
}
function clearProjection() {
  wish.value = null
  items.value = []
  cursor.value = null
  usedCursors.clear()
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
    await user.refresh(false, true)
    if (!isCurrent()) return
    const target = wishId.value ? await getWish(wishId.value) : null
    if (!isCurrent()) return
    if (target && target.id !== wishId.value) throw new Error('心愿目标不匹配')
    const owned = !!target?.own_content
    const page = !wishId.value
      ? await listMyApplications(
          applicationId.value
            ? { application_id: applicationId.value }
            : { ...(status.value ? { status: status.value } : {}), cursor: nextCursor },
        )
      : owned && canManageApplications(user.user, user.validated, target)
        ? await listWishApplications(wishId.value, nextCursor)
        : { items: [], next_cursor: null }
    if (!isCurrent()) return
    checkCursor(page.next_cursor)
    // 许愿人只显示同一心愿的已审有效申请，拒绝将待审或其他目标混入列表。
    const incoming = owned
      ? page.items.filter((item) => item.wish_id === wishId.value && item.status === 'active')
      : page.items.filter((item) => !applicationId.value || item.id === applicationId.value)
    wish.value = target
    items.value = [
      ...(more ? items.value : []),
      ...incoming.filter((item) => !more || !items.value.some((old) => old.id === item.id)),
    ]
    cursor.value = page.next_cursor
    readEpoch.value = epoch
    readOwner.value = owner
    if (target?.application_in_progress && pendingCommand.value) {
      recovery.remove(`apply:${pendingCommand.value.id}`, pendingCommand.value.key)
      pendingCommand.value = null
    }
    // 只标记本页已展示申请对应的通知，保留后来到达和未翻到的申请提醒。
    if (owned) {
      for (const item of incoming) {
        for (const receipt of item.unread_notices ?? []) {
          if (!isCurrent()) return
          await readNotification(
            receipt,
            `application-notice-${receipt.id}-${receipt.version}`,
            true,
          ).catch(() => undefined)
        }
      }
    }
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
    !pendingManage.value &&
    config.wishWritesReady &&
    ownerMode.value &&
    items.value.includes(application) &&
    canAcceptApplication(user.user, user.validated, currentWish.value, application)
  )
}
function mayWithdraw(application: WishApplication) {
  return (
    !config.useMock &&
    !pendingManage.value &&
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
  command: Omit<ApplicationManageRecovery, 'key' | 'owner' | 'epoch'>,
  confirmation?: string,
) {
  if (busy.value || writing.value || pendingManage.value || !authorized()) return
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
    pendingManage.value = {
      ...command,
      key: `application-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      owner: owner || '',
      epoch,
    }
    if (!recovery.save(manageRecoveryKey(), pendingManage.value)) {
      pendingManage.value = null
      error.value = '当前会话未确认或已有待确认操作，请重新进入页面核对。'
      return
    }
    await executeManage(isCurrent, writeId)
  } catch (failure) {
    if (isCurrent()) error.value = failure instanceof Error ? failure.message : '操作未完成。'
  } finally {
    if (writeId === writeGeneration) writing.value = false
  }
}
async function executeManage(active: () => boolean, writeId: number) {
  const attempt = pendingManage.value
  if (!attempt) return
  try {
    if (attempt.kind === 'accept') {
      if (attempt.wishVersion === undefined) throw new Error('原请求缺少心愿版本。')
      await acceptApplication(attempt.application, attempt.wishVersion, attempt.key)
    } else await withdrawApplication(attempt.application, attempt.key)
    if (!active()) return
    recovery.remove(manageRecoveryKey(), attempt.key)
    pendingManage.value = null
    await load()
    if (visible && attempt.epoch === session.getEpoch() && writeId === writeGeneration)
      notice.value =
        attempt.kind === 'accept' ? '已确定应愿人，请查看心愿的最新状态。' : '申请已撤销。'
  } catch (failure) {
    if (!active()) return
    const status = failure instanceof RequestError ? failure.statusCode : 0
    if (status >= 400 && status < 500 && ![408, 429].includes(status)) {
      recovery.remove(manageRecoveryKey(), attempt.key)
      pendingManage.value = null
      clearProjection()
      if (status === 409) {
        await load()
        if (visible && attempt.epoch === session.getEpoch() && writeId === writeGeneration)
          notice.value = '心愿或申请状态已变化，已重新读取，请确认后手动操作。'
      } else error.value = '操作未完成，请刷新当前资格与申请后重试。'
    } else error.value = '操作结果尚未确认，请使用原请求重试。'
  }
}
async function retryManage() {
  const attempt = pendingManage.value
  if (
    !attempt ||
    !visible ||
    busy.value ||
    writing.value ||
    !user.validated ||
    !ownsCommand(attempt)
  )
    return
  const current = generation
  const writeId = ++writeGeneration
  const active = () =>
    visible && current === generation && writeId === writeGeneration && ownsCommand(attempt)
  writing.value = true
  error.value = ''
  try {
    await executeManage(active, writeId)
  } finally {
    if (writeId === writeGeneration) writing.value = false
  }
}
async function submit() {
  if (busy.value || writing.value || (!mayApply.value && !mayRetry.value)) return
  const retry = mayRetry.value
  const owner = user.user?.id
  if (!owner) return
  if (!retry) {
    error.value = applicationMessageError(message.value)
    if (error.value) return
  }
  const epoch = session.getEpoch()
  const command = retry
    ? pendingCommand.value!
    : {
        kind: 'apply' as const,
        id: currentWish.value!.id,
        owner,
        epoch,
        version: currentWish.value!.content_version!,
        message: message.value,
        key: `application-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }
  const writeId = ++writeGeneration
  const isCurrent = () => visible && ownsCommand(command) && writeId === writeGeneration
  const confirmProgress = async () => {
    const target = await getWish(command.id, false, true).catch(() => null)
    return target?.id === command.id && target.application_in_progress === true
  }
  const saveReceipt = (status: SubmissionStatus) => {
    recovery.remove(`apply:${command.id}`, command.key)
    pendingCommand.value = null
    submitted.value = { owner, epoch, status }
    message.value = ''
    notice.value =
      status === 'in_progress'
        ? '已核实申请正在处理中，可在「我的应愿」查看状态。'
        : ['pending_scan', 'pending_review', 'active'].includes(status)
          ? '申请已受理，可在「我的应愿」查看处理状态。留言审核通过后会交给许愿人。'
          : `申请状态已更新为「${applicationStatusLabels[status]}」，请在「我的应愿」查看。`
  }
  // 无回执时只核对当前状态或重放原留言、版本与幂等键。
  pendingCommand.value = command
  if (!recovery.save(`apply:${command.id}`, command)) {
    pendingCommand.value = null
    error.value = '当前会话未确认或已有待确认操作，请重新进入页面核对。'
    return
  }
  writing.value = true
  error.value = ''
  notice.value = ''
  try {
    if (retry && (await confirmProgress())) {
      if (isCurrent()) saveReceipt('in_progress')
      return
    }
    if (!isCurrent()) return
    const result = await applyToWish(command.id, command.version, command.message, command.key)
    if (!isCurrent()) return
    if (result?.wish_id !== command.id || !(result.status in applicationStatusLabels))
      throw new Error('申请回执无效')
    // 已确认的提交结果不依赖详情刷新，也不会误判为不能申请。
    saveReceipt(result.status)
  } catch (failure) {
    if (!isCurrent()) return
    const status = failure instanceof RequestError ? failure.statusCode : 0
    if (status === 408 || status === 409 || status < 400 || status >= 500) {
      const inProgress = await confirmProgress()
      if (!isCurrent()) return
      if (inProgress) {
        saveReceipt('in_progress')
        return
      }
    }
    if (status >= 400 && status < 500 && ![408, 429].includes(status)) {
      recovery.remove(`apply:${command.id}`, command.key)
      pendingCommand.value = null
      await load()
      if (isCurrent()) {
        error.value = retry
          ? '当前无法重试原申请，请在「我的应愿」核对是否已提交。'
          : '本次申请未提交，请查看当前心愿或前往「我的应愿」确认状态。'
      }
    } else {
      error.value = '申请结果尚未确认。可核实并重试原申请。'
    }
  } finally {
    if (writeId === writeGeneration) writing.value = false
  }
}
async function accept(application: WishApplication) {
  const target = currentWish.value
  if (!target) return
  const snapshot = { id: application.id, version: application.version }
  const targetVersion = target.version
  await write(
    () => currentWish.value === target && mayAccept(application),
    { kind: 'accept', application: snapshot, wishVersion: targetVersion },
    '确定后将建立唯一匹配，其他未终结申请会失效。是否选择这位应愿人？',
  )
}
async function withdraw(application: WishApplication) {
  const snapshot = { id: application.id, version: application.version }
  await write(
    () => mayWithdraw(application),
    { kind: 'withdraw', application: snapshot },
    '是否撤销这条应愿申请？撤销后旧审核不会恢复该申请。',
  )
}
function selectStatus(event: { detail: { value: string | number } }) {
  if (busy.value || writing.value) return
  status.value =
    (Object.keys(applicationStatusLabels)[Number(event.detail.value) - 1] as ApplicationStatus) ||
    ''
  notice.value = ''
  return load()
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
  [() => user.user?.id, () => session.getEpoch()],
  () => {
    if (!ownsCommand(pendingCommand.value)) pendingCommand.value = null
    if (!ownsCommand(pendingManage.value)) pendingManage.value = null
    if (!ownsCommand(submitted.value)) submitted.value = null
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
  applicationId.value =
    !wishId.value && typeof query?.applicationId === 'string' ? query.applicationId : ''
})
onShow(() => {
  visible = true
  const savedSubmit = recovery.get(`apply:${wishId.value}`)
  pendingCommand.value = savedSubmit?.kind === 'apply' ? savedSubmit : null
  const savedManage = recovery.get(manageRecoveryKey())
  pendingManage.value =
    savedManage?.kind === 'accept' || savedManage?.kind === 'withdraw' ? savedManage : null
  void load()
})
onHide(leave)
onUnload(() => {
  pendingCommand.value = null
  pendingManage.value = null
  submitted.value = null
  leave()
})
onPullDownRefresh(async () => {
  try {
    if (!writing.value) {
      submitted.value = null
      await load()
    }
  } finally {
    uni.stopPullDownRefresh()
  }
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading
      :title="
        wishId
          ? ownerMode
            ? '心愿收到的应愿'
            : '回应这份心愿'
          : applicationId
            ? '查看应愿进度'
            : '应愿记录'
      "
      description="认真回应每一份期待，按当前进度继续下一步。"
    />
    <LoginLink v-if="!user.isLoggedIn" class="ui-link">前往登录</LoginLink>
    <navigator v-if="wishId || applicationId" class="ui-link" url="/pages/applications/index"
      >查看我的应愿</navigator
    >
    <picker
      v-if="!wishId && !applicationId"
      class="ui-picker"
      :range="['全部状态', ...Object.values(applicationStatusLabels)]"
      @change="runPageAction(() => selectStatus($event))"
    >
      <view>状态：{{ status ? applicationStatusLabels[status] : '全部' }}</view>
    </picker>

    <text v-if="busy" class="ui-copy">加载中…</text>
    <view v-if="currentWish" class="ui-section ui-stack">
      <navigator
        class="ui-link"
        :url="`/pages/wish-detail/index?id=${encodeURIComponent(currentWish.id)}`"
        >查看心愿详情</navigator
      >
      <text class="ui-copy"
        >心愿状态：{{ wishStateLabels[currentWish.current_state] || '未知状态' }}</text
      >
      <text v-if="currentWish.privacy_review_required" class="ui-copy">内容暂不可查看</text>
      <template v-if="mayApply">
        <text class="ui-copy">申请留言（可不填，最多100个字）</text>
        <textarea
          v-model="message"
          class="ui-textarea"
          placeholder-class="field-placeholder"
          :disabled="writing"
          :maxlength="-1"
          placeholder="说说你希望如何帮助对方"
        />
        <text class="ui-copy">{{ Array.from(message).length }}/100</text>
        <button
          class="ui-button"
          :disabled="busy || writing"
          :loading="isPageActionPending('pages-applications-index-button-2')"
          @click="runPageAction(() => submit(), 'pages-applications-index-button-2')"
        >
          提交应愿申请
        </button>
      </template>
      <text v-else-if="applicationInProgress" class="ui-copy"
        >申请中，可在「我的应愿」查看进度。</text
      >
      <text v-else-if="submittedStatus && submittedStatus !== 'in_progress'" class="ui-copy">{{
        applicationStatusLabels[submittedStatus]
      }}</text>
      <text v-else-if="!ownerMode && !mayRetry" class="ui-copy"
        >当前无法申请，请以心愿状态和当前账号权限为准。</text
      >
      <text v-if="ownerMode" class="ui-copy">仅显示审核通过且当前可处理的申请。</text>
    </view>
    <button
      v-if="mayRetry"
      class="ui-button"
      :disabled="busy || writing"
      :loading="isPageActionPending('pages-applications-retry')"
      @click="runPageAction(() => submit(), 'pages-applications-retry')"
    >
      核实并重试原申请
    </button>
    <button
      v-if="pendingManage && ownsCommand(pendingManage)"
      class="ui-button"
      :disabled="busy || writing"
      :loading="isPageActionPending('applications-manage-retry')"
      @click="runPageAction(retryManage, 'applications-manage-retry')"
    >
      使用原请求重试操作
    </button>
    <text v-if="pendingManage || mayRetry" class="ui-copy"
      >待确认请求保留在当前会话内存中，退出登录或关闭小程序后请先核对申请状态。</text
    >
    <text v-if="!busy && scoped && !rows.length && (!wishId || ownerMode)" class="ui-copy">{{
      applicationId ? '这条申请暂不可查看' : '暂无可展示的申请'
    }}</text>
    <view v-for="application in rows" :key="application.id" class="ui-section ui-stack">
      <navigator
        v-if="!wishId"
        class="ui-link"
        :url="`/pages/wish-detail/index?id=${encodeURIComponent(application.wish_id)}`"
        >{{ application.wish_title || '心愿标题暂不可查看' }}</navigator
      >
      <text class="ui-copy">{{ applicationStatusLabels[application.status] || '未知状态' }}</text>
      <template v-if="ownerMode && application.status === 'active'">
        <navigator
          class="ui-link moderation-link"
          :url="`/pages/report/index?kind=application&id=${encodeURIComponent(application.id)}&contextId=${encodeURIComponent(wishId)}`"
          >举报此申请留言</navigator
        >
        <text class="ui-copy">{{ application.message || '对方未填写留言' }}</text>
        <navigator
          v-if="application.applicant"
          class="ui-link"
          :url="`/pages/public-profile/index?id=${encodeURIComponent(application.applicant.id)}`"
        >
          {{ application.applicant.nickname || '查看申请者公开主页' }}
        </navigator>
        <button
          class="ui-button"
          :disabled="busy || writing || !mayAccept(application)"
          :loading="isPageActionPending('pages-applications-index-button-3' + ':' + application.id)"
          @click="
            runPageAction(
              () => accept(application),
              'pages-applications-index-button-3' + ':' + application.id,
            )
          "
        >
          确定这位应愿人
        </button>
      </template>
      <template v-if="!wishId">
        <text v-if="application.message !== undefined" class="ui-copy"
          >我的留言：{{ application.message }}</text
        >
        <text v-if="application.review_result?.reason" class="ui-copy"
          >驳回原因：{{ application.review_result.reason }}</text
        >
        <text v-if="application.review_result?.revision_suggestion" class="ui-copy"
          >修改建议：{{ application.review_result.revision_suggestion }}</text
        >
        <button
          v-if="mayWithdraw(application)"
          class="ui-button"
          :disabled="busy || writing"
          :loading="isPageActionPending('pages-applications-index-button-4' + ':' + application.id)"
          @click="
            runPageAction(
              () => withdraw(application),
              'pages-applications-index-button-4' + ':' + application.id,
            )
          "
        >
          撤销申请
        </button>
      </template>
    </view>
    <button
      v-if="scoped && cursor"
      class="ui-button"
      :disabled="busy || writing"
      :loading="isPageActionPending('pages-applications-index-button-5')"
      @click="runPageAction(() => load(true), 'pages-applications-index-button-5')"
    >
      加载下一页
    </button>
    <AppNotice :message="notice" kind="info" />
    <AppNotice :message="error" :kind="pendingManage ? 'uncertain' : 'error'" />
  </AppPage>
</template>
