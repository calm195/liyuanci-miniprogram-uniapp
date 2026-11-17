<script setup lang="ts">
import { computed } from 'vue'
import { campuses } from '@/types/wish'
import { matchmakingMbtis } from '@/utils/matchmaking'
import MatchmakingTraits from '@/components/MatchmakingTraits.vue'
import type {
  MatchmakingPreferences,
  MatchmakingTraitSelection,
  MatchmakingTraitCategories,
} from '@/types/matchmaking'
const props = defineProps<{
  modelValue: MatchmakingPreferences
  disabled: boolean
  step?: number
  traitSelections?: MatchmakingTraitSelection[]
  personalTraitSelections?: MatchmakingTraitSelection[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: MatchmakingPreferences]
  'update:step': [value: number]
}>()
const steps = ['关于我', '我的期待', '确认资料']
function changeTraits(
  purpose: 'personal' | 'ideal',
  value: { traits: string[]; categories: MatchmakingTraitCategories },
) {
  emit('update:modelValue', {
    ...props.modelValue,
    [`${purpose}_traits`]: value.traits,
    [`${purpose}_trait_categories`]: value.categories,
  })
}
const currentStep = computed(() => props.step ?? 1)
function changeStep(value: number) {
  if (props.disabled || value < 1 || value > steps.length) return
  emit('update:step', value)
}
function togglePreference(key: 'preferred_campuses' | 'preferred_mbti', code: string) {
  if (props.disabled) return
  const current = props.modelValue[key] ?? []
  const selected = !code
    ? []
    : current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code]
  emit('update:modelValue', { ...props.modelValue, [key]: selected })
}
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
const campusSummary = computed(() =>
  props.modelValue.preferred_campuses?.length
    ? props.modelValue.preferred_campuses
        .map((code) => campuses.find((item) => item.value === code)?.label || code)
        .join('、')
    : '不限校区',
)
function inputValue(event: unknown): string {
  const value = (event as { detail?: { value?: unknown } }).detail?.value
  return typeof value === 'string' ? value : ''
}
function input(key: TextField, event: unknown) {
  if (props.disabled) return
  emit('update:modelValue', { ...props.modelValue, [key]: inputValue(event) })
}
function numeric(key: NumberField, event: unknown) {
  if (props.disabled) return
  emit('update:modelValue', { ...props.modelValue, [key]: Number(inputValue(event)) })
}
</script>
<template>
  <view class="match-form">
    <view class="form-progress" aria-label="填写资料进度">
      <button
        v-for="(label, index) in steps"
        :key="label"
        class="progress-step"
        :class="{ active: currentStep === index + 1, passed: currentStep > index + 1 }"
        :disabled="disabled"
        :aria-current="currentStep === index + 1 ? 'step' : undefined"
        @click="changeStep(index + 1)"
      >
        <text class="content-text step-number">{{ index + 1 }}</text
        ><text class="content-text">{{ label }}</text>
      </button>
    </view>
    <!-- 步骤仅切换显示，保留分类输入及推荐状态，避免返回时丢失未添加的文字。 -->
    <view v-show="currentStep === 1" class="form-panel" data-profile-step="1">
      <view class="form-section-heading"
        ><text class="content-text section-title">关于我</text
        ><text class="content-text form-help">让对方从这些小事开始认识你。</text></view
      >
      <slot name="identity" />
      <view class="self-fields">
        <label v-for="group in numericGroups" :key="group.self" class="field"
          ><text class="content-text"
            >{{ group.label }} <text class="content-text field-unit">{{ group.unit }}</text></text
          ><input
            type="number"
            :value="modelValue[group.self] || ''"
            :disabled="disabled"
            :placeholder="`${group.low}–${group.high}`"
            @input="numeric(group.self, $event)"
        /></label>
      </view>
      <MatchmakingTraits
        purpose="personal"
        :model-value="modelValue.personal_traits ?? []"
        :selections="personalTraitSelections ?? []"
        :categories="modelValue.personal_trait_categories"
        :disabled="disabled"
        @change="changeTraits('personal', $event)"
      />
      <label class="field"
        ><text class="content-text">自我介绍</text
        ><textarea
          :value="modelValue.introduction"
          :disabled="disabled"
          maxlength="500"
          placeholder="聊聊你的兴趣、性格和想一起做的事"
          @input="input('introduction', $event)"
        /><text class="content-text field-counter"
          >{{ Array.from(modelValue.introduction).length }} / 500</text
        ></label
      >
      <label class="field"
        ><text class="content-text">微信号 <text class="content-text field-unit">选填</text></text
        ><input
          :value="modelValue.wechat"
          :disabled="disabled"
          maxlength="64"
          placeholder="仅向当前有效配对对象展示"
          @input="input('wechat', $event)"
      /></label>
      <text class="content-text form-help">只向有效配对对象展示，其他同学不可见。</text>
    </view>
    <view v-show="currentStep === 2" class="form-panel" data-profile-step="2">
      <view class="form-section-heading"
        ><text class="content-text section-title">我的期待</text
        ><text class="content-text form-help">选择重要的偏好，也给相遇一些可能。</text></view
      >
      <view v-for="group in numericGroups" :key="group.min" class="numeric-group">
        <view class="range-fields">
          <label class="field"
            ><text class="content-text"
              >{{ group.label }}下限
              <text class="content-text field-unit">{{ group.unit }}</text></text
            ><input
              type="number"
              :value="modelValue[group.min] || ''"
              :disabled="disabled"
              placeholder="最低值"
              @input="numeric(group.min, $event)"
          /></label>
          <label class="field"
            ><text class="content-text"
              >{{ group.label }}上限
              <text class="content-text field-unit">{{ group.unit }}</text></text
            ><input
              type="number"
              :value="modelValue[group.max] || ''"
              :disabled="disabled"
              placeholder="最高值"
              @input="numeric(group.max, $event)"
          /></label>
        </view>
      </view>
      <view class="preference-group"
        ><text class="content-text field-label"
          >期望校区 <text class="content-text field-unit">可多选</text></text
        ><view class="preference-options"
          ><button
            :disabled="disabled"
            :class="{ selected: !modelValue.preferred_campuses?.length }"
            @click="togglePreference('preferred_campuses', '')"
          >
            不限校区</button
          ><template v-for="campus in campuses" :key="campus.value"
            ><button
              v-if="campus.value !== 'any'"
              :disabled="disabled"
              :class="{ selected: modelValue.preferred_campuses?.includes(campus.value) }"
              @click="togglePreference('preferred_campuses', campus.value)"
            >
              {{ campus.label }}
            </button></template
          ></view
        ></view
      >
      <view class="preference-group"
        ><text class="content-text field-label"
          >期望 MBTI <text class="content-text field-unit">可多选</text></text
        ><view class="preference-options"
          ><button
            :disabled="disabled"
            :class="{ selected: !modelValue.preferred_mbti?.length }"
            @click="togglePreference('preferred_mbti', '')"
          >
            不限</button
          ><button
            v-for="type in matchmakingMbtis"
            :key="type"
            :disabled="disabled"
            :class="{ selected: modelValue.preferred_mbti?.includes(type) }"
            @click="togglePreference('preferred_mbti', type)"
          >
            {{ type }}
          </button></view
        ></view
      >
      <MatchmakingTraits
        purpose="ideal"
        end-of-step
        :model-value="modelValue.ideal_traits ?? []"
        :selections="traitSelections ?? []"
        :categories="modelValue.ideal_trait_categories"
        :disabled="disabled"
        @change="changeTraits('ideal', $event)"
      />
    </view>
    <view v-show="currentStep === 3" class="form-panel" data-profile-step="3">
      <view class="form-section-heading"
        ><text class="content-text section-title">确认资料</text
        ><text class="content-text form-help">这些内容将随你的报名保存。</text></view
      >
      <view class="profile-review"
        ><view v-for="group in numericGroups" :key="group.self" class="review-row"
          ><text class="content-text">{{ group.label }}</text
          ><text class="content-text"
            >{{ modelValue[group.self] || '未填' }} {{ group.unit }} · 期待
            {{ modelValue[group.min] || '未填' }}–{{ modelValue[group.max] || '未填' }}
            {{ group.unit }}</text
          ></view
        ><view class="review-row"
          ><text class="content-text">期望校区</text
          ><text class="content-text">{{ campusSummary }}</text></view
        ><view class="review-row"
          ><text class="content-text">期望 MBTI</text
          ><text class="content-text">{{
            modelValue.preferred_mbti?.join('、') || '不限'
          }}</text></view
        ><view class="review-row"
          ><text class="content-text">个人特质</text
          ><text class="content-text">{{
            modelValue.personal_traits?.join('、') || '暂未填写'
          }}</text></view
        ><view class="review-row"
          ><text class="content-text">理想型特质</text
          ><text class="content-text">{{
            modelValue.ideal_traits?.join('、') || '暂未填写'
          }}</text></view
        ><view class="review-row"
          ><text class="content-text">自我介绍</text
          ><text class="content-text">{{ modelValue.introduction || '暂未填写' }}</text></view
        ><view class="review-row"
          ><text class="content-text">微信号</text
          ><text class="content-text">{{ modelValue.wechat || '未填写' }}</text></view
        ></view
      >
      <text class="content-text form-help privacy-note"
        >资料用于报名审核，并向当前有效配对对象展示。保存后请返回活动确认报名；已报名资料需要在活动中更新。</text
      >
    </view>
    <view class="step-navigation"
      ><button
        v-if="currentStep > 1"
        class="step-back"
        :disabled="disabled"
        @click="changeStep(currentStep - 1)"
      >
        上一步</button
      ><button
        v-if="currentStep < 3"
        class="step-next"
        :disabled="disabled"
        @click="changeStep(currentStep + 1)"
      >
        下一步</button
      ><slot v-else name="submit"
    /></view>
  </view>
