<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { getVerification } from '@/api/auth'
import { RequestError } from '@/utils/request'
import { canMeAction, verificationInput } from '@/utils/actions'
import { uploadStudentCard, getStudentCardAsset, submitVerification } from '@/api/verification'
import type { StudentCardAsset, Verification } from '@/types/api'
import { session } from '@/utils/session'

const store = useUserStore()
const name = ref('')
const studentNumber = ref('')
const asset = ref<StudentCardAsset | null>(null)
const busy = ref(false)
const currentReview = ref<Verification | null>(null)
const reviewState = ref<'unknown' | 'absent' | 'present'>('unknown')
const refreshing = ref(false)
const querying = ref(false)
const assetEpoch = ref(-1)
const reviewEpoch = ref(-1)
const reviewOwner = ref('')
const error = ref('')
const canUpload = computed(() =>
  canMeAction(store.user, store.user?.id || '', 'postMeStudentCardAssets', store.validated),
)
const canSubmitReal = computed(
  () =>
    config.verificationWritesReady &&
    !busy.value &&
    !refreshing.value &&
    !querying.value &&
    canMeAction(store.user, store.user?.id || '', 'postMeVerificationRequests', store.validated) &&
    reviewEpoch.value === session.getEpoch() &&
    reviewOwner.value === store.user?.id &&
    assetEpoch.value === session.getEpoch() &&
    reviewState.value !== 'unknown' &&
    asset.value?.scan_status === 'approved',
)
const demoStatus = ref<'draft' | 'pending' | 'rejected' | 'approved'>('draft')
const demoMessage = ref('')
let generation = 0
let visible = false
const canSubmitDemo = computed(
  () =>
    config.useMock &&
    !!name.value.trim() &&
    !!studentNumber.value.trim() &&
    asset.value?.scan_status === 'approved' &&
    demoStatus.value !== 'pending' &&
    demoStatus.value !== 'approved',
)
function clearPrivateData() {
  generation++
  name.value = ''
  studentNumber.value = ''
  asset.value = null
  assetEpoch.value = -1
  reviewEpoch.value = -1
  reviewOwner.value = ''
  error.value = ''
  busy.value = false
  currentReview.value = null
  reviewState.value = 'unknown'
  refreshing.value = false
  querying.value = false
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
    await store.refresh()
    if (!isCurrent() || !store.isLoggedIn || !store.validated) return
    try {
      const review = await getVerification()
      if (!isCurrent()) return
      if (!Number.isInteger(review.version) || review.version < 1) throw new Error('审核版本无效')
      currentReview.value = review
      reviewState.value = 'present'
      reviewEpoch.value = epoch
      reviewOwner.value = store.user?.id || ''
    } catch (failure) {
      if (!isCurrent()) return
      if (failure instanceof RequestError && failure.code === 404) {
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
  busy.value = true
  try {
    const result = await new Promise<{ tempFilePaths: string | string[] }>((resolve, reject) => {
      uni.chooseImage({ count: 1, success: resolve, fail: reject })
    })
    if (!visible || current !== generation || epoch !== session.getEpoch() || !canUpload.value)
      return
    const path =
      typeof result.tempFilePaths === 'string' ? result.tempFilePaths : result.tempFilePaths[0]
    if (!path) return
    const uploaded = await uploadStudentCard(
      path,
      `card-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    if (visible && current === generation && epoch === session.getEpoch()) {
      asset.value = uploaded
      assetEpoch.value = epoch
    }
  } catch {
    if (visible && current === generation && epoch === session.getEpoch())
      error.value = '未完成选图或上传，请重试。'
  } finally {
    if (current === generation) busy.value = false
  }
}
// 暂用用户触发的单次查询，不猜测自动查询周期或恢复接口。
async function queryAsset() {
  if (config.useMock || querying.value || busy.value || !asset.value || !store.validated) return
  if (assetEpoch.value !== session.getEpoch()) {
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
  querying.value = true
  asset.value = { asset_id: id, scan_status: 'pending' }
  error.value = ''
  try {
    const result = await getStudentCardAsset(id)
    if (!isCurrent()) return
    if (result.asset_id !== id || !['pending', 'approved', 'rejected'].includes(result.scan_status))
      throw new Error('资产状态无效')
    asset.value = result
  } catch (failure) {
    if (!isCurrent()) return
    if (failure instanceof RequestError && (failure.code === 404 || failure.code === 401))
      asset.value = null
    error.value = '无法确认图片扫描结果，请重新查询或选择图片。'
  } finally {
    if (current === generation) querying.value = false
  }
}
async function submitReal() {
  if (!canSubmitReal.value) return
  const current = generation
  const epoch = session.getEpoch()
  const isCurrent = () => visible && current === generation && epoch === session.getEpoch()
  busy.value = true
  error.value = ''
  try {
    const input = verificationInput(name.value, studentNumber.value, asset.value, {
      state: reviewState.value,
      record: currentReview.value,
    })
    await submitVerification(
      input,
      `verification-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    if (!isCurrent()) return
    name.value = ''
    studentNumber.value = ''
    asset.value = null
    await refreshReview()
  } catch (failure) {
    if (!isCurrent()) return
    if (failure instanceof RequestError && failure.error_code === 'VERSION_CONFLICT') {
      await refreshReview()
      if (isCurrent()) error.value = '审核记录已变化，已重新读取，请确认后手动操作。'
    } else if (failure instanceof RequestError && failure.error_code === 'ASSET_NOT_READY') {
      if (asset.value) asset.value = { asset_id: asset.value.asset_id, scan_status: 'pending' }
      error.value = '图片扫描尚未就绪，请重新查询。'
    } else {
      reviewState.value = 'unknown'
      currentReview.value = null
      error.value = '申请未完成，请重新读取审核记录后操作。'
    }
  } finally {
    if (current === generation) busy.value = false
  }
}
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
  if (!config.useMock) void refreshReview()
})
onHide(() => {
  visible = false
  clearPrivateData()
})
onUnload(() => {
  visible = false
  clearPrivateData()
})
</script>
<template>
  <view class="page">
    <text class="title">学生认证</text>
    <text v-if="config.useMock" class="notice"
      >合成演示 · 请仅填写虚构资料，不选择或上传真实学生卡</text
    >
    <text v-else>学生卡仅用于学生资格审核。离开页面会清除已填写资料；待审不承诺完成时限。</text>
    <view class="card">
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
              ? '已读取当前认证申请记录。'
              : '当前审核记录尚未确认。'
        }}</text>
        <button
          :disabled="refreshing || busy || querying"
          :loading="refreshing"
          @click="refreshReview"
        >
          重新读取审核记录
        </button>
      </view>
      <text v-if="!config.useMock">认证提交服务待联调，当前不能完成真实申请。</text>
      <input
        v-model="name"
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
        placeholder="学号（演示时填写虚构学号）"
        :disabled="
          (!config.useMock && !config.verificationWritesReady) ||
          busy ||
          demoStatus === 'pending' ||
          demoStatus === 'approved'
        "
      />
      <button
        :disabled="
          busy ||
          querying ||
          (!config.useMock && !canUpload) ||
          (config.useMock && (demoStatus === 'pending' || demoStatus === 'approved'))
        "
        :loading="busy"
        @click="chooseCard"
      >
        {{ config.useMock ? '选择合成学生卡' : '选择并上传学生卡' }}
      </button>
      <text v-if="asset"
        >图片扫描状态：{{
          asset.scan_status === 'pending'
            ? '等待安全扫描'
            : asset.scan_status === 'approved'
              ? '安全扫描通过，尚未认证'
              : '安全扫描未通过，请重新选择'
        }}</text
      >
      <text v-if="asset?.scan_status === 'pending' && !config.useMock"
        >图片已受理，请手动查询扫描状态；安全扫描通过后仍须申请学生认证。</text
      >
      <button
        v-if="!config.useMock && asset"
        :disabled="querying || busy"
        :loading="querying"
        @click="queryAsset"
      >
        查询图片扫描状态
      </button>
      <view v-if="config.useMock && asset?.scan_status === 'pending'">
        <button @click="asset.scan_status = 'approved'">演示：扫描通过</button>
        <button @click="asset.scan_status = 'rejected'">演示：扫描失败</button>
      </view>
      <button
        :disabled="config.useMock ? !canSubmitDemo : !canSubmitReal"
        @click="config.useMock ? submitDemo() : submitReal()"
      >
        {{ config.useMock ? '提交合成认证申请' : '提交认证申请（待联调）' }}
      </button>
      <text v-if="error">{{ error }}</text>
      <text v-if="demoMessage">{{ demoMessage }}</text>
      <view v-if="config.useMock && demoStatus === 'pending'">
        <button @click="reviewDemo(false)">演示：人工驳回</button>
        <button @click="reviewDemo(true)">演示：人工通过</button>
      </view>
    </view>
  </view>
</template>
<style scoped lang="scss">
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
  background: white;
  border-radius: 20rpx;
}
text {
  display: block;
  margin-bottom: 20rpx;
}
input {
  padding: 24rpx 0;
  border-bottom: 1rpx solid #ddd;
}
button {
  margin-top: 20rpx;
}
.notice {
  padding: 20rpx;
  background: #fff1cc;
}
</style>
