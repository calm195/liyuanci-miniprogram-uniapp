<script setup lang="ts">
import type { MatchmakingProfileDraft } from '@/types/matchmaking'
import { campuses, genders } from '@/types/wish'
import { matchmakingEducations } from '@/utils/matchmaking'
const props = defineProps<{
  modelValue: MatchmakingProfileDraft
  grades: { code: string; label: string }[]
  disabled: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: MatchmakingProfileDraft] }>()
type TextField = 'name' | 'wechat' | 'introduction'
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
const campusOptions = campuses.filter((item) => item.value !== 'any')
const genderOptions = genders.filter((item) => item.value !== 'undisclosed')
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
function select(
  key: 'gender' | 'campus' | 'education' | 'grade',
  event: { detail: { value: string | number } },
) {
  const index = Number(event.detail.value)
  let value: string | undefined
  if (key === 'gender') value = genderOptions[index]?.value
  else if (key === 'campus') value = campusOptions[index]?.value
  else if (key === 'education') value = matchmakingEducations[index]
  else value = props.grades[index]?.code
  if (value !== undefined) emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>
<template>
  <view class="match-form">
    <text class="section-title">关于你</text>
    <label class="field"
      ><text>姓名</text
      ><input
        :value="modelValue.name"
        :disabled="disabled"
        maxlength="32"
        placeholder="填写参与活动使用的姓名"
        @input="input('name', $event)"
    /></label>
    <view class="form-grid">
      <picker
        :disabled="disabled"
        :range="genderOptions"
        range-key="label"
        :value="genderOptions.findIndex((item) => item.value === modelValue.gender)"
        @change="select('gender', $event)"
        ><view class="picker-field"
          >性别：{{
            genderOptions.find((item) => item.value === modelValue.gender)?.label || '请选择'
          }}
          ›</view
        ></picker
      >
      <picker
        :disabled="disabled"
        :range="campusOptions"
        range-key="label"
        :value="
          Math.max(
            0,
            campusOptions.findIndex((item) => item.value === modelValue.campus),
          )
        "
        @change="select('campus', $event)"
        ><view class="picker-field"
          >校区：{{
            campusOptions.find((item) => item.value === modelValue.campus)?.label || '请选择'
          }}
          ›</view
        ></picker
      >
      <picker
        :disabled="disabled"
        :range="matchmakingEducations"
        :value="Math.max(0, matchmakingEducations.indexOf(modelValue.education))"
        @change="select('education', $event)"
        ><view class="picker-field">学历：{{ modelValue.education || '请选择' }} ›</view></picker
      >
      <picker
        :disabled="disabled || !grades.length"
        :range="grades"
        range-key="label"
        :value="
          Math.max(
            0,
            grades.findIndex((item) => item.code === modelValue.grade),
          )
        "
        @change="select('grade', $event)"
        ><view class="picker-field"
          >年级：{{
            grades.find((item) => item.code === modelValue.grade)?.label || '请选择'
          }}
          ›</view
        ></picker
      >
    </view>
    <text v-if="!grades.length" class="form-help">年级选项暂不可用，请刷新资格后填写。</text>
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
.picker-field,
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
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}
.picker-field {
  font-size: 25rpx;
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
