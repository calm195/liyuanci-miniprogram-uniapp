<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { getVerification } from '@/api/auth'
import { RequestError } from '@/utils/request'
import { canMeAction, validStudentNumber, verificationInput } from '@/utils/actions'
import { uploadStudentCard, getStudentCardAsset, submitVerification } from '@/api/verification'
import type { StudentCardAsset, Verification } from '@/types/api'
import { session } from '@/utils/session'
import { createVisiblePoller } from '@/utils/visible-poller'

const store = useUserStore()
const name = ref('')
const studentNumber = ref('')
const asset = ref<StudentCardAsset | null>(null)
const uploading = ref(false)
const resizeCanvas = shallowRef<{ width: number; height: number } | null>(null)
const submitting = ref(false)
// 各动作单独显示进度；共享互斥只用于禁止并行写入，不能让无关按钮同时转圈。
const busy = computed(() => uploading.value || submitting.value)
const currentReview = ref<Verification | null>(null)
const reviewState = ref<'unknown' | 'absent' | 'present'>('unknown')
const refreshing = ref(false)
const querying = ref(false)
const scanNotice = ref('')
const scanPoller = createVisiblePoller(() => queryAsset())
let scanDeadline = 0
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
    !!name.value.trim() &&
    validStudentNumber(studentNumber.value) &&
    !busy.value &&
    !refreshing.value &&
    !querying.value &&
    canMeAction(store.user, store.user?.id || '', 'postMeVerificationRequests', store.validated) &&
    reviewEpoch.value === session.getEpoch() &&
    reviewOwner.value === store.user?.id &&
    assetEpoch.value === session.getEpoch() &&
    (reviewState.value === 'absent' || currentReview.value?.status === 'rejected') &&
    asset.value?.scan_status === 'approved',
)
const demoStatus = ref<'draft' | 'pending' | 'rejected' | 'approved'>('draft')
const demoMessage = ref('')
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
function stopScanPolling() {
  scanPoller.stop()
  scanDeadline = 0
}
function showScanProblem(title: string, content: string) {
  scanNotice.value = content
  uni.$emit?.('app:notice', { message: `${title}：${content}`, kind: 'warning' })
}
function clearPrivateData() {
  stopScanPolling()
  scanNotice.value = ''
  generation++
  resizeCanvas.value = null
  name.value = ''
  studentNumber.value = ''
  asset.value = null
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
}
// 审核记录独立读取；本人资格和资产扫描都不能替代审核记录版本。
async function refreshReview() {
  if (refreshing.value) return
  const current = generation
  const epoch = session.getEpoch()
  const isCurrent = () => visible && current === generation && epoch === session.getEpoch()
  refreshing.value = true
  currentReview.value = null
  reviewState.value = 'unknown'
  error.value = ''
  try {
    await store.refresh(false, true)
    if (!isCurrent() || !store.isLoggedIn) return
    try {
      const review = await getVerification(true)
      if (!isCurrent()) return
      acceptReview(review, epoch)
    } catch (failure) {
      if (!isCurrent()) return
      if (failure instanceof RequestError && (failure.statusCode || failure.code) === 404) {
        reviewState.value = 'absent'
        reviewEpoch.value = epoch
        reviewOwner.value = store.user?.id || ''
      } else throw failure
    }
  } catch {
    if (isCurrent()) error.value = '无法确认当前审核记录，请重新读取；不能据此作为首次申请。'
  } finally {
    if (visible && current === generation) refreshing.value = false
  }
}
function showCardResult(result: StudentCardAsset) {
  if (result.scan_status === 'approved') {
    scanNotice.value = '图片扫描通过：请填写姓名和学号，然后点击「提交认证申请」，等待人工审核。'
    uni.$emit?.('app:notice', { message: scanNotice.value, kind: 'success' })
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
  if (busy.value || querying.value) return
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
      asset.value = uploaded
      assetEpoch.value = epoch
      scanNotice.value = ''
      stopScanPolling()
      showCardResult(uploaded)
      // 自动查询只在本页本次上传后运行，到期后保留手动查询入口。
      if (uploaded.scan_status === 'pending') {
        uni.$emit?.('app:notice', { message: '图片已受理，等待安全扫描。', kind: 'success' })
        scanDeadline = Date.now() + 120_000
        scanPoller.start()
      }
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
async function queryAsset() {
  if (config.useMock || querying.value || busy.value || !asset.value) return
  if (assetEpoch.value !== session.getEpoch()) {
    stopScanPolling()
    asset.value = null
    return
  }
  const id = asset.value.asset_id
  const current = generation
  const epoch = session.getEpoch()
  const isCurrent = () =>
    visible &&
    current === generation &&
    epoch === session.getEpoch() &&
    asset.value?.asset_id === id
  const previousStatus = asset.value.scan_status
  querying.value = true
  scanNotice.value = ''
  try {
    const result = await getStudentCardAsset(id)
    if (!isCurrent()) return
    if (result.asset_id !== id || !['pending', 'approved', 'rejected'].includes(result.scan_status))
      throw new Error('资产状态无效')
    asset.value = result
    if (result.scan_status !== 'pending') {
      stopScanPolling()
      if (result.scan_status !== previousStatus) showCardResult(result)
    } else if (scanDeadline && Date.now() >= scanDeadline) {
      stopScanPolling()
      showScanProblem('图片扫描时间较长', '暂未收到扫描结果，可以稍后点击「查询图片扫描状态」。')
    } else if (!scanDeadline) {
      scanNotice.value = '仍未收到扫描结果，可以稍后再次查询。'
    }
  } catch (failure) {
    if (!isCurrent()) return
    stopScanPolling()
    const status = failure instanceof RequestError ? failure.statusCode || failure.code : 0
    if (status === 404 || status === 401) asset.value = null
    const message =
      status === 503
        ? '安全扫描服务暂未能完成处理。请稍后查询，若仍失败，请重新上传图片。'
        : status === 404
          ? '这张图片已无法查询，请重新上传。'
          : status === 401
            ? '登录状态已失效，请重新登录后上传图片。'
            : '暂时无法查询扫描结果，请检查网络后重试。'
    showScanProblem('图片扫描查询未完成', message)
  } finally {
    if (current === generation) querying.value = false
  }
}
async function submitReal() {
  if (!canSubmitReal.value) return
  const current = generation
  const epoch = session.getEpoch()
  const isCurrent = () => visible && current === generation && epoch === session.getEpoch()
  submitting.value = true
  error.value = ''
  try {
    const input = verificationInput(name.value, studentNumber.value, asset.value, {
      state: reviewState.value,
      record: currentReview.value,
    })
    const review = await submitVerification(
      input,
      `verification-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    if (!isCurrent()) return
    // POST 回执已确认审核记录；本人资格刷新失败也不能覆盖已受理状态。
    acceptReview(review, epoch)
    uni.$emit?.('app:notice', { message: '认证申请已受理，等待人工审核。', kind: 'success' })
    name.value = ''
    studentNumber.value = ''
    asset.value = null
    void store.refresh(false, true).catch(() => {})
  } catch (failure) {
    if (!isCurrent()) return
    if (failure instanceof RequestError && failure.error_code === 'VERSION_CONFLICT') {
      await refreshReview()
      if (isCurrent()) error.value = '审核记录已变化，已重新读取，请确认后手动操作。'
    } else if (failure instanceof RequestError && failure.error_code === 'ASSET_NOT_READY') {
      if (asset.value) asset.value = { asset_id: asset.value.asset_id, scan_status: 'pending' }
      error.value = '图片扫描尚未就绪，请重新查询。'
    } else {
      error.value =
        failure instanceof RequestError && (failure.statusCode || failure.code) === 409
          ? '申请与当前账号或学号状态冲突，请核对学号并重新读取审核记录。'
          : '未能确认本次申请结果，请重新读取审核记录后再试。'
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
    if (id && visible && !config.useMock) void refreshReview()
  },
  { flush: 'sync' },
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
  if (!config.useMock && !selectingCard) void refreshReview()
})
onHide(() => {
  if (selectingCard) return
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
    await refreshReview()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage>
    <canvas
      v-if="resizeCanvas"
      canvas-id="student-card-resize"
      class="resize-canvas"
      :style="{ width: resizeCanvas.width + 'px', height: resizeCanvas.height + 'px' }"
    />
    <text class="title">学生认证</text>
    <text v-if="config.useMock" class="notice"
      >合成演示 · 请仅填写虚构资料，不选择或上传真实学生卡</text
    >
    <text v-else>学生卡仅用于学生资格审核。离开页面会清除已填写资料；待审不承诺完成时限。</text>
    <view class="card">
      <text v-if="uploading || submitting || refreshing || querying" class="notice">{{
        uploading
          ? '正在准备或上传学生卡，其他操作暂不可用。'
          : submitting
            ? '正在提交认证申请，其他操作暂不可用。'
            : refreshing
              ? '正在读取审核记录，请稍候。'
              : '正在查询图片扫描状态，请稍候。'
      }}</text>
      <text>账号状态：{{ store.label }}</text>
      <text v-if="(config.useMock ? store.verification : currentReview)?.reason">
        驳回原因：{{ (config.useMock ? store.verification : currentReview)?.reason }}
      </text>
      <text v-if="(config.useMock ? store.verification : currentReview)?.revision_suggestion"
        >修改建议：{{
          (config.useMock ? store.verification : currentReview)?.revision_suggestion
        }}</text
      >
      <view v-if="!config.useMock">
        <text>{{
          reviewState === 'absent'
            ? '当前没有认证申请记录。'
            : reviewState === 'present'
              ? currentReview?.status === 'pending'
                ? '认证申请已提交，等待人工审核。'
                : currentReview?.status === 'approved'
                  ? '学生认证已通过。'
                  : '认证申请已驳回，可更正后重新提交。'
              : refreshing
                ? ''
                : '当前审核记录尚未确认，请重新读取。'
        }}</text>
        <button
          :disabled="refreshing || busy || querying"
          :loading="refreshing && !submitting"
          @click="runPageAction(() => refreshReview(), 'pages-verification-index-button-1')"
        >
          重新读取审核记录
        </button>
      </view>
      <text v-if="!config.useMock && !config.verificationWritesReady">认证提交暂未开放。</text>
      <input
        v-model="name"
        placeholder-class="field-placeholder"
        :maxlength="-1"
        placeholder="姓名（演示时填写虚构姓名）"
        :disabled="
          (!config.useMock && !config.verificationWritesReady) ||
          busy ||
          demoStatus === 'pending' ||
          demoStatus === 'approved'
        "
      />
      <input
        v-model="studentNumber"
        :class="{ 'student-number-invalid': studentNumberError }"
        placeholder-class="field-placeholder"
        :maxlength="-1"
        placeholder="学号：4位年份＋8位数字"
        :disabled="
          (!config.useMock && !config.verificationWritesReady) ||
          busy ||
          demoStatus === 'pending' ||
          demoStatus === 'approved'
        "
      />
      <text v-if="studentNumberError" class="error">{{ studentNumberError }}</text>
      <button
        :disabled="
          busy ||
          querying ||
          (!config.useMock && !canUpload) ||
          (config.useMock && (demoStatus === 'pending' || demoStatus === 'approved'))
        "
        :loading="uploading"
        @click="runPageAction(() => chooseCard(), 'pages-verification-index-button-2')"
      >
        {{ config.useMock ? '选择合成学生卡' : '选择并上传学生卡' }}
      </button>
      <text v-if="!config.useMock && !asset && !busy">
        请选择清晰的 PNG/JPEG 图片，大图会自动缩小。上传成功后显示扫描查询按钮。
      </text>
      <text v-if="!asset && scanNotice">{{ scanNotice }}</text>
      <text v-if="asset"
        >图片扫描状态：{{
          asset.scan_status === 'pending'
            ? scanNotice || '等待安全扫描'
            : asset.scan_status === 'approved'
              ? '安全扫描通过，请提交认证申请'
              : '安全扫描未通过，请重新选择'
        }}</text
      >
      <text v-if="asset?.scan_status === 'pending' && !config.useMock && !scanNotice"
        >图片已受理，正在自动查询扫描状态。安全扫描通过后仍须提交认证申请。</text
      >
      <button
        v-if="!config.useMock && asset"
        :disabled="querying || busy"
        :loading="querying"
        @click="runPageAction(() => queryAsset(), 'pages-verification-index-button-3')"
      >
        查询图片扫描状态
      </button>
      <view v-if="config.useMock && asset?.scan_status === 'pending'">
        <button
          @click="runPageAction(() => scanDemo('approved'), 'pages-verification-index-button-4')"
        >
          演示：扫描通过
        </button>
        <button
          @click="runPageAction(() => scanDemo('rejected'), 'pages-verification-index-button-5')"
        >
          演示：扫描失败
        </button>
      </view>
      <button
        :disabled="config.useMock ? !canSubmitDemo : !canSubmitReal"
        :loading="submitting"
        @click="runPageAction(() => submit(), 'pages-verification-index-button-6')"
      >
        {{ config.useMock ? '提交合成认证申请' : '提交认证申请' }}
      </button>
      <AppNotice :message="error" kind="error" />
      <text v-if="demoMessage">{{ demoMessage }}</text>
      <view v-if="config.useMock && demoStatus === 'pending'">
        <button
          @click="runPageAction(() => reviewDemo(false), 'pages-verification-index-button-7')"
        >
          演示：人工驳回
        </button>
        <button @click="runPageAction(() => reviewDemo(true), 'pages-verification-index-button-8')">
          演示：人工通过
        </button>
      </view>
    </view>
  </AppPage>
</template>

<style scoped>
.resize-canvas {
  position: fixed;
  left: -10000px;
  top: 0;
}
input.student-number-invalid {
  border-color: var(--theme-danger);
}
</style>
