<script setup lang="ts">
import type { MatchmakingPreferences } from '@/types/matchmaking'
const props = defineProps<{
  modelValue: MatchmakingPreferences
  disabled: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: MatchmakingPreferences] }>()
type TextField = 'wechat' | 'introduction'
type NumberField =
  | 'age'
  | 'age_min'
  | 'age_max'
  | 'height'
  | 'height_min'
  | 'height_max'
  | 'weight'
  | 'weight_min'
  | 'weight_max'
const numericGroups: {
  label: string
  unit: string
  self: NumberField
  min: NumberField
  max: NumberField
  low: number
  high: number
}[] = [
  { label: '年龄', unit: '岁', self: 'age', min: 'age_min', max: 'age_max', low: 18, high: 80 },
  {
    label: '身高',
    unit: 'cm',
    self: 'height',
    min: 'height_min',
    max: 'height_max',
    low: 100,
    high: 250,
  },
  {
    label: '体重',
    unit: '斤',
    self: 'weight',
    min: 'weight_min',
    max: 'weight_max',
    low: 50,
    high: 500,
  },
]
function inputValue(event: unknown): string {
  const value = (event as { detail?: { value?: unknown } }).detail?.value
  return typeof value === 'string' ? value : ''
}
function input(key: TextField, event: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: inputValue(event) })
}
function numeric(key: NumberField, event: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: Number(inputValue(event)) })
}
</script>
<template>
  <view class="match-form">
    <text class="section-title">个人数据与期待</text>
    <view v-for="group in numericGroups" :key="group.self" class="numeric-group">
      <label class="field"
        ><text>我的{{ group.label }}（{{ group.unit }}）</text
        ><input
          type="number"
          :value="modelValue[group.self] || ''"
          :disabled="disabled"
          :placeholder="`${group.low}–${group.high}`"
          @input="numeric(group.self, $event)"
      /></label>
      <text class="form-help">期待对方的{{ group.label }}范围（{{ group.unit }}）</text>
      <view class="range-fields">
        <input
          type="number"
          :value="modelValue[group.min] || ''"
          :disabled="disabled"
          placeholder="最低值"
          @input="numeric(group.min, $event)"
        />
        <text>至</text>
        <input
          type="number"
          :value="modelValue[group.max] || ''"
          :disabled="disabled"
          placeholder="最高值"
          @input="numeric(group.max, $event)"
        />
      </view>
    </view>
    <text class="section-title">认识彼此</text>
    <label class="field"
      ><text>微信号（选填）</text
      ><input
        :value="modelValue.wechat"
        :disabled="disabled"
        maxlength="64"
        placeholder="选填，随报名资料向有效配对对象展示"
        @input="input('wechat', $event)"
    /></label>
    <label class="field"
      ><text>自我介绍</text
      ><textarea
        :value="modelValue.introduction"
        :disabled="disabled"
        maxlength="500"
        placeholder="聊聊你的兴趣、性格和想一起做的事（最多500字）"
        @input="input('introduction', $event)"
      />
    </label>
  </view>
</template>
<style scoped>
.match-form {
  display: grid;
  gap: 24rpx;
}
.field {
  display: grid;
  gap: 14rpx;
}
.field input,
.range-fields input,
.field textarea {
  border: 1rpx solid var(--theme-line);
  border-radius: 18rpx;
  background: var(--theme-surface);
  padding: 22rpx;
  min-height: 42rpx;
}
.field textarea {
  width: auto;
  min-height: 180rpx;
}
.numeric-group {
  display: grid;
  gap: 14rpx;
}
.range-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 18rpx;
  align-items: center;
}
.range-fields input {
  min-width: 0;
}
.form-help {
  font-size: 24rpx;
  opacity: 0.75;
  line-height: 1.7;
}
</style>
