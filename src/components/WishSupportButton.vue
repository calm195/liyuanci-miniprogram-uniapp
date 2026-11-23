<script setup lang="ts">
import { useLogin } from '@/composables/use-login'
const { requestLogin } = useLogin()
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
    requestLogin(() => toggle())
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
    // 只接受能确认本次意图的回执；异常正文可能发生在服务端已执行之后。
    if (
      !state ||
      state.supported !== intent ||
      !Number.isSafeInteger(state.support_count) ||
      state.support_count < 0
    )
      throw new Error('点赞回执无法确认')
    result.value = state
    retry.value = undefined
    uni.$emit('app:notice', {
      message: state.supported ? '已点赞' : '已取消点赞',
      kind: 'success',
    })
    emit('change')
  } catch (failure) {
    if (!active()) return
    const unknown =
      !(failure instanceof RequestError) ||
      !failure.statusCode ||
      (failure.statusCode >= 200 && failure.statusCode < 300) ||
      [408, 429].includes(failure.statusCode) ||
      failure.statusCode >= 500
    retry.value = unknown ? intent : undefined
    uni.$emit('app:notice', {
      message: unknown
        ? '点赞结果未知，点击重试'
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
    :aria-label="retry !== undefined ? '重试点赞操作' : supported ? '取消点赞' : '点赞心愿'"
    :aria-pressed="supported"
    :disabled="pending"
    :loading="isPageActionPending(`wish-support-${wishId}`)"
    @click.stop="runPageAction(toggle, `wish-support-${wishId}`)"
  >
    <AppIcon name="thumb-up" :active="supported" :size="32" />
    <text>{{ supported ? '已赞' : '赞' }} {{ count }}</text>
    <text v-if="retry !== undefined">重试</text>
  </button>
</template>

<style scoped>
.wish-support {
  display: inline-flex;
  width: auto;
  min-height: 72rpx;
  align-items: center;
  gap: 8rpx;
  margin: 0;
  padding: 8rpx 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--theme-teal);
  font-size: 26rpx;
  line-height: 1.5;
}
.wish-support text {
  margin: 0;
}
.wish-support.supported {
  color: var(--theme-brand);
}
</style>
