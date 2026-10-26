<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { listWarnings, listAppeals, writeWarning, submitAppeal } from '@/api/safety'
import { ownPenaltyNotification } from '@/api/safety-targets'
import {
  checkSafetyPage,
  findSafetyItem,
  validWarning,
  warningConfirmable,
  acceptedSafety,
} from '@/utils/safety'
import type { Warning, Appeal, AppealInput } from '@/types/safety'

const user = useUserStore()
const appealLabels: Record<string, string> = {
  pending: '待复核',
  accepted: '已撤销处罚',
  rejected: '维持处罚',
}
const tab = ref<'warnings' | 'appeals'>('warnings')
const warnings = ref<Warning[]>([])
const appeals = ref<Appeal[]>([])
const selected = ref<Warning | null>(null)
const cursor = ref<string | null>(null)
const countdown = ref(0)
const penaltyId = ref('')
const targetPenalty = ref('')
const notificationId = ref('')
const warningSource = ref(false)
const body = ref('')
const readOwner = ref('')
const readEpoch = ref(-1)
const busy = ref(false)
const writing = ref(false)
const uncertain = ref(false)
const error = ref('')
const notice = ref('')
let visible = false
let generation = 0
let timer: ReturnType<typeof globalThis.setInterval> | undefined
let pending: { input: AppealInput; key: string } | null = null
const seen = new Set<string>()
const isScoped = () =>
  user.validated && readOwner.value === user.user?.id && readEpoch.value === session.getEpoch()
const scoped = computed(isScoped)
const warningRows = computed(() => (scoped.value ? warnings.value : []))
const appealRows = computed(() => (scoped.value ? appeals.value : []))
const activeWarning = computed(() => (scoped.value ? selected.value : null))
const permitted = (action: string) =>
  visible &&
  !config.useMock &&
  isScoped() &&
  !!session.getToken() &&
  !!user.user?.allowed_actions.includes(action)
