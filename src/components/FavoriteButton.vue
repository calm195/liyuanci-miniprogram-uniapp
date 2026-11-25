<script setup lang="ts">
import { useLogin } from '@/composables/use-login'
const { requestLogin } = useLogin()
import { onUnmounted, ref, watch } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import AppIcon from '@/components/AppIcon.vue'
import { interactionKey, setFavorite } from '@/api/interactions'
import type { ContentKind } from '@/types/interactions'
import { session } from '@/utils/session'
const props = defineProps<{
  kind: ContentKind
  targetId: string
  favorited?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ change: [active: boolean] }>()
const active = ref(props.favorited === true)
const busy = ref(false)
const error = ref('')
const pending = ref<{
  kind: ContentKind
  id: string
  active: boolean
  key: string
  epoch: number
} | null>(null)
let generation = 0
let visible = true
watch(
  () => [props.targetId, props.kind, session.getEpoch()],
  () => {
    generation++
    active.value = props.favorited === true
    busy.value = false
    pending.value = null
    error.value = ''
  },
  { flush: 'sync' },
)
watch(
  () => props.favorited,
  (value) => {
    // 刷新投影不能抹掉尚未确认的写入意图和幂等键。
    if (!pending.value) active.value = value === true
  },
)
onShow(() => {
  visible = true
})
onHide(() => {
  visible = false
  generation++
  busy.value = false
  error.value = ''
})
onUnmounted(() => {
  visible = false
  generation++
})
async function toggle() {
  if (!visible || busy.value) return
  if (!session.getToken()) {
    requestLogin(() => toggle())
    return
  }
  const current = generation
  const command = pending.value ?? {
    kind: props.kind,
    id: props.targetId,
    active: !active.value,
    key: interactionKey(),
    epoch: session.getEpoch(),
  }
  pending.value = command
  busy.value = true
  error.value = ''
  try {
    const result = await setFavorite(command.kind, command.id, command.active, command.key)
    if (!visible || generation !== current || session.getEpoch() !== command.epoch) return
    active.value = result?.favorited ?? command.active
    pending.value = null
    emit('change', active.value)
    uni.$emit('app:notice', { message: active.value ? '收藏成功' : '已取消收藏', kind: 'success' })
  } catch (failure) {
    if (visible && generation === current && session.getEpoch() === command.epoch) {
      const status = (failure as { statusCode?: number }).statusCode ?? 0
      if (status >= 400 && status < 500 && ![408, 429].includes(status)) {
        pending.value = null
        error.value = '当前内容无法收藏，请刷新后重试。'
      } else error.value = '收藏结果尚未确认，请点击原请求重试。'
    }
  } finally {
    if (generation === current) busy.value = false
  }
}
</script>
<template>
  <view class="favorite-control" :class="{ compact }"
    ><button
      class="favorite-button"
      :disabled="busy"
      :loading="isPageActionPending('favorite-toggle')"
      :aria-pressed="active"
      @click.stop="runPageAction(toggle, 'favorite-toggle')"
    >
      <AppIcon name="star" :active="active" :size="32" /><text>{{
        pending ? (compact ? '重试收藏' : '原请求重试') : active ? '已收藏' : '收藏'
      }}</text></button
    ><AppNotice :message="error" kind="uncertain"
  /></view>
</template>
<style scoped>
.favorite-control {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
button.favorite-button {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  margin: 0;
  padding: 8rpx 0;
  min-height: 72rpx;
  background: transparent;
  color: var(--theme-teal);
  border: 0;
  border-radius: 0;
  font-size: 26rpx;
  line-height: 1.5;
}
.favorite-button text {
  margin: 0;
}
.favorite-control.compact {
  min-width: 0;
  align-items: flex-end;
}
.compact button.favorite-button {
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0 4rpx;
  font-size: 24rpx;
  white-space: nowrap;
}
</style>
