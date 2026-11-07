<script setup lang="ts">
import { computed, getCurrentInstance, inject, onUnmounted, watch } from 'vue'
import { noticeContext } from '@/utils/notices'
import type { NoticeKind } from '@/utils/notices'
const props = withDefaults(defineProps<{ message?: string | null; kind?: NoticeKind }>(), {
  message: '',
  kind: 'info',
})
const controller = inject(noticeContext)
const instance = getCurrentInstance()
const visible = computed(() => instance?.proxy?.isPageVisible === true)
const action = computed(() => instance?.proxy?.pageActionGeneration ?? 0)
const identity = computed(() => instance?.proxy?.pageActionIdentity ?? '')
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
      previous = controller?.show(message, kind, previous) ?? 0
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
<template><view v-if="false" /></template>