const mayAck = computed(
  () =>
    !!activeWarning.value &&
    warningConfirmable(activeWarning.value) &&
    permitted('postMeWarningsIdAck'),
)
function stopTimer() {
  if (timer !== undefined) globalThis.clearInterval(timer)
  timer = undefined
}
function clear() {
  stopTimer()
  warnings.value = []
  appeals.value = []
  selected.value = null
  cursor.value = null
  countdown.value = 0
  penaltyId.value = ''
  body.value = ''
  readOwner.value = ''
  readEpoch.value = -1
  pending = null
  uncertain.value = false
  seen.clear()
}
function key() {
  return `safety-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
function selectWarning(warning: Warning) {
  stopTimer()
  selected.value = warning
  countdown.value = warning.remaining_seconds
  if (!warning.first_displayed_at || warning.remaining_seconds === 0 || warning.acknowledged_at)
    return
  const current = generation
  // 本地倒数不解锁确认；倒数结束后再次读取服务端时间与版本。
  timer = globalThis.setInterval(() => {
    if (!visible || current !== generation || !isScoped()) {
      stopTimer()
      return
    }
    countdown.value = Math.max(0, countdown.value - 1)
    if (countdown.value === 0) {
      stopTimer()
      void refreshWarning()
    }
  }, 1000)
}
function finish(current: number, write = false) {
  if (!visible || current !== generation) return
  if (write) writing.value = false
  else busy.value = false
  if (!isScoped()) clear()
}
async function load(more = false) {
  if (writing.value || uncertain.value || (more && (busy.value || !scoped.value || !cursor.value)))
    return
  const current = ++generation
  const owner = user.user?.id
  const epoch = session.getEpoch()
  const next = more ? cursor.value! : undefined
  const active = () =>
    visible && current === generation && owner === user.user?.id && epoch === session.getEpoch()
  if (!more) clear()
  error.value = ''
  notice.value = ''
  busy.value = false
  if (config.useMock || !owner || !session.getToken()) {
    error.value = '请登录并连接真实服务后查看警告与申诉。'
    return
  }
  busy.value = true
  try {
    await user.refresh(false)
    if (!active()) return
    readOwner.value = owner
    readEpoch.value = epoch
    if (!permitted(tab.value === 'warnings' ? 'getMeWarnings' : 'getMeAppeals'))
      throw new Error('当前不可读取')
    if (tab.value === 'warnings') {
      const page = await listWarnings(next)
      if (!active()) return
      checkSafetyPage(page)
      if (page.items.some((item) => !validWarning(item))) throw new Error('警告投影异常')
      warnings.value = [
        ...new Map(
          [...(more ? warnings.value : []), ...page.items].map((item) => [item.id, item]),
        ).values(),
      ]
      cursor.value = page.next_cursor
    } else {
      const page = await listAppeals(next)
      if (!active()) return
      checkSafetyPage(page)
      if (
        page.items.some(
          (item) =>
            !item.id ||
            !Number.isSafeInteger(item.version) ||
            item.version < 1 ||
            typeof item.status !== 'string',
        )
      )
        throw new Error('申诉投影异常')
      appeals.value = [
        ...new Map(
          [...(more ? appeals.value : []), ...page.items].map((item) => [item.id, item]),
        ).values(),
      ]
      cursor.value = page.next_cursor
      if (!more && targetPenalty.value && permitted('postMeAppeals')) {
        const owned = warningSource.value
          ? permitted('getMeWarnings') &&
            !!(await findSafetyItem(
              listWarnings,
              (w) => w.id === targetPenalty.value && validWarning(w),
              active,
            ))
          : await ownPenaltyNotification(notificationId.value, targetPenalty.value, active)
        if (!active()) return
        if (owned) penaltyId.value = targetPenalty.value
        else notice.value = '当前处罚引用无法核验，请从本人警告或处罚通知重新进入。'
      }
    }
    if (cursor.value) {
      if (seen.has(cursor.value)) throw new Error('列表游标重复')
      seen.add(cursor.value)
    }
  } catch {
    if (active()) {
      clear()
      error.value = '读取失败或当前无权访问，请刷新后重试。'
    }
  } finally {
    finish(current)
  }
}
async function refreshWarning() {
  if (busy.value || writing.value || !selected.value || !permitted('getMeWarnings')) return
  const warning = selected.value
  const current = generation
  const active = () => visible && current === generation && isScoped()
  busy.value = true
  error.value = ''
  try {
    const latest = await findSafetyItem(listWarnings, (item) => item.id === warning.id, active)
    if (!active()) return
    if (!latest) {
      selected.value = null
      warnings.value = warnings.value.filter((item) => item.id !== warning.id)
      stopTimer()
      notice.value = '警告状态已更新，请刷新列表。'
      return
    }
    if (!validWarning(latest)) throw new Error('警告时间异常')
    warnings.value = warnings.value.map((item) => (item.id === latest.id ? latest : item))
    selectWarning(latest)
  } catch {
    if (active()) {
      selected.value = null
      stopTimer()
      error.value = '确认时间核验失败，请刷新警告后重试。'
    }
  } finally {
    finish(current)
  }
}
async function warningAction(warning: Warning, action: 'display' | 'ack') {
  const permission = action === 'display' ? 'postMeWarningsIdDisplay' : 'postMeWarningsIdAck'
  if (
    busy.value ||
    writing.value ||
    !permitted(permission) ||
    !warnings.value.includes(warning) ||
    !validWarning(warning) ||
    (action === 'ack' && (selected.value !== warning || !mayAck.value))
  )
    return
  const current = generation
  const active = () => visible && current === generation && isScoped()
  writing.value = true
  error.value = ''
  notice.value = ''
  stopTimer()
  try {
    const result = await writeWarning(warning, action, key())
    if (!active()) return
    if (
      result.id !== warning.id ||
      !validWarning(result) ||
      (action === 'ack' && !result.acknowledged_at) ||
      (action === 'display' && !result.first_displayed_at)
    )
      throw new Error('警告回执异常')
    if (action === 'ack') {
      warnings.value = warnings.value.filter((item) => item.id !== warning.id)
      selected.value = null
      notice.value = '警告已确认；确认不代表解除其他处罚。'
    } else {
      warnings.value = warnings.value.map((item) => (item.id === warning.id ? result : item))
      selectWarning(result)
    }
  } catch {
    if (!active()) return
    writing.value = false
    await load()
    if (visible && scoped.value)
      notice.value = '警告状态或确认时间已变化，已重新读取，请手动核对；未自动重试。'
  } finally {
    finish(current, true)
  }
}
async function appeal() {
  if (busy.value || writing.value || !penaltyId.value || !permitted('postMeAppeals')) return
  if (!pending && !body.value.trim()) {
    error.value = '请填写申诉说明。'
    return
  }
  const current = generation
  const active = () => visible && current === generation && isScoped()
  writing.value = true
  error.value = ''
  notice.value = ''
  try {
    if (!pending) {
      const input = { penalty_id: penaltyId.value, body: body.value }
      const confirmed = await new Promise<boolean>((resolve) =>
        uni.showModal({
          title: '确认申诉',
          content: '提交后等待平台复核，受理不代表撤销处罚。是否提交？',
          success: (result) => resolve(result.confirm),
          fail: () => resolve(false),
        }),
      )
      if (!confirmed || !active() || !permitted('postMeAppeals')) return
      pending = { input, key: key() }
    }
    if (!active() || !permitted('postMeAppeals')) return
    const result = await submitAppeal(pending.input, pending.key)
    if (!active()) return
    if (!acceptedSafety(result)) throw new Error('申诉回执异常')
    pending = null
    uncertain.value = false
    body.value = ''
    targetPenalty.value = ''
    penaltyId.value = ''
    writing.value = false
    await load()
    if (visible && scoped.value) notice.value = '申诉已受理，等待复核；当前处罚仍以服务端状态为准。'
  } catch (failure) {
    if (!active()) return
    if (failure instanceof RequestError && failure.statusCode >= 400 && failure.statusCode < 500) {
      pending = null
      uncertain.value = false
      writing.value = false
      await load()
      if (visible && scoped.value) notice.value = '处罚或权限状态已变化，请核对后手动操作。'
    } else {
      uncertain.value = true
      error.value = '结果尚未确认，重试将复用原申诉内容和幂等键。'
    }
  } finally {
    finish(current, true)
  }
}
function selectTab(value: 'warnings' | 'appeals') {
  if (busy.value || writing.value || uncertain.value) return
  tab.value = value
  void load()
}
function openAppeal(warning: Warning) {
  if (
    busy.value ||
    writing.value ||
    !scoped.value ||
    !warnings.value.includes(warning) ||
    !permitted('postMeAppeals')
  )
    return
  targetPenalty.value = warning.id
  warningSource.value = true
  notificationId.value = ''
  selectTab('appeals')
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
    targetPenalty.value = ''
    notificationId.value = ''
    busy.value = false
    writing.value = false
  },
  { flush: 'sync' },
)
onLoad((query) => {
  if (query?.tab === 'appeals') tab.value = 'appeals'
  targetPenalty.value = typeof query?.penaltyId === 'string' ? query.penaltyId : ''
  notificationId.value = typeof query?.notificationId === 'string' ? query.notificationId : ''
})
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <AppPage>
    <text class="title">警告与申诉</text>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
    <text v-if="scoped && user.user?.penalty_notice">{{ user.user.penalty_notice }}</text>
    <button
      :disabled="busy || writing || uncertain"
      @click="runPageAction(() => selectTab('warnings'))"
    >
      本人警告
    </button>
    <button
      :disabled="busy || writing || uncertain"
      @click="runPageAction(() => selectTab('appeals'))"
    >
      本人申诉
    </button>
    <button :disabled="busy || writing || uncertain" @click="runPageAction(() => load())">
      刷新
    </button>
    <template v-if="tab === 'warnings'">
      <text v-if="scoped && !busy && !warningRows.length">暂无未确认警告</text>
      <view v-for="warning in warningRows" :key="warning.id" class="card">
        <text>{{ warning.notice }}</text>
        <button
          :disabled="busy || writing || !permitted('postMeWarningsIdDisplay')"
          @click="runPageAction(() => warningAction(warning, 'display'))"
        >
          阅读警告并核验计时
        </button>
        <template v-if="activeWarning?.id === warning.id">
          <text>首次展示：{{ warning.first_displayed_at }}</text>
          <text>可确认时间：{{ warning.confirmable_at }}</text>
          <text>约剩 {{ countdown }} 秒；确认资格以服务端时间为准，重新进入不重置计时。</text>
          <button :disabled="busy || writing" @click="runPageAction(() => refreshWarning())">
            核对服务端确认时间
          </button>
          <button
            :disabled="busy || writing || !mayAck"
            @click="runPageAction(() => warningAction(warning, 'ack'))"
          >
            已阅读并确认
          </button>
        </template>
        <button
          :disabled="busy || writing || !permitted('postMeAppeals')"
          @click="runPageAction(() => openAppeal(warning))"
        >
          对此警告申诉
        </button>
      </view>
    </template>
    <template v-else>
      <view v-if="scoped && penaltyId" class="card">
        <text>针对当前核验的本人处罚提交申诉。受理不会自动解除处罚。</text>
        <textarea
          v-model="body"
          placeholder-class="field-placeholder"
          :maxlength="-1"
          :disabled="writing || uncertain"
          placeholder="请填写申诉说明"
        />
        <button
          :disabled="busy || writing || !permitted('postMeAppeals')"
          @click="runPageAction(() => appeal())"
        >
          {{ uncertain ? '重试同一次申诉' : '提交申诉' }}
        </button>
      </view>
      <text v-if="scoped && !penaltyId">从本人警告或处罚通知进入，可针对对应处罚提交申诉。</text>
      <text v-if="uncertain">离开页面将清除未确认内容，请避免重复新建申诉。</text>
      <view v-for="(item, index) in appealRows" :key="item.id" class="card">
        <text>申诉 {{ index + 1 }}：{{ appealLabels[item.status] || '状态待核对' }}</text>
        <text v-if="item.reason">处理说明：{{ item.reason }}</text>
      </view>
      <text v-if="scoped && !busy && !appealRows.length">暂无申诉记录</text>
    </template>
    <button
      v-if="scoped && cursor"
      :disabled="busy || writing || uncertain"
      @click="runPageAction(() => load(true))"
    >
      加载下一页
    </button>
    <navigator url="/pages/inbox/index">查看处罚通知</navigator>
    <text v-if="notice">{{ notice }}</text>
    <text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
