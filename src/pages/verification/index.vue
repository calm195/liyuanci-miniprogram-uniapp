<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppSheet from '@/components/AppSheet.vue'
import StudentCardDraftPanel from '@/components/StudentCardDraftPanel.vue'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { getVerification } from '@/api/auth'
import { RequestError } from '@/utils/request'
import { canMeAction, validStudentNumber, verificationInput } from '@/utils/actions'
import {
  uploadStudentCard,
  getStudentCardAsset,
  submitVerification,
  getVerificationDraft,
  removeVerificationPhoto,
  downloadVerificationPhoto,
} from '@/api/verification'
import type { StudentCardAsset, Verification } from '@/types/api'
import { session } from '@/utils/session'
import { createVisiblePoller } from '@/utils/visible-poller'
import { useWishActionReturn } from '@/composables/use-wish-action-return'

const store = useUserStore()
const wishReturn = useWishActionReturn('verification')
const name = ref('')
const studentNumber = ref('')
const asset = ref<StudentCardAsset | null>(null)
const candidate = ref<StudentCardAsset | null>(null)
const updatingPhoto = ref(false)
const readingDraft = ref(false)
const cardPreview = ref('')
const photoRecordOpen = ref(false)
type VerificationSubmission = { input: ReturnType<typeof verificationInput>; key: string }
const pendingSubmission = ref<VerificationSubmission | null>(null)
let previewingCard = false
const uploading = ref(false)
const resizeCanvas = shallowRef<{ width: number; height: number } | null>(null)
const submitting = ref(false)
// 各动作单独显示进度；共享互斥只用于禁止并行写入，不能让无关按钮同时转圈。
const busy = computed(() => uploading.value || submitting.value || updatingPhoto.value)
const currentReview = ref<Verification | null>(null)
const reviewState = ref<'unknown' | 'absent' | 'present'>('unknown')
const refreshing = ref(false)
const querying = ref(false)
const scanNotice = ref('')
const photoPreviewError = ref('')
const scanPoller = createVisiblePoller(() => queryAsset())
const reviewPoller = createVisiblePoller(() => refreshReview(true), undefined, 10_000)
let readingReview = false
let scanDeadline = 0
let draftRead = 0
const assetEpoch = ref(-1)
const reviewEpoch = ref(-1)
const reviewOwner = ref('')
const error = ref('')
const studentNumberError = computed(() =>
  studentNumber.value && !validStudentNumber(studentNumber.value)
    ? '学号须为4位年份加8位数字，共12位，年份首位不能为0。'
    : '',
)
const canUpload = computed(() =>
  canMeAction(store.user, store.user?.id || '', 'postMeStudentCardAssets', store.validated),
)
const canSubmitReal = computed(
  () =>
    config.verificationWritesReady &&
    !pendingSubmission.value &&
    !!name.value.trim() &&
    validStudentNumber(studentNumber.value) &&
    !busy.value &&
    !refreshing.value &&
    !querying.value &&
    !readingDraft.value &&
    candidate.value?.scan_status !== 'pending' &&
    canMeAction(store.user, store.user?.id || '', 'postMeVerificationRequests', store.validated) &&
    reviewEpoch.value === session.getEpoch() &&
    reviewOwner.value === store.user?.id &&
    assetEpoch.value === session.getEpoch() &&
    (reviewState.value === 'absent' || currentReview.value?.status === 'rejected') &&
    asset.value?.scan_status === 'approved',
)
const demoStatus = ref<'draft' | 'pending' | 'rejected' | 'approved'>('draft')
const demoMessage = ref('')
const reviewStatus = computed(
  () =>
    currentReview.value?.status ??
    (store.user?.verification === 'verified' ? 'approved' : store.user?.verification),
)
const applicationInReview = computed(
  () => !config.useMock && (reviewStatus.value === 'approved' || reviewStatus.value === 'pending'),
)
const canFillApplication = computed(() =>
  config.useMock
    ? demoStatus.value === 'draft' || demoStatus.value === 'rejected'
    : config.verificationWritesReady &&
      !applicationInReview.value &&
      (reviewState.value === 'absent' || currentReview.value?.status === 'rejected'),
)
const scanDate = computed(() => (asset.value?.scanned_at ? scanTime(asset.value.scanned_at) : ''))
const photoBusy = computed(
  () => busy.value || querying.value || readingDraft.value || !!pendingSubmission.value,
)
let generation = 0
let visible = false
let selectingCard = false
const canSubmitDemo = computed(
  () =>
    config.useMock &&
    !!name.value.trim() &&
    validStudentNumber(studentNumber.value) &&
    asset.value?.scan_status === 'approved' &&
    demoStatus.value !== 'pending' &&
    demoStatus.value !== 'approved',
)
function scanTime(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return ''
  return (
    new Date(parsed + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ') +
    '（北京时间）'
  )
}
function stopScanPolling() {
  scanPoller.stop()
  scanDeadline = 0
}
function startScanPolling() {
  if (candidate.value?.scan_status !== 'pending' || scanDeadline) return
  scanDeadline = Date.now() + 120_000
  scanPoller.start()
}
function showScanProblem(title: string, content: string) {
  scanNotice.value = content
  uni.$emit?.('app:notice', { message: title, description: content, kind: 'warning' })
}
function forgetPreview() {
  const path = cardPreview.value
  cardPreview.value = ''
  // #ifdef MP-WEIXIN
  if (path) uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} })
  // #endif
}
function clearPrivateData() {
  forgetPreview()
  previewingCard = false
  photoRecordOpen.value = false
  pendingSubmission.value = null
  stopScanPolling()
  reviewPoller.stop()
  readingReview = false
  scanNotice.value = ''
  photoPreviewError.value = ''
  generation++
  resizeCanvas.value = null
  name.value = ''
  studentNumber.value = ''
  asset.value = null
  candidate.value = null
  updatingPhoto.value = false
  readingDraft.value = false
  assetEpoch.value = -1
  reviewEpoch.value = -1
  reviewOwner.value = ''
  error.value = ''
  uploading.value = false
  submitting.value = false
  currentReview.value = null
  reviewState.value = 'unknown'
  refreshing.value = false
  querying.value = false
}
function acceptReview(review: Verification, epoch: number) {
  if (!Number.isInteger(review.version) || review.version < 1) throw new Error('审核版本无效')
  currentReview.value = review
  reviewState.value = 'present'
  reviewEpoch.value = epoch
  reviewOwner.value = store.user?.id || ''
  if (review.status === 'pending' || review.status === 'approved') {
    pendingSubmission.value = null
    name.value = ''
    studentNumber.value = ''
    photoRecordOpen.value = false
    forgetPreview()
  }
}
// 审核记录独立读取；本人资格和资产扫描都不能替代审核记录版本。
async function refreshReview(background = false) {
  if (readingReview || (background && (busy.value || querying.value))) return
  const current = generation
  const epoch = session.getEpoch()
  const isCurrent = () => visible && current === generation && epoch === session.getEpoch()
  readingReview = true
  if (!background) {
    refreshing.value = true
    currentReview.value = null
    reviewState.value = 'unknown'
    error.value = ''
  }
  try {
    await store.refresh(false, true)
    if (!isCurrent() || !store.isLoggedIn) return
    // 审核仍在等待时不重复读取审核资料；资格发生变化后再更新页面记录。
    if (background && store.user?.verification === 'pending') return
    try {
      const review = await getVerification(true)
      if (!isCurrent()) return
      acceptReview(review, epoch)
    } catch (failure) {
      if (!isCurrent()) return
      if (failure instanceof RequestError && (failure.statusCode || failure.code) === 404) {
        currentReview.value = null
        reviewState.value = 'absent'
        reviewEpoch.value = epoch
        reviewOwner.value = store.user?.id || ''
      } else throw failure
    }
  } catch {
    if (isCurrent() && !background)
      error.value = '无法确认当前审核记录，请重新读取；不能据此作为首次申请。'
  } finally {
    if (current === generation) {
      readingReview = false
      refreshing.value = false
    }
  }
}
async function refreshDraft(reportError = true) {
  if (!visible || config.useMock || !session.getToken()) return
  const current = generation
  const read = ++draftRead
  const epoch = session.getEpoch()
  const active = () =>
    visible && current === generation && read === draftRead && epoch === session.getEpoch()
  readingDraft.value = true
  try {
    const draft = await getVerificationDraft()
    if (!active()) return
    if (asset.value?.asset_id !== draft.active?.asset_id) {
      photoRecordOpen.value = false
      forgetPreview()
    }
    asset.value = draft.active
    candidate.value = draft.candidate
    assetEpoch.value = epoch
    scanNotice.value = ''
    if (candidate.value?.scan_status === 'pending') startScanPolling()
    else stopScanPolling()
    return draft
  } catch {
    if (active() && reportError) scanNotice.value = '无法读取已保存的照片，请重试。'
  } finally {
    if (active()) readingDraft.value = false
  }
}
async function refreshPage() {
  await refreshReview()
  await refreshDraft()
}
function showCardResult(result: StudentCardAsset) {
  if (result.scan_status === 'approved') {
    scanNotice.value = ''
    uni.$emit?.('app:notice', {
      message: '图片扫描通过',
      description: '可以填写学生信息并提交申请。',
      kind: 'success',
    })
  } else if (result.scan_status === 'rejected') {
    scanNotice.value =
      '图片扫描未通过：图片未通过安全内容检查，请重新上传清晰、完整的本人学生卡照片。'
    uni.$emit?.('app:notice', { message: scanNotice.value, kind: 'warning' })
  }
}
async function resizeCardWithCanvas(path: string, width: number, height: number) {
  const dimensions = { width, height }
  resizeCanvas.value = dimensions
  try {
    await nextTick()
    if (resizeCanvas.value !== dimensions) throw new Error('图片处理已取消')
    const canvasId = 'student-card-resize'
    const canvas = uni.createCanvasContext(canvasId)
    canvas.setFillStyle('#ffffff')
    canvas.fillRect(0, 0, width, height)
    canvas.drawImage(path, 0, 0, width, height)
    return await new Promise<string>((resolve, reject) => {
      canvas.draw(false, () => {
        uni.canvasToTempFilePath({
          canvasId,
          width,
          height,
          destWidth: width,
          destHeight: height,
          fileType: 'jpg',
          quality: 0.92,
          success: ({ tempFilePath }) => resolve(tempFilePath),
          fail: reject,
        })
      })
    })
  } catch {
    throw new Error('无法自动缩小图片，请裁剪后重新选择')
  } finally {
    if (resizeCanvas.value === dimensions) resizeCanvas.value = null
  }
}
async function chooseCard() {
  if (busy.value || querying.value || pendingSubmission.value) return
  error.value = ''
  if (config.useMock) {
    asset.value = { asset_id: 'synthetic-card', scan_status: 'pending' }
    demoMessage.value = '合成图片已受理，等待安全扫描。'
    return
  }
  if (!canUpload.value) {
    error.value = '请先登录并刷新账号状态。'
    return
  }
  const current = generation
  const epoch = session.getEpoch()
  const isCurrent = () => visible && current === generation && epoch === session.getEpoch()
  uploading.value = true
  try {
    // 微信选图会临时隐藏页面，此时保留内存表单；选图结束后恢复正常离开清理。
    selectingCard = true
    let result: { tempFilePaths: string | string[] }
    try {
      result = await new Promise<{ tempFilePaths: string | string[] }>((resolve, reject) => {
        uni.chooseImage({ count: 1, sizeType: ['original'], success: resolve, fail: reject })
      })
    } finally {
      selectingCard = false
    }
    if (!isCurrent()) return
    // 选图返回会触发应用刷新资格，等待本人资格确认后再判断上传权限。
    if (!store.validated) await store.refresh(false)
    if (!isCurrent()) return
    if (!canUpload.value) {
      error.value = '当前账号暂不能上传学生卡，请刷新账号状态后重试。'
      return
    }
    const path =
      typeof result.tempFilePaths === 'string' ? result.tempFilePaths : result.tempFilePaths[0]
    if (!path) return
    // 保留通过的照片，服务端只会在新照片通过时替换。
    stopScanPolling()
    const uploaded = await uploadStudentCard(
      path,
      `card-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      {
        resize: (path, width, height) => {
          if (!isCurrent()) return Promise.reject(new Error('图片处理已取消'))
          return resizeCardWithCanvas(path, width, height)
        },
        isCurrent,
      },
    )
    if (isCurrent()) {
      candidate.value = uploaded
      assetEpoch.value = epoch
      scanNotice.value = ''
      if (uploaded.scan_status === 'pending')
        uni.$emit?.('app:notice', {
          message: '照片已上传，可以离开后再查看。',
          kind: 'info',
        })
      startScanPolling()
      await refreshDraft(false)
    }
  } catch (failure) {
    if (!isCurrent()) return
    if (
      failure &&
      typeof failure === 'object' &&
      'errMsg' in failure &&
      typeof failure.errMsg === 'string' &&
      failure.errMsg.includes('cancel')
    )
      return
    const message = failure instanceof Error ? failure.message : '无法打开所选图片，请重新选择。'
    error.value = message
  } finally {
    if (current === generation) uploading.value = false
  }
}
async function removeCard(photo = asset.value ?? candidate.value) {
  if (photoBusy.value || !photo) return
  if (config.useMock) {
    asset.value = null
    scanNotice.value = ''
    return
  }
  const current = generation
  const epoch = session.getEpoch()
  updatingPhoto.value = true
  try {
    await removeVerificationPhoto(photo.asset_id)
    if (current !== generation || epoch !== session.getEpoch()) return
    stopScanPolling()
    scanNotice.value = ''
    await refreshDraft()
  } catch {
    if (current === generation && epoch === session.getEpoch()) {
      await refreshDraft(false)
      scanNotice.value = '移除结果待确认，请核对照片状态。'
    }
  } finally {
    if (current === generation) updatingPhoto.value = false
  }
}
async function confirmRemovePhoto() {
  const photo = asset.value
  if (photoBusy.value || !photo) return
  const epoch = session.getEpoch()
  const confirmed = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: '移除学生卡照片？',
      content: '下次提交申请前需要重新上传照片。',
      confirmText: '移除照片',
      cancelText: '保留照片',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  )
  if (confirmed && epoch === session.getEpoch() && asset.value?.asset_id === photo.asset_id)
    await removeCard(photo)
}
function openPhotoRecord() {
  photoPreviewError.value = ''
  photoRecordOpen.value = true
}
async function previewCard() {
  const photo = asset.value
  if (!photo || busy.value || photo.scan_status !== 'approved') return
  const current = generation
  const epoch = session.getEpoch()
  photoPreviewError.value = ''
  updatingPhoto.value = true
  try {
    const path = await downloadVerificationPhoto(photo.asset_id)
    if (
      current !== generation ||
      epoch !== session.getEpoch() ||
      photo.asset_id !== asset.value?.asset_id
    ) {
      // #ifdef MP-WEIXIN
      uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} })
      // #endif
      return
    }
    forgetPreview()
    cardPreview.value = path
    // #ifdef MP-WEIXIN
    previewingCard = true
    // #endif
    await uni.previewImage({ urls: [path], current: path })
  } catch {
    if (current === generation) {
      previewingCard = false
      forgetPreview()
      photoPreviewError.value = '暂时无法查看照片，请重试。'
    }
  } finally {
    if (current === generation) updatingPhoto.value = false
  }
}
async function queryAsset() {
  if (config.useMock || querying.value || busy.value || readingDraft.value) return
  const target = candidate.value
  if (!target) {
    await refreshDraft()
    return
  }
  const current = generation
  const epoch = session.getEpoch()
  const active = () => visible && current === generation && epoch === session.getEpoch()
  querying.value = true
  try {
    const result = await getStudentCardAsset(target.asset_id)
    if (!active()) return
    if (result.asset_id !== target.asset_id) throw new Error('资产状态无效')
    if (result.scan_status !== 'pending') {
      stopScanPolling()
      const draft = await refreshDraft(false)
      if (!active()) return
      if (!draft) {
        showScanProblem('暂时无法确认可用照片', '请重新读取照片。')
      } else if (
        result.scan_status !== target.scan_status &&
        (result.scan_status === 'approved'
          ? draft.active?.asset_id === result.asset_id
          : draft.candidate?.asset_id === result.asset_id)
      ) {
        showCardResult(result)
      }
    } else if (scanDeadline && Date.now() >= scanDeadline) {
      stopScanPolling()
      showScanProblem('扫描时间较长', '可以稍后回来查看，或手动刷新。')
    }
  } catch {
    if (!active()) return
    stopScanPolling()
    await refreshDraft(false)
    if (active()) showScanProblem('暂时无法查询扫描结果', '请稍后刷新。')
  } finally {
    if (current === generation) querying.value = false
  }
}
async function submitReal() {
  if (!canSubmitReal.value) return
  try {
    const input = verificationInput(name.value, studentNumber.value, asset.value, {
      state: reviewState.value,
      record: currentReview.value,
    })
    await sendSubmission({
      input,
      key: `verification-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请核对认证信息。'
  }
}
async function retrySubmission() {
  const command = pendingSubmission.value
  if (!command || busy.value || refreshing.value) return
  const current = generation
  const epoch = session.getEpoch()
  await refreshReview()
  if (current !== generation || epoch !== session.getEpoch() || pendingSubmission.value !== command)
    return
  if (reviewState.value === 'unknown') return
  const version =
    currentReview.value?.status === 'rejected' ? currentReview.value.version : undefined
  if (
    version !== command.input.expected_version ||
    !canMeAction(store.user, store.user?.id || '', 'postMeVerificationRequests', store.validated)
  ) {
    pendingSubmission.value = null
    error.value = '审核状态已变化，请核对当前申请后继续。'
    return
  }
  await sendSubmission(command)
}
async function sendSubmission(command: VerificationSubmission) {
  if (busy.value) return
  const current = generation
  const epoch = session.getEpoch()
  const isCurrent = () => visible && current === generation && epoch === session.getEpoch()
  submitting.value = true
  error.value = ''
  try {
    const review = await submitVerification(command.input, command.key)
    if (!isCurrent()) return
    acceptReview(review, epoch)
    pendingSubmission.value = null
    uni.$emit?.('app:notice', {
      message: '认证申请已受理',
      description: '请等待人工审核。',
      kind: 'success',
    })
    name.value = ''
    studentNumber.value = ''
    forgetPreview()
    asset.value = null
    candidate.value = null
    void store.refresh(false, true).catch(() => {})
  } catch (failure) {
    if (!isCurrent()) return
    const status = failure instanceof RequestError ? failure.statusCode || failure.code : 0
    pendingSubmission.value =
      status >= 400 && status < 500 && ![408, 429].includes(status) ? null : command
    if (failure instanceof RequestError && failure.error_code === 'VERSION_CONFLICT') {
      await refreshReview()
      if (isCurrent()) error.value = '审核记录已变化。请核对当前记录，如需再次申请，请手动提交。'
    } else if (failure instanceof RequestError && failure.error_code === 'ASSET_NOT_READY') {
      await refreshDraft(false)
      if (isCurrent()) error.value = '图片扫描尚未就绪，请刷新扫描结果。'
    } else if (status === 409) {
      error.value = '申请与当前账号或学号状态冲突，请核对学号并重新读取审核记录。'
    } else {
      error.value = pendingSubmission.value
        ? '申请结果待确认，可在当前页面确认上次申请。'
        : '申请未受理，请核对填写信息后重试。'
    }
  } finally {
    if (current === generation) submitting.value = false
  }
}
function scanDemo(status: 'approved' | 'rejected') {
  if (config.useMock && asset.value?.scan_status === 'pending') asset.value.scan_status = status
}
function submit() {
  return config.useMock ? submitDemo() : submitReal()
}
watch(
  () => store.user?.id,
  (id) => {
    clearPrivateData()
    if (id && visible && !config.useMock) void refreshPage()
  },
  { flush: 'sync' },
)
watch(
  () => wishReturn.active.value && currentReview.value?.status === 'pending',
  (pending) => {
    if (!config.useMock && visible && pending) reviewPoller.start(false)
    else reviewPoller.stop()
  },
)
function submitDemo() {
  if (!canSubmitDemo.value) return
  demoStatus.value = 'pending'
  demoMessage.value = '合成申请已受理，正在人工审核；此状态不表示学生认证通过。'
  name.value = ''
  studentNumber.value = ''
  asset.value = null
}
function reviewDemo(approved: boolean) {
  if (demoStatus.value !== 'pending') return
  demoStatus.value = approved ? 'approved' : 'rejected'
  demoMessage.value = approved
    ? '合成学生认证已通过。'
    : '合成驳回原因：资料无法确认。修改建议：重新选择清晰资料后提交。'
  store.simulate(approved ? 'verified' : 'rejected')
}
onShow(() => {
  visible = true
  if (previewingCard) {
    previewingCard = false
    forgetPreview()
    return
  }
  if (!config.useMock && !selectingCard) void refreshPage()
})
onHide(() => {
  if (selectingCard || previewingCard) return
  visible = false
  clearPrivateData()
})
onUnload(() => {
  selectingCard = false
  visible = false
  clearPrivateData()
})
onPullDownRefresh(async () => {
  try {
    await refreshPage()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage responsive-padding :hide-entry-guide="wishReturn.active.value">
    <canvas
      v-if="resizeCanvas"
      canvas-id="student-card-resize"
      class="resize-canvas"
      :style="{ width: resizeCanvas.width + 'px', height: resizeCanvas.height + 'px' }"
    />
    <PageHeading title="身份认证" />
    <view class="verification-layout">
      <view v-if="wishReturn.active.value" class="verification-card">
        <text class="verification-caption">认证通过后可继续操作心愿，也可先返回心愿详情。</text>
        <button
          class="ui-button"
          :disabled="uploading || submitting || wishReturn.returning.value"
          :loading="wishReturn.returning.value"
          @click="wishReturn.returnToWish"
        >
          返回心愿详情
        </button>
      </view>
      <text v-if="config.isDev && config.useMock" class="notice">
        合成演示 · 仅使用虚构学生资料。
      </text>
      <view v-if="!config.useMock && !store.isLoggedIn" class="verification-card">
        <text class="verification-title">登录后办理认证</text>
        <text class="verification-caption">登录后可提交申请及查看认证进度。</text>
        <LoginLink>微信登录</LoginLink>
      </view>
      <template v-else>
        <view
          v-if="
            applicationInReview || reviewState === 'unknown' || currentReview?.status === 'rejected'
          "
          class="verification-card"
        >
          <text class="verification-title">{{
            reviewStatus === 'approved'
              ? '学生认证已通过'
              : reviewStatus === 'pending'
                ? '待人工审核'
                : reviewStatus === 'rejected'
                  ? '认证申请未通过'
                  : refreshing
                    ? '正在读取认证进度…'
                    : '审核记录待确认'
          }}</text>
          <text v-if="reviewStatus === 'pending'" class="verification-caption">
            申请已提交，可稍后回来查看审核结果。
          </text>
          <text v-if="currentReview?.reason" class="verification-caption"
            >原因：{{ currentReview.reason }}</text
          >
          <text v-if="currentReview?.revision_suggestion" class="verification-caption">
            修改建议：{{ currentReview.revision_suggestion }}
          </text>
          <button
            v-if="!config.useMock && reviewStatus !== 'approved'"
            class="ui-button"
            :disabled="refreshing || busy || querying"
            :loading="refreshing && !submitting"
            @click="runPageAction(() => refreshReview(), 'verification-review-refresh')"
          >
            刷新审核进度
          </button>
        </view>
        <template v-if="canFillApplication">
          <StudentCardDraftPanel
            :photo="asset"
            :candidate="candidate"
            :scanned-at="scanDate"
            :disabled="photoBusy"
            :no-upload="!config.useMock && !canUpload"
            :uploading="uploading"
            :querying="querying"
            :scan-message="scanNotice"
            :choose-card="chooseCard"
            :query-asset="queryAsset"
            :cancel-replacement="() => removeCard(candidate)"
            @show-record="openPhotoRecord"
          />
          <view class="verification-card verification-fields">
            <text class="verification-title">学生信息</text>
            <label for="verification-name">姓名</label>
            <input
              id="verification-name"
              v-model="name"
              :maxlength="-1"
              class="ui-input"
              placeholder="请输入学生卡上的姓名"
              :disabled="busy || !!pendingSubmission"
            />
            <label for="verification-number">学号</label>
            <input
              id="verification-number"
              v-model="studentNumber"
              class="ui-input"
              :maxlength="-1"
              placeholder="4位年份＋8位数字"
              :disabled="busy || !!pendingSubmission"
            />
            <text v-if="studentNumberError" class="verification-field-error">{{
              studentNumberError
            }}</text>
            <text class="verification-caption">
              照片仅用于学生资格审核。离开后，姓名和学号需重新填写。
            </text>
          </view>
          <view v-if="config.isDev && config.useMock && asset?.scan_status === 'pending'">
            <button class="ui-button" @click="scanDemo('approved')">演示：扫描通过</button>
            <button class="ui-button" @click="scanDemo('rejected')">演示：扫描失败</button>
          </view>
          <button
            v-if="!pendingSubmission"
            class="ui-button ui-button-primary"
            :disabled="config.useMock ? !canSubmitDemo : !canSubmitReal"
            :loading="submitting"
            @click="runPageAction(() => submit(), 'verification-submit')"
          >
            {{ config.useMock ? '提交合成认证申请' : '提交认证申请' }}
          </button>
        </template>
        <button
          v-if="pendingSubmission"
          class="ui-button ui-button-primary"
          :disabled="busy || refreshing"
          :loading="refreshing && !submitting"
          @click="runPageAction(retrySubmission, 'verification-submit-retry')"
        >
          确认上次申请
        </button>
        <AppNotice :message="error" kind="error" />
        <template v-if="config.isDev && config.useMock">
          <text v-if="demoMessage" class="verification-caption">{{ demoMessage }}</text>
          <view v-if="demoStatus === 'pending'" class="verification-card">
            <button class="ui-button" @click="reviewDemo(false)">演示：人工驳回</button>
            <button class="ui-button" @click="reviewDemo(true)">演示：人工通过</button>
          </view>
        </template>
      </template>
    </view>
    <AppSheet
      v-if="photoRecordOpen && asset?.scan_status === 'approved'"
      title="照片与扫描记录"
      :busy="busy"
      @close="photoRecordOpen = false"
    >
      <view class="verification-record">
        <AppIcon name="shield" :size="52" />
        <text class="verification-title">安全扫描通过</text>
        <text v-if="scanDate" class="verification-caption">{{ scanDate }}</text>
        <text class="verification-caption">本张照片可用于本次认证。</text>
        <AppNotice :message="photoPreviewError" kind="error" />
        <button
          class="ui-button ui-button-primary"
          :disabled="busy"
          :loading="updatingPhoto"
          @click="previewCard"
        >
          查看原图
        </button>
        <button class="ui-button" :disabled="photoBusy" @click="confirmRemovePhoto">
          移除照片
        </button>
      </view>
    </AppSheet>
  </AppPage>
</template>
<style scoped>
.verification-layout,
.verification-card,
.verification-record {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 18rpx;
}
.verification-card {
  padding: 26rpx;
  border: 1px solid var(--theme-line);
  border-radius: 32rpx;
  background: var(--theme-surface);
}
.verification-title {
  font-size: 32rpx;
  font-weight: 700;
}
.verification-caption,
.verification-field-error {
  color: var(--theme-muted);
  font-size: 25rpx;
  line-height: 1.55;
}
.verification-field-error {
  color: var(--theme-danger);
}
.verification-fields label {
  font-size: 27rpx;
  font-weight: 650;
}
.verification-layout text,
.verification-layout button,
.verification-fields input,
.verification-record text,
.verification-record button {
  margin: 0;
}
.verification-record {
  padding-top: 22rpx;
}
.resize-canvas {
  position: fixed;
  left: -10000px;
  top: 0;
}
</style>
