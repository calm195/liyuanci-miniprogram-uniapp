<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { listReportTypes, submitReport } from '@/api/safety'
import { readableReportTarget } from '@/api/safety-targets'
import { findSafetyItem, acceptedSafety } from '@/utils/safety'
import type { ReportKind, ReportType, ReportInput } from '@/types/safety'

const user = useUserStore()
const kind = ref<ReportKind | ''>('')
const id = ref('')
const contextId = ref('')
const types = ref<ReportType[]>([])
const code = ref('')
const description = ref('')
const ready = ref(false)
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const notice = ref('')
const uncertain = ref(false)
const finished = ref(false)
let pending: { input: ReportInput; key: string } | null = null
let visible = false
let generation = 0
const owner = ref('')
const epoch = ref(-1)
const isScoped = () =>
  user.validated && user.user?.id === owner.value && session.getEpoch() === epoch.value
const scoped = computed(isScoped)
const allowed = () =>
  !config.useMock &&
  visible &&
  isScoped() &&
  !!session.getToken() &&
  user.user?.allowed_actions.includes('postReports') &&
  user.user.allowed_actions.includes('getReportTypes')
const maySubmit = computed(
  () =>
    allowed() &&
    ready.value &&
    !finished.value &&
    types.value.some((item) => item.code === code.value),
)
function clear() {
  types.value = []
  code.value = ''
  description.value = ''
  ready.value = false
  pending = null
  uncertain.value = false
  finished.value = false
  owner.value = ''
  epoch.value = -1
}
function finish(current: number, write = false) {
  if (!visible || current !== generation) return
  if (write) writing.value = false
  else busy.value = false
  if (!isScoped()) clear()
}
async function load() {
  if (writing.value || uncertain.value) return
  const current = ++generation
  clear()
  error.value = ''
  notice.value = ''
  busy.value = false
  const account = user.user?.id
  const sessionEpoch = session.getEpoch()
  const active = () =>
    visible &&
    current === generation &&
    account === user.user?.id &&
    sessionEpoch === session.getEpoch()
  if (config.useMock || !account || !session.getToken()) {
    error.value = '请登录并连接真实服务后举报。'
    return
  }
  busy.value = true
  try {
    await user.refresh(false)
    if (!active()) return
    owner.value = account
    epoch.value = sessionEpoch
    if (!allowed() || !kind.value) throw new Error('当前不可举报')
    const collected: ReportType[] = []
    await findSafetyItem(
      listReportTypes,
      (item) => {
        if (!item || !item.code || !item.label) throw new Error('举报类型异常')
        if (!collected.some((old) => old.code === item.code)) collected.push(item)
        return false
      },
      active,
    )
    if (!active()) return
    const readable = await readableReportTarget(kind.value, id.value, contextId.value, active)
    if (!active()) return
    if (!readable || !allowed()) throw new Error('目标当前不可访问')
    types.value = collected
    ready.value = true
  } catch {
    if (active()) {
      clear()
      error.value = '举报对象或类型不可读取，请核对当前权限后重试。'
    }
  } finally {
    finish(current)
  }
}
async function submit() {
  if (busy.value || writing.value || !maySubmit.value || !kind.value) return
  const current = generation
  const active = () => visible && current === generation && isScoped()
  writing.value = true
  error.value = ''
  notice.value = ''
  try {
    if (!pending) {
      const input: ReportInput = {
        target_kind: kind.value,
        id: id.value,
        type_code: code.value,
        ...(description.value ? { description: description.value } : {}),
      }
      const confirmed = await new Promise<boolean>((resolve) =>
        uni.showModal({
          title: '确认举报',
          content: '举报仅表示提交线索，受理不代表已认定违规。是否提交？',
          success: (result) => resolve(result.confirm),
          fail: () => resolve(false),
        }),
      )
      if (!confirmed || !active() || !allowed()) return
      pending = { input, key: `report-${Date.now()}-${Math.random().toString(36).slice(2)}` }
    }
    if (!active() || !allowed()) return
    const result = await submitReport(pending.input, pending.key)
    if (!active()) return
    if (!acceptedSafety(result)) throw new Error('受理回执异常')
    pending = null
    uncertain.value = false
    finished.value = true
    description.value = ''
    notice.value = '举报已受理，等待处理；这不代表已认定违规或永久保存证据。'
  } catch (failure) {
    if (!active()) return
    if (failure instanceof RequestError && failure.statusCode >= 400 && failure.statusCode < 500) {
      pending = null
      uncertain.value = false
      writing.value = false
      await load()
      if (visible && isScoped()) notice.value = '权限、类型或目标状态已变化，请核对后手动提交。'
    } else {
      uncertain.value = true
      error.value = '结果尚未确认，重试将复用原内容和幂等键，请勿重复新建举报。'
    }
  } finally {
    finish(current, true)
  }
}
function leave() {
  visible = false
  generation++
  clear()
  busy.value = false
  writing.value = false
  error.value = ''
  notice.value = ''
}
watch(
  () => user.user?.id,
  () => {
    generation++
    clear()
    busy.value = false
    writing.value = false
  },
  { flush: 'sync' },
)
onLoad((query) => {
  const value = query?.kind
  kind.value = ['wish', 'story', 'application', 'message'].includes(String(value))
    ? (value as ReportKind)
    : ''
  id.value = typeof query?.id === 'string' ? query.id : ''
  contextId.value = typeof query?.contextId === 'string' ? query.contextId : ''
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
    <text class="title">举报内容</text>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
    <text>举报受理后由平台核查，请选择类型并说明情况。</text>
    <button :disabled="busy || writing || uncertain" @click="load">重新核验</button>
    <view v-if="ready && scoped" class="card">
      <button
        v-for="item in types"
        :key="item.code"
        :disabled="writing || uncertain || finished"
        @click="code = item.code"
      >
        {{ code === item.code ? '已选：' : '' }}{{ item.label }}
      </button>
      <text v-if="!types.length">暂无已发布的举报类型</text>
      <textarea
        v-model="description"
        :maxlength="-1"
        :disabled="writing || uncertain || finished"
        placeholder="补充说明（可不填）"
      />
      <button :disabled="busy || writing || !maySubmit" @click="submit">
        {{ uncertain ? '重试同一次举报' : '提交举报' }}
      </button>
    </view>
    <text v-if="uncertain">离开页面将清除本次未确认内容，请避免另行重复提交。</text>
    <text v-if="notice">{{ notice }}</text>
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
  background: white;
  border-radius: 20rpx;
}
text {
  display: block;
  margin: 20rpx 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
button {
  margin-top: 16rpx;
}
textarea {
  width: 100%;
  padding: 20rpx 0;
}
.error {
  color: #b42318;
}
</style>
