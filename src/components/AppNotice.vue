<script setup lang="ts">
import { computed, getCurrentInstance, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { noticeContext, resultNoticeKind } from '@/utils/notices'
import type { NoticeKind } from '@/utils/notices'
const props = withDefaults(defineProps<{ message?: string | null; kind?: NoticeKind }>(), {
  message: '',
  kind: 'info',
})
const controller = inject(noticeContext)
const instance = getCurrentInstance()
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const visible = computed(() => mounted.value && instance?.proxy?.isPageVisible === true)
const action = computed(() => (mounted.value ? (instance?.proxy?.pageActionGeneration ?? 0) : 0))
const identity = computed(() => (mounted.value ? (instance?.proxy?.pageActionIdentity ?? '') : ''))
let trigger = ''
let previous = 0
let entered = false
watch(
  () => [props.message, props.kind, visible.value, action.value, identity.value] as const,
  ([message, kind, active, version, actionKey], old) => {
    if (!message || !active) {
      if (previous) controller?.dismiss(previous)
      if (active) entered = true
      return
    }
    // 仅重试同一动作时重放相同校验；其他按钮或后台返回不恢复旧提示。
    if (
      !entered ||
      message !== old?.[0] ||
      kind !== old?.[1] ||
      (old?.[2] && version !== old[3] && !!trigger && actionKey === trigger)
    ) {
      previous = controller?.show(message, resultNoticeKind(message, kind), previous) ?? 0
      trigger = actionKey
    }
    entered = true
  },
  { immediate: true },
)
onUnmounted(() => {
  if (previous) controller?.dismiss(previous)
})
</script>
<template>
  <view
    v-if="
      message &&
      (kind === 'error' || kind === 'warning' || resultNoticeKind(message, kind) === 'uncertain')
    "
    class="notice-detail"
    >{{ message }}</view
  >
</template>
<style scoped>
.notice-detail {
  margin: 16rpx 0;
  color: var(--theme-danger);
  font-size: 26rpx;
  overflow-wrap: anywhere;
}
</style>
