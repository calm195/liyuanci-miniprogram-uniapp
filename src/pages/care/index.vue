<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { getCareCard } from '@/api/care'
import { listNotifications } from '@/api/chat'
import { careTarget, mergeCareNotifications, projectCareCard } from '@/utils/care'
import type { CareCard } from '@/types/care'
import type { AppNotification } from '@/types/chat'

const user = useUserStore()
const id = ref('')
const card = ref<CareCard | null>(null)
const notifications = ref<AppNotification[]>([])
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const loaded = ref(false)
const owner = ref('')
const epoch = ref(-1)
const scoped = computed(
  () => user.validated && owner.value === user.user?.id && epoch.value === session.getEpoch(),
)
const currentCard = computed(() => (scoped.value ? card.value : null))
const rows = computed(() => (scoped.value ? notifications.value : []))
const seen = new Set<string>()
let visible = false
let generation = 0
function clear() {
  card.value = null
  notifications.value = []
  cursor.value = null
  owner.value = ''
  epoch.value = -1
  loaded.value = false
  seen.clear()
}
async function load(more = false) {
  if (more && (busy.value || !scoped.value || !cursor.value || id.value)) return
  const next = more ? cursor.value! : undefined
  const current = ++generation
  const account = user.user?.id
  const sessionEpoch = session.getEpoch()
  const isCurrent = () =>
    visible &&
    current === generation &&
    account === user.user?.id &&
    sessionEpoch === session.getEpoch()
  if (!more) clear()
  busy.value = false
  error.value = ''
  if (config.useMock || !account || !session.getToken()) {
    error.value = config.useMock
      ? '关怀资料需连接真实服务，合成模式不提供援助信息。'
      : '请登录后查看本人的关怀资料。'
    return
  }
  busy.value = true
  try {
    await user.refresh(false)
    if (!isCurrent()) return
    if (!user.validated) throw new Error('当前会话未校验')
    // 不要求学生认证或普通业务写权限，受限本人仍可读取援助资料。
    if (id.value) {
      const result = await getCareCard(id.value)
      if (!isCurrent()) return
      card.value = projectCareCard(result, id.value)
    } else {
      const page = await listNotifications(next)
      if (!isCurrent()) return
      const result = mergeCareNotifications(more ? notifications.value : [], page)
      if (page.next_cursor && (page.next_cursor === next || seen.has(page.next_cursor)))
        throw new Error('关怀通知游标重复')
      if (page.next_cursor) seen.add(page.next_cursor)
      notifications.value = result
      cursor.value = page.next_cursor
    }
    owner.value = account
    epoch.value = sessionEpoch
    loaded.value = true
  } catch {
    if (!isCurrent()) return
    clear()
    error.value = '关怀资料暂不可读取，请刷新重试或从当前本人通知重新进入。'
  } finally {
    if (visible && current === generation) {
      busy.value = false
      if (!isCurrent()) clear()
    }
  }
}
function open(item: AppNotification) {
  if (busy.value || !scoped.value || !notifications.value.includes(item)) return
  const target = careTarget(item)
  if (target) uni.navigateTo({ url: `/pages/care/index?id=${encodeURIComponent(target)}` })
}
function leave() {
  visible = false
  generation++
  clear()
  busy.value = false
  error.value = ''
}
watch(
  () => user.user?.id,
  () => {
    generation++
    clear()
    busy.value = false
  },
  { flush: 'sync' },
)
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
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
    <text class="title">关怀与援助</text>
    <text>你可以在这里查看为你提供的援助资料。</text>
    <view class="notice">
      <text
        >平台人工处理时段为北京时间
        8:00–22:00，夜间由自动措施处理并保留待办，次日由危机处置人员接手。</text
      >
      <text
        >援助渠道的服务时间与平台人工处理时间分别说明；平台不承诺全天人工值守或首次响应时限。</text
      >
    </view>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
    <navigator v-if="id" url="/pages/care/index">查看本人关怀通知</navigator>
    <button :disabled="busy" @click="load()">重新读取</button>
    <text v-if="busy">读取中…</text>
    <view v-if="currentCard" class="card">
      <text class="heading">援助资料</text>
      <text>{{ currentCard.resources.notice }}</text>
      <text class="heading">24 小时援助渠道</text>
      <text selectable>{{ currentCard.resources.hotline_24_hours }}</text>
      <text class="heading">校心理中心预约方式</text>
      <text selectable>{{ currentCard.resources.appointment }}</text>
      <text selectable>资料来源：{{ currentCard.resources.source }}</text>
      <text>资料版本：{{ currentCard.resources.version }}</text>
      <text>核验日期：{{ currentCard.resources.verified_at }}</text>
      <text>以上为该关怀卡保存的资料，请留意渠道当前说明；预约是否成功以提供方确认为准。</text>
    </view>
    <template v-if="!id">
      <text v-if="scoped && loaded && !rows.length">当前已读取的通知中暂无关怀卡片。</text>
      <view v-for="(item, index) in rows" :key="item.id" class="card">
        <text>关怀资料 {{ index + 1 }}</text>
        <button :disabled="busy" @click="open(item)">查看当前关怀卡</button>
      </view>
      <button v-if="scoped && cursor" :disabled="busy" @click="load(true)">继续读取通知</button>
    </template>
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
.heading {
  font-weight: bold;
}
.card,
.notice {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: white;
}
.notice {
  background: #fff1cc;
}
text {
  display: block;
  margin: 16rpx 0;
  overflow-wrap: anywhere;
}
button {
  margin-top: 16rpx;
}
.error {
  color: #b42318;
}
</style>