</template>
<style scoped>
.content-text {
  margin: 0;
}
.match-form {
  display: grid;
  gap: 24rpx;
}
.form-progress {
  display: flex;
  gap: 12rpx;
  padding: 0;
}
.form-progress .progress-step {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  margin: 0;
  padding: 20rpx 4rpx;
  border: 0;
  border-radius: 20rpx;
  background: transparent;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.5;
}
.progress-step.active {
  background: var(--match-soft, var(--theme-peach));
  color: var(--match-accent, var(--theme-teal));
  font-weight: 600;
}
.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 50%;
  font-size: 20rpx;
}
.active .step-number,
.passed .step-number {
  background: var(--match-accent, var(--theme-teal));
  border-color: transparent;
  color: var(--match-on-accent, #fff);
}
.form-panel {
  padding: 32rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 32rpx;
  background: var(--theme-surface);
}
.form-section-heading,
.self-fields,
.numeric-group,
.preference-group,
.profile-review,
.form-panel > .field {
  margin-bottom: 32rpx;
}
.form-panel > view:last-child,
.form-panel > label:last-child {
  margin-bottom: 0;
}
.form-section-heading {
  display: grid;
  gap: 8rpx;
}
.form-section-heading .section-title {
  line-height: 1.5;
}
.form-eyebrow {
  color: var(--match-accent, var(--theme-teal));
  font-size: 20rpx;
  letter-spacing: 2rpx;
}
.self-fields {
  padding-bottom: 32rpx;
  margin-bottom: 0 !important;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24rpx;
}
.field {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  display: grid;
  gap: 12rpx;
  color: var(--theme-muted);
  font-size: 24rpx;
}
.field-unit {
  display: inline;
  color: var(--theme-muted);
  font-size: 22rpx;
  font-weight: 400;
}
.field input,
.range-fields input,
.field textarea {
  margin: 0;
  width: 100%;
  min-width: 0;
  height: 88rpx;
  min-height: 88rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 16rpx;
  background: var(--theme-canvas);
  padding: 20rpx;
  line-height: 1.5;
  font-size: 28rpx;
}
.field textarea {
  height: 176rpx;
}
.field-counter {
  margin-top: -4rpx;
  text-align: right;
  color: var(--theme-muted);
  font-size: 22rpx;
}
.numeric-group,
.preference-group {
  display: grid;
  gap: 16rpx;
}
.field-label {
  font-weight: 600;
  font-size: 28rpx;
}
.range-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24rpx;
  align-items: center;
}
.range-fields > text {
  color: var(--theme-muted);
  font-size: 24rpx;
}
.preference-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.preference-options button {
  margin: 0;
  padding: 12rpx 24rpx;
  border: 1rpx solid var(--theme-line);
  background: var(--theme-canvas);
  color: var(--theme-muted);
  border-radius: 40rpx;
  font-size: 24rpx;
  line-height: 1.6;
}
.preference-options .selected {
  border-color: var(--match-accent, var(--theme-teal));
  background: var(--match-soft, var(--theme-mint));
  color: var(--match-accent, var(--theme-teal));
}
.form-help {
  margin: 0;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.profile-review {
  padding: 0;
}
.review-row {
  display: flex;
  justify-content: space-between;
  gap: 32rpx;
  padding: 24rpx 0;
  border-bottom: 2rpx solid var(--theme-line);
  font-size: 28rpx;
  line-height: 1.6;
}
.review-row:last-child {
  border: 0;
}
.review-row > text:first-child {
  flex-shrink: 0;
  color: var(--theme-muted);
}
.review-row > text:last-child {
  text-align: right;
  overflow-wrap: anywhere;
}
.privacy-note {
  display: block;
  padding-top: 0;
}
.step-navigation {
  display: flex;
  gap: 24rpx;
}
.step-navigation button {
  flex: 1;
  margin: 0;
  min-height: 88rpx;
  padding: 20rpx 36rpx;
  border-radius: 24rpx;
  font-size: 28rpx;
  line-height: 1.6;
}
.step-navigation .step-next {
  color: var(--match-on-accent, #fff);
  background: var(--match-accent, var(--theme-teal));
  border-color: transparent;
}
.step-navigation .step-back {
  color: var(--match-accent, var(--theme-teal));
  background: var(--match-soft, var(--theme-peach));
  border: 0;
}
.form-panel[hidden] {
  display: none !important;
}
</style>
