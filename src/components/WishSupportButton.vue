<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { setWishSupport } from '@/api/wishes'
import type { WishSupport } from '@/types/wish'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'

const props = defineProps<{ wishId: string; count: number; supported: boolean }>()
const emit = defineEmits<{ change: [] }>()
const result = ref<WishSupport>()
const pending = ref(false)
const retry = ref<boolean>()
const epoch = computed(() => session.getEpoch())
const supported = computed(() => result.value?.supported ?? props.supported)
const count = computed(() => result.value?.support_count ?? props.count)
let mounted = true
onBeforeUnmount(() => {
  mounted = false
})
watch(
  [() => props.wishId, epoch],
  () => {
    result.value = undefined
    retry.value = undefined
    pending.value = false
  },
  { flush: 'sync' },
)
watch([() => props.count, () => props.supported], () => {
  result.value = undefined
})

async function toggle() {
  if (pending.value) return
  if (!session.getToken()) {
    uni.navigateTo({
      url: '/pages/login/index',
      fail: () => uni.$emit('app:notice', { message: '无法打开登录页，请重试', kind: 'error' }),
    })
    return
  }
  const id = props.wishId
  const generation = epoch.value
  const active = () => mounted && epoch.value === generation && props.wishId === id
  const intent = retry.value ?? !supported.value
  pending.value = true
  try {
    const state = await setWishSupport(id, intent)
    if (!active()) return
    result.value = state
    retry.value = undefined
    uni.$emit('app:notice', {
      message: state.supported ? '已支持心愿' : '已取消支持',
      kind: 'success',
    })
    emit('change')
  } catch (failure) {
    if (!active()) return
    const unknown =
      !(failure instanceof RequestError) || !failure.statusCode || failure.statusCode >= 500
    retry.value = unknown ? intent : undefined
    uni.$emit('app:notice', {
      message: unknown
        ? '支持操作结果未知，点击重试'
        : failure instanceof Error
          ? failure.message
          : '操作失败',
      kind: unknown ? 'warning' : 'error',
    })
  } finally {
    if (active()) pending.value = false
  }
}
</script>

<template>
  <button
    class="wish-support"
    :class="{ supported }"
    :aria-label="retry !== undefined ? '重试支持操作' : supported ? '取消支持' : '支持心愿'"
    :aria-pressed="supported"
    :disabled="pending"
    :loading="isPageActionPending(`wish-support-${wishId}`)"
    @click.stop="runPageAction(toggle, `wish-support-${wishId}`)"
  >
    <AppIcon name="thumb-up" :active="supported" :size="32" />
    <text>{{ count }}</text>
    <text v-if="retry !== undefined">重试</text>
  </button>
</template>

<style scoped>
.wish-support {
  display: inline-flex;
  width: auto;
  min-height: 56rpx;
  align-items: center;
  gap: 8rpx;
  margin: 8rpx 0;
  padding: 0 14rpx;
  background: transparent;
  color: var(--theme-teal);
  font-size: 26rpx;
}
.wish-support.supported {
  color: var(--theme-brand);
}
</style>
