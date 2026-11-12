<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { uploadWishImage, downloadWishImage } from '@/api/wish-images'
import { interactionKey } from '@/api/interactions'
import { session } from '@/utils/session'
const props = defineProps<{ modelValue: string[]; disabled?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [ids: string[]]
  busy: [value: boolean]
  picking: [value: boolean]
}>()
type ImageEntry = {
  key: string
  id?: string
  path: string
  status: 'ready' | 'uploading' | 'failed'
}
const entries = ref<ImageEntry[]>([])
const error = ref('')
const busy = ref(false)
let generation = 0
let mounted = true
function ticket() {
  const current = generation
  const epoch = session.getEpoch()
  return () => mounted && current === generation && epoch === session.getEpoch()
}
watch(
  () => session.getEpoch(),
  () => {
    generation++
    entries.value = []
    busy.value = false
    error.value = ''
    emit('busy', false)
    emit('picking', false)
  },
  { flush: 'sync' },
)
watch(
  () => props.modelValue,
  async (ids) => {
    if (
      ids.join(',') ===
      entries.value
        .filter((item) => item.id)
        .map((item) => item.id)
        .join(',')
    )
      return
    const current = ++generation
    busy.value = false
    entries.value = ids.map((id) => ({ id, key: id, path: '', status: 'ready' }))
    for (const item of entries.value) {
      try {
        const path = await downloadWishImage(item.id!)
        if (current === generation) item.path = path
      } catch {
        if (current === generation) error.value = '部分图片暂不可预览，保存仍会保留原图。'
      }
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  generation++
  mounted = false
})
function sync() {
  emit(
    'update:modelValue',
    entries.value.flatMap((item) => (item.id ? [item.id] : [])),
  )
  emit('busy', entries.value.some((item) => item.status !== 'ready') || busy.value)
}
async function upload(item: ImageEntry) {
  if (!mounted || props.disabled || !entries.value.includes(item)) return
  const active = ticket()
  item.status = 'uploading'
  sync()
  try {
    const result = await uploadWishImage(item.path, item.key)
    if (!active() || !entries.value.includes(item)) return
    item.id = result.id
    item.status = 'ready'
    uni.$emit('app:notice', { message: '照片上传成功', kind: 'success' })
  } catch {
    if (active() && entries.value.includes(item)) {
      item.status = 'failed'
      error.value = '图片上传尚未确认，请重试或移除后继续。'
    }
  } finally {
    if (active()) sync()
  }
}
async function choose() {
  if (!mounted || busy.value || props.disabled || entries.value.length >= 3) return
  const active = ticket()
  busy.value = true
  error.value = ''
  emit('busy', true)
  emit('picking', true)
  try {
    const result = await uni.chooseImage({
      count: 3 - entries.value.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    })
    // 选图器返回时可能已经离页或换号，旧文件不能上传到新会话。
    if (!active()) return
    emit('picking', false)
    const paths = Array.isArray(result.tempFilePaths) ? result.tempFilePaths : []
    for (const path of paths.slice(0, 3 - entries.value.length)) {
      if (!active()) return
      const item: ImageEntry = { path, key: interactionKey(), status: 'uploading' }
      entries.value.push(item)
      // 使用响应式条目，上传返回后保持同一资源归属与列表引用。
      await upload(entries.value[entries.value.length - 1]!)
    }
  } catch (failure) {
    if (active() && !String((failure as { errMsg?: string })?.errMsg || '').includes('cancel'))
      error.value = '未能选择图片，请重试。'
  } finally {
    if (active()) {
      busy.value = false
      emit('picking', false)
      sync()
    }
  }
}
function remove(index: number) {
  if (props.disabled || busy.value) return
  entries.value.splice(index, 1)
  sync()
  uni.$emit('app:notice', { message: '照片已移除', kind: 'success' })
}
function move(index: number) {
  if (index === 0 || props.disabled || busy.value) return
  const entry = entries.value.splice(index, 1)[0]!
  entries.value.splice(index - 1, 0, entry)
  sync()
}
function preview(path: string) {
  if (path)
    uni.previewImage({
      current: path,
      urls: entries.value.map((item) => item.path).filter(Boolean),
    })
}
</script>
<template>
  <view class="photo-editor"
    ><text class="section-title">心愿照片（{{ entries.length }}/3）</text
    ><text class="photo-help">可选，最多三张 JPG / PNG。图片通过审核后随正文公开。</text
    ><view class="photo-grid"
      ><view v-for="(item, index) in entries" :key="item.key" class="photo-item"
        ><image
          v-if="item.path"
          :src="item.path"
          mode="aspectFill"
          @click="preview(item.path)"
        /><text v-else>原图已保留</text><text v-if="item.status === 'uploading'">上传中…</text
        ><button v-if="item.status === 'failed'" :disabled="disabled || busy" @click="upload(item)">
          原请求重试</button
        ><view class="photo-actions"
          ><button :disabled="disabled || busy || index === 0" @click="move(index)">前移</button
          ><button :disabled="disabled || busy" @click="remove(index)">移除</button></view
        ></view
      ></view
    ><button v-if="entries.length < 3" :disabled="disabled || busy" @click="choose">
      ＋ 添加照片</button
    ><AppNotice :message="error" kind="warning"
  /></view>
</template>
<style scoped>
.photo-editor {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.photo-help {
  font-size: 24rpx;
  color: var(--theme-muted);
  line-height: 1.6;
}
.photo-grid {
  display: flex;
  gap: 12rpx;
}
.photo-item {
  width: calc((100% - 24rpx) / 3);
}
.photo-item image {
  width: 100%;
  height: 170rpx;
  border-radius: 16rpx;
}
.photo-actions {
  display: flex;
  gap: 6rpx;
}
.photo-item button {
  font-size: 22rpx;
  padding: 2rpx 8rpx;
  min-height: 50rpx;
}
</style>
