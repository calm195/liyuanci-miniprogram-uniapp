<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { uploadStudentCard } from '@/api/verification'
import type { StudentCardAsset } from '@/types/api'
import { session } from '@/utils/session'

const store = useUserStore()
const name = ref('')
const studentNumber = ref('')
const asset = ref<StudentCardAsset | null>(null)
const busy = ref(false)
const error = ref('')
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
  error.value = ''
  busy.value = false
}
async function chooseCard() {
  if (busy.value) return
  error.value = ''
  if (config.useMock) {
    asset.value = { asset_id: 'synthetic-card', scan_status: 'pending' }
    demoMessage.value = '合成图片已受理，等待安全扫描。'
    return
  }
  if (!store.isLoggedIn || !store.validated) {
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
    if (!visible || current !== generation || epoch !== session.getEpoch()) return
    const path =
      typeof result.tempFilePaths === 'string' ? result.tempFilePaths : result.tempFilePaths[0]
    if (!path) return
    const uploaded = await uploadStudentCard(
      path,
      `card-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    if (visible && current === generation && epoch === session.getEpoch()) asset.value = uploaded
  } catch {
    if (visible && current === generation) error.value = '未完成选图或上传，请重试。'
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
  if (!config.useMock) void store.refresh().catch(() => {})
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
      <text v-if="store.verification?.reason">驳回原因：{{ store.verification.reason }}</text>
      <text v-if="store.verification?.revision_suggestion"
        >修改建议：{{ store.verification.revision_suggestion }}</text
      >
      <text v-if="!config.useMock">认证提交服务待联调，当前不能完成真实申请。</text>
      <input
        v-model="name"
        placeholder="姓名（演示时填写虚构姓名）"
        :disabled="!config.useMock || demoStatus === 'pending' || demoStatus === 'approved'"
      />
      <input
        v-model="studentNumber"
        placeholder="学号（演示时填写虚构学号）"
        :disabled="!config.useMock || demoStatus === 'pending' || demoStatus === 'approved'"
      />
      <button
        :disabled="
          busy || (config.useMock && (demoStatus === 'pending' || demoStatus === 'approved'))
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
        >图片已受理；扫描状态同步能力待接入，请勿将受理视为扫描或认证通过。</text
      >
      <view v-if="config.useMock && asset?.scan_status === 'pending'">
        <button @click="asset.scan_status = 'approved'">演示：扫描通过</button>
        <button @click="asset.scan_status = 'rejected'">演示：扫描失败</button>
      </view>
      <button :disabled="!canSubmitDemo" @click="submitDemo">
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
