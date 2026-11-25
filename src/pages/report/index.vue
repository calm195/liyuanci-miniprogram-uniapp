<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import { onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
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
    if (
      failure instanceof RequestError &&
      failure.statusCode >= 400 &&
      failure.statusCode < 500 &&
      ![408, 429].includes(failure.statusCode)
    ) {
      pending = null
      uncertain.value = false
      writing.value = false
      await load()
      if (visible && isScoped()) notice.value = '权限、类型或目标状态已变化，请核对后手动提交。'
    } else {
      uncertain.value = true
      error.value = '尚未确认是否受理，可重试这次举报。'
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
onPullDownRefresh(async () => {
  try {
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading title="举报与反馈" description="请选择举报类型，可补充具体情况。" />
    <LoginLink v-if="!user.isLoggedIn" class="ui-link">前往登录</LoginLink>
    <button
      class="ui-button"
      :disabled="busy || writing || uncertain"
      :loading="isPageActionPending('pages-report-index-button-1')"
      @click="runPageAction(() => load(), 'pages-report-index-button-1')"
    >
      重新核验
    </button>
    <view v-if="ready && scoped" class="ui-section ui-stack">
      <button
        v-for="item in types"
        :key="item.code"
        class="ui-button"
        :disabled="writing || uncertain || finished"
        :loading="isPageActionPending('pages-report-index-button-2' + ':' + item.code)"
        @click="
          runPageAction(() => (code = item.code), 'pages-report-index-button-2' + ':' + item.code)
        "
      >
        {{ code === item.code ? '已选：' : '' }}{{ item.label }}
      </button>
      <text v-if="!types.length" class="ui-copy">暂无已发布的举报类型</text>
      <textarea
        v-model="description"
        class="ui-textarea"
        placeholder-class="field-placeholder"
        :maxlength="-1"
        :disabled="writing || uncertain || finished"
        placeholder="补充说明（可不填）"
      />
      <button
        class="ui-button ui-button-primary"
        :disabled="busy || writing || !maySubmit"
        :loading="isPageActionPending('pages-report-index-button-3')"
        @click="runPageAction(() => submit(), 'pages-report-index-button-3')"
      >
        {{ uncertain ? '重试同一次举报' : '提交举报' }}
      </button>
    </view>
    <text v-if="uncertain" class="ui-copy">离开页面将清除本次未确认内容，请避免另行重复提交。</text>
    <AppNotice :message="notice" kind="info" />
    <AppNotice :message="error" kind="error" />
  </AppPage>
</template>
