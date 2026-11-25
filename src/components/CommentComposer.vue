<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    title: string
    expanded: boolean
    editable?: boolean
    disabled?: boolean
    submitDisabled?: boolean
    loading?: boolean
    submitLabel?: string
    identityLabel?: string
    maxlength?: number
    countLimit?: number
    focus?: boolean
    canCancel?: boolean
    cancelDisabled?: boolean
  }>(),
  {
    editable: true,
    submitDisabled: undefined,
    cancelDisabled: undefined,
    submitLabel: '发送',
    identityLabel: '',
    maxlength: -1,
    countLimit: 500,
  },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  close: []
  submit: []
  cancel: []
}>()
const characterCount = computed(() => Array.from(props.modelValue).length)
const submitLocked = computed(() => props.submitDisabled ?? props.disabled)
const cancelLocked = computed(() => props.cancelDisabled ?? props.disabled)

function input(event: unknown) {
  if (!props.editable || props.disabled) return
  const source = event as { detail?: { value?: unknown }; target?: { value?: unknown } } | null
  const value = source?.detail?.value ?? source?.target?.value
  if (typeof value === 'string') emit('update:modelValue', value)
}
function close() {
  emit('close')
}
function submit() {
  // 输入锁定与原请求重试独立，由业务层分别控制。
  if (props.editable && !submitLocked.value) emit('submit')
}
function cancel() {
  if (props.canCancel && !cancelLocked.value) emit('cancel')
}
</script>

<template>
  <view
    v-show="expanded"
    class="comment-composer-panel"
    :class="{ 'comment-composer-panel-hidden': !expanded }"
  >
    <view class="comment-composer-heading">
      <text class="comment-composer-title">{{ title }}</text>
      <button class="comment-composer-close" aria-label="收起回复编辑框" @click="close">×</button>
    </view>
    <view v-if="$slots.context" class="comment-composer-context"><slot name="context" /></view>
    <textarea
      v-if="editable"
      class="comment-composer-input"
      :value="modelValue"
      :maxlength="maxlength"
      :disabled="disabled"
      :focus="focus"
      placeholder="善意表达，认真回应…"
      placeholder-class="field-placeholder"
      aria-label="回复内容"
      @input="input"
    />
    <slot name="identity" />
    <view v-if="editable || canCancel" class="comment-composer-footer">
      <view v-if="editable" class="comment-composer-meta">
        <text v-if="identityLabel" class="comment-composer-identity">{{ identityLabel }}</text>
        <text class="comment-composer-count">{{ characterCount }} / {{ countLimit }}</text>
      </view>
      <view class="comment-composer-actions">
        <slot name="actions" />
        <button
          v-if="canCancel"
          class="comment-composer-cancel"
          :disabled="cancelLocked"
          @click="cancel"
        >
          取消
        </button>
        <button
          v-if="editable"
          class="comment-composer-submit"
          :disabled="submitLocked"
          :loading="loading"
          @click="submit"
        >
          {{ submitLabel }}
        </button>
      </view>
    </view>
    <view v-if="$slots.feedback" class="comment-composer-feedback"><slot name="feedback" /></view>
  </view>
</template>

<style scoped>
.comment-composer-panel {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  min-width: 0;
  margin: 36rpx 0;
  padding: 32rpx;
  border: 2rpx solid var(--theme-brand);
  border-radius: 28rpx;
  background: var(--theme-surface);
  box-shadow: 0 8rpx 40rpx #091d3d05;
}
/* 微信端 hidden 属性会被容器的 flex 覆盖，收起时同时显式隐藏。 */
.comment-composer-panel-hidden {
  display: none;
}
.comment-composer-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 8rpx;
}
.comment-composer-title {
  min-width: 0;
  color: var(--theme-ink);
  font-size: 28rpx;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.comment-composer-close {
  flex: 0 0 56rpx;
  width: 56rpx;
  min-height: 56rpx;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--theme-muted);
  font-size: 38rpx;
  line-height: 56rpx;
}
.comment-composer-input {
  box-sizing: border-box;
  width: 100%;
  height: 220rpx;
  min-height: 220rpx;
  margin: 0;
  padding: 20rpx;
  border: 2rpx solid var(--theme-line);
  border-radius: 18rpx;
  background: var(--theme-canvas);
  color: var(--theme-ink);
  font-size: 28rpx;
  line-height: 1.7;
}
.comment-composer-context,
.comment-composer-feedback {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  min-width: 0;
}
.comment-composer-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.comment-composer-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
  min-width: 0;
  font-size: 22rpx;
  color: var(--theme-muted);
}
.comment-composer-identity {
  max-width: 100%;
  padding: 4rpx 12rpx;
  border-radius: 10rpx;
  background: var(--theme-mint);
  color: var(--theme-teal);
  overflow-wrap: anywhere;
}
.comment-composer-count {
  white-space: nowrap;
}
.comment-composer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
  max-width: 100%;
  gap: 12rpx;
  margin-left: auto;
}
.comment-composer-submit,
.comment-composer-cancel {
  width: auto;
  min-height: 72rpx;
  margin: 0;
  padding: 12rpx 28rpx;
  border: 0;
  border-radius: 16rpx;
  font-size: 26rpx;
  line-height: 1.7;
}
.comment-composer-submit {
  min-width: 128rpx;
  background: var(--theme-brand);
  color: var(--theme-on-brand);
}
.comment-composer-cancel {
  background: var(--theme-canvas);
  color: var(--theme-muted);
}
.comment-composer-close::after,
.comment-composer-submit::after,
.comment-composer-cancel::after {
  border: 0;
}
</style>
