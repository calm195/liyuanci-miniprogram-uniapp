<script setup lang="ts">
import { getCurrentInstance, onMounted, onUnmounted, ref, watch } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { requestWishImage } from '@/api/wish-images'
import { session } from '@/utils/session'
import type { ImageDownload } from '@/utils/image-download-queue'
import type { WishImage } from '@/types/wish'
const props = defineProps<{ images: WishImage[]; wishId?: string; compact?: boolean }>()
const paths = ref<{ id: string; path: string }[]>([])
const failed = ref(false)
const previewing = ref(false)
const instance = getCurrentInstance()
const downloads = new Set<ImageDownload>()
let generation = 0
let mounted = false
let active = true
let visible = false
let observation = 0
let observer: ReturnType<typeof uni.createIntersectionObserver> | undefined

function clear() {
  generation++
  for (const download of downloads) download.cancel()
  downloads.clear()
  paths.value = []
  failed.value = false
  previewing.value = false
}

function load() {
  clear()
  if (!active || !visible) return
  const current = generation
  const selected = props.compact ? props.images.slice(0, 1) : props.images
  paths.value = selected.map((item) => ({ id: item.id, path: '' }))
  for (const item of selected) {
    const download = requestWishImage(item.id, props.wishId, 'thumbnail')
    downloads.add(download)
    void download.promise.then(
      (path) => {
        downloads.delete(download)
        if (current !== generation) return
        paths.value = paths.value.map((entry) =>
          entry.id === item.id ? { ...entry, path } : entry,
        )
      },
      () => {
        if (current !== generation) return
        // 任一来源失效都清除同组预览，避免先完成的图片在撤权后继续展示。
        clear()
        failed.value = true
      },
    )
  }
}

function stopObserving() {
  observation++
  observer?.disconnect()
  observer = undefined
}

function observe() {
  stopObserving()
  if (!mounted || !active) return
  const current = observation
  visible = false
  if (!instance?.proxy || typeof uni.createIntersectionObserver !== 'function') {
    visible = true
    load()
    return
  }
  observer = uni.createIntersectionObserver(instance.proxy)
  observer.relativeToViewport({ top: 200, bottom: 200 }).observe('.wish-images', (entry) => {
    if (current !== observation || entry.intersectionRatio <= 0 || visible || !active) return
    visible = true
    stopObserving()
    load()
  })
}

watch(
  [() => props.images, () => props.wishId, () => props.compact, () => session.getEpoch()],
  () => {
    clear()
    if (visible) load()
  },
  { flush: 'sync' },
)
onMounted(() => {
  mounted = true
  observe()
})
onHide(() => {
  active = false
  visible = false
  stopObserving()
  clear()
})
onShow(() => {
  active = true
  observe()
})
onUnmounted(() => {
  active = false
  stopObserving()
  clear()
})

async function preview(id: string) {
  if (previewing.value) return
  const selected = props.compact ? [id] : props.images.map((item) => item.id)
  if (!selected.includes(id)) return
  const current = generation
  previewing.value = true
  // 点击后才读取原图，先把点击的图片排入队列，并保留详情多图左右切换。
  const ordered = [id, ...selected.filter((item) => item !== id)]
  const originals = ordered.map((item) => ({
    id: item,
    download: requestWishImage(item, props.wishId),
  }))
  for (const item of originals) downloads.add(item.download)
  try {
    const result = await Promise.all(
      originals.map(async (item) => ({ id: item.id, path: await item.download.promise })),
    )
    const byID = new Map(result.map((item) => [item.id, item.path]))
    if (current === generation)
      uni.previewImage({
        current: byID.get(id),
        urls: selected.map((item) => byID.get(item) || ''),
      })
  } catch {
    if (current === generation) {
      clear()
      failed.value = true
      uni.$emit('app:notice', { message: '大图暂不可查看，请重试', kind: 'error' })
    }
  } finally {
    for (const item of originals) downloads.delete(item.download)
    if (current === generation) previewing.value = false
  }
}
</script>
<template>
  <view class="wish-images" :class="{ compact }"
    ><view v-for="item in paths" :key="item.id" class="image-slot"
      ><image
        v-if="item.path"
        :src="item.path"
        mode="aspectFill"
        @click.stop="preview(item.id)"
        @error="failed = true" /></view
    ><text v-if="previewing" class="image-status">正在加载大图…</text
    ><button v-if="failed" class="image-retry" @click.stop="load">图片加载失败，重试</button></view
  >
</template>
<style scoped>
:host {
  display: block;
  width: 100%;
}
.wish-images {
  width: 100%;
  min-height: 200rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin: 20rpx 0;
}
.image-slot {
  width: calc((100% - 24rpx) / 3);
  height: 200rpx;
  border-radius: 18rpx;
  background: var(--theme-surface-soft, #f2f4f3);
  overflow: hidden;
}
.image-slot image {
  width: 100%;
  height: 100%;
}
.wish-images.compact .image-slot {
  width: 100%;
  height: 260rpx;
}
.image-status {
  width: 100%;
  font-size: 24rpx;
}
button.image-retry {
  font-size: 24rpx;
}
</style>
