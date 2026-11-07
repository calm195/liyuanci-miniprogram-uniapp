<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload, onShareAppMessage } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { createShare, resolveShare } from '@/api/stories'
import { shareCard, sharePath, isPublicContent } from '@/utils/story'
import type { ShareKind, ShareTarget } from '@/types/story'
import PublicContent from '@/components/PublicContent.vue'
const user = useUserStore()
const kind = ref<ShareKind | null>(null)
const id = ref('')
const reference = ref('')
const target = ref<ShareTarget | null>(null)
const path = ref('')
const cover = ref('')
const busy = ref(false)
const error = ref('')
const readEpoch = ref(-1)
const currentTarget = computed(() => (readEpoch.value === session.getEpoch() ? target.value : null))
let visible = false
let generation = 0
function clear() {
  target.value = null
  path.value = ''
  cover.value = ''
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
    await nextTick()
    if (active()) {
      const image = await drawCover(result).catch(() => '')
      if (active()) cover.value = image
    }
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
// 使用独立封面展示标题和标签，避免微信截取页面正文。
async function drawCover(share: ShareTarget): Promise<string> {
  const card = shareCard(share)
  const canvas = uni.createCanvasContext('wish-share-cover')
  canvas.setFillStyle('#edf7f4')
  canvas.fillRect(0, 0, 400, 320)
  canvas.setFillStyle('#216a60')
  canvas.setFontSize(23)
  canvas.fillText('鲤愿池', 30, 53)
  canvas.setFillStyle('#173d39')
  canvas.setFontSize(30)
  let line = ''
  let y = 120
  for (const character of card.title) {
    if (canvas.measureText(line + character).width > 340) {
      if (y === 204) {
        while (canvas.measureText(line + '…').width > 340) line = line.slice(0, -1)
        line += '…'
        break
      }
      canvas.fillText(line, 30, y)
      line = ''
      y += 42
    }
    line += character
  }
  canvas.fillText(line, 30, y)
  canvas.setFontSize(22)
  let x = 30
  for (const tag of card.tags) {
    const width = canvas.measureText(tag).width + 24
    canvas.setFillStyle('#d6ebe5')
    canvas.fillRect(x, 247, width, 38)
    canvas.setFillStyle('#216a60')
    canvas.fillText(tag, x + 12, 273)
    x += width + 10
  }
  return new Promise((resolve) => {
    canvas.draw(false, () =>
      uni.canvasToTempFilePath({
        canvasId: 'wish-share-cover',
        destWidth: 800,
        destHeight: 640,
        success: ({ tempFilePath }) => resolve(tempFilePath),
        fail: () => resolve(''),
      }),
    )
  })
}

// 回流页每次显示都重新请求当前公开投影。
onShareAppMessage(() => {
  const share = currentTarget.value
  if (!visible || !share || !path.value) {
    return {
      title: '鲤愿池 · 心愿与还愿故事',
      imageUrl: '/static/share-cover.png',
      path: '/pages/index/index',
    }
  }
  const { title, tags } = shareCard(share)
  return {
    title: [title, ...tags].join(' · '),
    imageUrl: cover.value || '/static/share-cover.png',
    path: path.value,
  }
})
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
onPullDownRefresh(async () => {
  try {
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage>
    <text class="title">分享</text>
    <text>分享内容以打开时的公开状态为准。</text>
    <button
      v-if="!reference && kind && id"
      :disabled="busy"
      :loading="isPageActionPending('pages-share-index-button-1')"
      @click="runPageAction(() => load(true), 'pages-share-index-button-1')"
    >
      生成分享
    </button>
    <navigator v-if="!reference && !user.isLoggedIn" url="/pages/login/index"
      >登录后生成分享</navigator
    >
    <button
      v-if="reference"
      :disabled="busy"
      :loading="isPageActionPending('pages-share-index-button-2')"
      @click="runPageAction(() => load(), 'pages-share-index-button-2')"
    >
      重新读取分享内容
    </button>
    <text v-if="busy">加载中…</text>
    <view v-if="currentTarget" class="card">
      <text>{{ currentTarget.target_kind === 'story' ? '还愿故事' : '公开心愿' }}</text>
      <text>{{ shareCard(currentTarget).title }}</text>
      <text v-if="shareCard(currentTarget).tags.length">
        {{ shareCard(currentTarget).tags.join(' · ') }}
      </text>
      <PublicContent :content="currentTarget.target" :kind="currentTarget.target_kind" />
      <navigator
        :url="`/pages/${currentTarget.target_kind === 'story' ? 'stories' : 'wish-detail'}/index?id=${encodeURIComponent(currentTarget.target.id)}`"
        >查看当前详情</navigator
      >
      <button open-type="share" :disabled="busy">分享给微信好友</button>
    </view>
    <text v-if="!reference && (!kind || !id)" class="error">分享链接无效。</text>
    <AppNotice :message="error" kind="error" />
    <navigator url="/pages/stories/index">前往还愿墙</navigator>
    <canvas
      canvas-id="wish-share-cover"
      style="position: fixed; left: -1000px; width: 400px; height: 320px"
      aria-hidden="true"
    />
  </AppPage>
</template>
