<script setup lang="ts">
import { getCurrentInstance, ref } from 'vue'
import { createShare, getShareCode, resolveShare } from '@/api/stories'
import { useUserStore } from '@/stores/user'
import type { ShareKind, ShareLink, ShareTarget } from '@/types/story'
import type { WishPublicContent } from '@/types/wish'
import { sharePath, shareTitle } from '@/utils/share'
import { isPublicContent, shareCard } from '@/utils/story'
import { RequestError } from '@/utils/request'
import { session } from '@/utils/session'

declare const wx: {
  env: { USER_DATA_PATH: string }
  getAccountInfoSync(): { miniProgram: { envVersion: 'develop' | 'trial' | 'release' } }
  showShareImageMenu?: (options: {
    path: string
    needShowEntrance: boolean
    entrancePath: string
    success: () => void
    fail: (failure: { errMsg?: string }) => void
  }) => void
}

const props = defineProps<{ kind: ShareKind; content: WishPublicContent }>()
const user = useUserStore()
const instance = getCurrentInstance()
const canvasId = `share-poster-${instance?.uid}`
const notice = ref('')
const error = ref('')
let pending: { identity: string; key: string; link?: ShareLink } | undefined

async function drawPoster(target: ShareTarget, data: string) {
  if (
    typeof data !== 'string' ||
    data.length > 1_398_104 ||
    !/^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(data)
  )
    throw new Error('小程序码暂不可用，请稍后重试。')
  const fs = uni.getFileSystemManager()
  const path = `${wx.env.USER_DATA_PATH}/${canvasId}-${Date.now()}.png`
  try {
    await new Promise<void>((resolve, reject) =>
      fs.writeFile({
        filePath: path,
        data,
        encoding: 'base64',
        success: () => resolve(),
        fail: reject,
      }),
    )
    const canvas = uni.createCanvasContext(canvasId, instance?.proxy)
    canvas.setFillStyle('#edf7f4')
    canvas.fillRect(0, 0, 400, 300)
    canvas.setFillStyle('#ffffff')
    canvas.fillRect(16, 16, 368, 268)
    canvas.setFillStyle('#216a60')
    canvas.setFontSize(18)
    canvas.fillText('鲤愿池  ·  微信小程序', 30, 51)
    canvas.setFillStyle('#173d39')
    canvas.setFontSize(24)
    const title = shareTitle(props.kind, target.target)
    let line = ''
    let y = 109
    for (const character of title) {
      if (canvas.measureText(line + character).width > 335) {
        if (y === 143) {
          while (canvas.measureText(line + '…').width > 335) line = line.slice(0, -1)
          line += '…'
          break
        }
        canvas.fillText(line, 30, y)
        y += 34
        line = ''
      }
      line += character
    }
    canvas.fillText(line, 30, y)
    canvas.setFillStyle('#216a60')
    canvas.setFontSize(15)
    canvas.fillText(shareCard(target).tags.join(' · '), 30, 183, 220)
    canvas.fillText('微信扫一扫', 30, 231)
    canvas.fillText('打开小程序查看', 30, 254)
    canvas.drawImage(path, 262, 169, 108, 108)
    return await new Promise<string>((resolve, reject) =>
      canvas.draw(false, () =>
        uni.canvasToTempFilePath(
          {
            canvasId,
            destWidth: 1200,
            destHeight: 900,
            fileType: 'png',
            success: ({ tempFilePath }) => resolve(tempFilePath),
            fail: reject,
          },
          instance?.proxy,
        ),
      ),
    )
  } finally {
    fs.unlink({ filePath: path, fail: () => {} })
  }
}

async function sharePoster() {
  const page = instance?.proxy
  const epoch = session.getEpoch()
  const action = page?.pageActionGeneration
  const { kind, content } = props
  const active = () =>
    page?.isPageVisible &&
    page.pageActionGeneration === action &&
    epoch === session.getEpoch() &&
    content.id === props.content.id &&
    content.content_version === props.content.content_version
  notice.value = ''
  error.value = ''
  if (typeof wx === 'undefined' || !user.validated || user.user?.verification !== 'verified') {
    error.value = '请在微信中登录并完成学生认证后分享。'
    return
  }
  const identity = `${epoch}:${kind}:${content.id}:${content.content_version}`
  if (pending?.identity !== identity)
    pending = { identity, key: `share-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  const command = pending
  try {
    const link = command.link ?? (await createShare(kind, content.id, command.key))
    if (!active()) return
    const path = sharePath(kind, link)
    command.link = link
    const target = await resolveShare(link.ref)
    if (!active()) return
    if (
      target.target_kind !== kind ||
      target.target.id !== content.id ||
      !isPublicContent(target.target)
    )
      throw new Error('分享内容已失效，请刷新详情。')
    const { image_base64 } = await getShareCode(
      link.ref,
      wx.getAccountInfoSync().miniProgram.envVersion,
    )
    if (!active()) return
    const image = await drawPoster(target, image_base64)
    if (!active()) return
    const showShareImageMenu = wx.showShareImageMenu
    if (!showShareImageMenu) {
      await new Promise<void>((resolve, reject) =>
        uni.saveImageToPhotosAlbum({
          filePath: image,
          success: () => resolve(),
          fail: () => reject(new Error('图片未保存，请检查相册权限后重试。')),
        }),
      )
      if (active()) notice.value = '带码卡片已保存，可从相册分享到朋友圈。'
      return
    }
    await new Promise<void>((resolve, reject) =>
      showShareImageMenu.call(wx, {
        path: image,
        needShowEntrance: true,
        entrancePath: path,
        success: () => resolve(),
        fail: ({ errMsg }) =>
          errMsg?.includes('cancel') ? resolve() : reject(new Error('分享菜单未打开，请重试。')),
      }),
    )
    if (active()) notice.value = '带码卡片已生成。'
  } catch (failure) {
    if (!active()) return
    if (failure instanceof RequestError) {
      error.value =
        failure.statusCode === 404
          ? '分享内容已失效或暂不可查看。'
          : failure.statusCode === 503
            ? '小程序码服务暂不可用，请稍后重试。'
            : '带码卡片未生成，请检查登录状态和网络后重试。'
    } else {
      error.value = failure instanceof Error ? failure.message : '带码卡片未生成，请重试。'
    }
  }
}
</script>

<template>
  <view class="share-actions">
    <button class="share-button" open-type="share">转发给好友</button>
    <button
      class="share-button"
      :loading="isPageActionPending('share-poster')"
      :disabled="isPageActionPending('share-poster')"
      @click="runPageAction(sharePoster, 'share-poster')"
    >
      分享带码卡片
    </button>
    <text class="share-hint">分享小程序到朋友圈可用右上角菜单。</text>
    <canvas :canvas-id="canvasId" class="share-canvas" />
    <AppNotice :message="notice" kind="success" />
    <AppNotice :message="error" kind="error" />
  </view>
</template>

<style scoped>
.share-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
}
.share-button {
  margin: 0;
  padding: 8rpx 18rpx;
  border: 1px solid var(--theme-line);
  background: var(--theme-surface);
  color: var(--theme-teal);
  font-size: 26rpx;
}
.share-hint {
  flex-basis: 100%;
  color: var(--theme-muted);
  font-size: 24rpx;
}
.share-canvas {
  position: fixed;
  top: -1000px;
  left: -1000px;
  width: 400px;
  height: 300px;
  pointer-events: none;
}
</style>
