<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload, onShareAppMessage } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { createShare, resolveShare } from '@/api/stories'
import { sharePath, isPublicContent } from '@/utils/story'
import type { ShareKind, ShareTarget } from '@/types/story'
import PublicContent from '@/components/PublicContent.vue'
const user = useUserStore()
const kind = ref<ShareKind | null>(null)
const id = ref('')
const reference = ref('')
const target = ref<ShareTarget | null>(null)
const path = ref('')
const busy = ref(false)
const error = ref('')
const readEpoch = ref(-1)
const currentTarget = computed(() => (readEpoch.value === session.getEpoch() ? target.value : null))
let visible = false
let generation = 0
function clear() {
  target.value = null
  path.value = ''
  readEpoch.value = -1
}
async function load(create = false) {
  if (busy.value) return
  const current = ++generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const active = () =>
    visible && current === generation && epoch === session.getEpoch() && owner === user.user?.id
  clear()
  error.value = ''
  if (config.useMock) {
    error.value = '分享需连接真实服务。'
    return
  }
  if (!reference.value && !create) return
  busy.value = true
  try {
    if (!reference.value) {
      if (!kind.value || !id.value || !session.getToken()) throw new Error('请登录后创建分享')
      await user.refresh(false)
      if (!active()) return
      if (!user.validated || user.user?.verification !== 'verified')
        throw new Error('当前资格不能创建分享')
      const link = await createShare(
        kind.value,
        id.value,
        `share-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      )
      if (!active()) return
      sharePath(link)
      reference.value = link.ref
    }
    const result = await resolveShare(reference.value)
    if (!active()) return
    if (
      !['wish', 'story'].includes(result.target_kind) ||
      !isPublicContent(result.target) ||
      (kind.value && (kind.value !== result.target_kind || id.value !== result.target.id))
    )
      throw new Error('分享目标无效')
    path.value = sharePath({
      ref: reference.value,
      miniapp_route: `/pages/share/index?ref=${encodeURIComponent(reference.value)}`,
    })
    target.value = result
    readEpoch.value = epoch
  } catch {
    if (!active()) return
    clear()
    error.value = reference.value
      ? '分享内容已失效或暂不可查看，请刷新后重试。'
      : '分享未生成，请确认登录资格与内容当前公开状态后手动重试。'
  } finally {
    if (current === generation) busy.value = false
  }
}
// 微信分享回调同步返回已准备的引用。回流页每次显示都重新请求公开投影。
onShareAppMessage(() => ({
  title: '鲤源池 · 心愿与还愿故事',
  // 显式使用通用封面，避免微信默认截取当前页面正文作为卡片图片。
  imageUrl: '/static/share-cover.png',
  path:
    visible && readEpoch.value === session.getEpoch() && currentTarget.value && path.value
      ? path.value
      : '/pages/index/index',
}))
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
  reference.value = typeof query?.ref === 'string' ? query.ref : ''
  if (!reference.value) {
    kind.value = query?.kind === 'wish' || query?.kind === 'story' ? query.kind : null
    id.value = typeof query?.id === 'string' ? query.id : ''
  }
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
    <text class="title">分享</text>
    <text>分享内容以打开时的公开状态为准。</text>
    <button
      v-if="!reference && kind && id"
      :disabled="busy"
      @click="runPageAction(() => load(true))"
    >
      生成分享
    </button>
    <navigator v-if="!reference && !user.isLoggedIn" url="/pages/login/index"
      >登录后生成分享</navigator
    >
    <button v-if="reference" :disabled="busy" @click="runPageAction(() => load())">
      重新读取分享内容
    </button>
    <text v-if="busy">加载中…</text>
    <view v-if="currentTarget" class="card">
      <text>{{ currentTarget.target_kind === 'story' ? '还愿故事' : '公开心愿' }}</text>
      <PublicContent :content="currentTarget.target" :kind="currentTarget.target_kind" />
      <navigator
        :url="`/pages/${currentTarget.target_kind === 'story' ? 'stories' : 'wish-detail'}/index?id=${encodeURIComponent(currentTarget.target.id)}`"
        >查看当前详情</navigator
      >
      <button open-type="share">分享给微信好友</button>
    </view>
    <text v-if="!reference && (!kind || !id)" class="error">分享链接无效。</text>
    <text v-if="error" class="error">{{ error }}</text>
    <navigator url="/pages/stories/index">前往还愿墙</navigator>
  </AppPage>
</template>
