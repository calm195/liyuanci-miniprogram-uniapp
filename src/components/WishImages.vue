<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { downloadWishImage } from '@/api/wish-images'
import type { WishImage } from '@/types/wish'
const props = defineProps<{ images: WishImage[]; wishId?: string; compact?: boolean }>()
const paths = ref<{ id: string; path: string }[]>([])
const failed = ref(false)
let generation = 0
async function load() {
  const current = ++generation
  paths.value = []
  failed.value = false
  const selected = props.compact ? props.images.slice(0, 1) : props.images
  const result = await Promise.all(
    selected.map(async (item) => {
      try {
        return { id: item.id, path: await downloadWishImage(item.id, props.wishId) }
      } catch {
        return { id: item.id, path: '' }
      }
    }),
  )
  if (generation !== current) return
  paths.value = result
  failed.value = result.some((item) => !item.path)
}
watch(
  [() => props.images, () => props.wishId],
  () => {
    void load()
  },
  { immediate: true },
)
onUnmounted(() => {
  generation++
  paths.value = []
})
function preview(path: string) {
  uni.previewImage({ current: path, urls: paths.value.map((item) => item.path).filter(Boolean) })
}
</script>
<template>
  <view class="wish-images" :class="{ compact }"
    ><image
      v-for="item in paths.filter((entry) => entry.path)"
      :key="item.id"
      :src="item.path"
      mode="aspectFill"
      @click.stop="preview(item.path)"
      @error="failed = true"
    /><button v-if="failed" class="image-retry" @click.stop="load">图片加载失败，重试</button></view
  >
</template>
<style scoped>
:host {
  display: block;
  width: 100%;
}
.wish-images {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin: 20rpx 0;
}
.wish-images image {
  width: calc((100% - 24rpx) / 3);
  height: 200rpx;
  border-radius: 18rpx;
}
.wish-images.compact image {
  width: 100%;
  height: 260rpx;
}
button.image-retry {
  font-size: 24rpx;
}
</style>
