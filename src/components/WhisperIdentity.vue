<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { campuses, genders } from '@/types/wish'
import type { WhisperTagsDraft } from '@/utils/whisper-content'
import {
  semiReady,
  whisperIdentityPreview,
  whisperTagLabels,
  whisperTagsDraft,
} from '@/utils/whisper-content'
import WhisperIdentityPreview from '@/components/WhisperIdentityPreview.vue'
import WhisperNicknameSetup from '@/components/WhisperNicknameSetup.vue'
import type { IdentityInput, ModuleConfig, NicknameState } from '@/types/whispers'
import { useUserStore } from '@/stores/user'
const props = defineProps<{
  mode: IdentityInput['mode']
  tags: WhisperTagsDraft
  config: ModuleConfig | null
  nickname: NicknameState | null
  disabled: boolean
  profileDefaults?: boolean
  comment?: boolean
  originalNicknameUnavailable?: boolean
}>()
const user = useUserStore()
const identityCampuses = campuses.filter((item) => item.value !== 'any')
const emit = defineEmits<{
  'update:mode': [value: IdentityInput['mode']]
  'update:tags': [value: WhisperTagsDraft]
  'update:nickname': [value: NicknameState]
}>()
const semi = computed(() => semiReady(props.config))
const nicknameOpen = ref(false)
const profileTags = computed<WhisperTagsDraft | null>(() => {
  if (!props.profileDefaults || !user.validated || user.user?.verification !== 'verified')
    return null
  const tags = user.user.identity_tags
  const campus = tags?.campus
  const gender = tags?.gender
  const grade = tags?.grade
  return {
    campus: campus && campus !== 'any' ? campus : '',
    gender: gender && gender !== 'undisclosed' ? gender : '',
    grade:
      grade && props.config?.grade_dictionary.items.some((item) => item.code === grade)
        ? grade
        : '',
  }
})
let selectedSemi = false
const uncheckedTags = reactive(whisperTagsDraft())
const candidates = computed<WhisperTagsDraft>(() => ({
  campus: props.tags.campus || uncheckedTags.campus || profileTags.value?.campus || '',
  gender: props.tags.gender || uncheckedTags.gender || profileTags.value?.gender || '',
  grade: props.tags.grade || uncheckedTags.grade || profileTags.value?.grade || '',
}))
const labels = computed(() => whisperTagLabels(candidates.value, props.config))
const fields = { campus: '校区', grade: '年级', gender: '性别' } as const
const modes = [
  { value: 'anonymous', label: '完全匿名' },
  { value: 'semi', label: '半匿名' },
  { value: 'named', label: '树洞昵称' },
] as const
const noTags = computed(() => !props.tags.campus && !props.tags.gender && !props.tags.grade)
const preview = computed(() =>
  whisperIdentityPreview(
    props.mode,
    props.tags,
    props.config,
    props.originalNicknameUnavailable ? undefined : props.nickname?.active?.label,
    user.user?.hide_identity_tags,
    props.comment ? user.user?.nickname : undefined,
  ),
)
function unavailable(mode: IdentityInput['mode']) {
  return (mode === 'semi' && !semi.value) || (mode === 'named' && !props.config?.enabled)
}
function choose(mode: IdentityInput['mode']) {
  if (props.disabled || unavailable(mode)) return
  nicknameOpen.value = mode === 'named' && !props.nickname?.active
  if (nicknameOpen.value) return
  if (props.mode === 'semi' || !noTags.value) selectedSemi = true
  if (mode === 'semi' && !selectedSemi && profileTags.value) {
    selectedSemi = true
    emit('update:tags', { ...profileTags.value })
  }
  emit('update:mode', mode)
}
function tag(field: keyof WhisperTagsDraft, value: string) {
  if (!props.disabled) emit('update:tags', { ...props.tags, [field]: value })
}
function toggleTag(field: keyof WhisperTagsDraft, event: unknown) {
  const checked = (event as { detail?: { value: boolean } }).detail?.value
  if (props.disabled || typeof checked !== 'boolean') return
  if (!checked) Object.assign(uncheckedTags, { [field]: props.tags[field] })
  tag(field, checked ? (candidates.value[field] ?? '') : '')
}
function pick(field: keyof WhisperTagsDraft, event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value) - 1
  if (!Number.isInteger(index) || index < -1) return
  const value =
    field === 'campus'
      ? identityCampuses[index]?.value
      : field === 'gender'
        ? genders[index]?.value
        : props.config?.grade_dictionary.items[index]?.code
  tag(field, value ?? '')
}
</script>
<template>
  <view class="identity-card">
    <text class="identity-title">身份展示</text>
    <view class="identity-choices">
      <button
        v-for="item in modes"
        :key="item.value"
        class="identity-option"
        :class="{ 'identity-selected': mode === item.value }"
        :aria-pressed="mode === item.value"
        :aria-expanded="item.value === 'named' && !nickname?.active ? nicknameOpen : undefined"
        :disabled="disabled || unavailable(item.value)"
        @click="choose(item.value)"
      >
        {{ item.label }}
      </button>
    </view>
    <text v-if="!semi" class="identity-hint">身份标签暂不可用，仍可选择其他身份。</text>
    <text
      v-if="!nickname?.active && !nicknameOpen && !(comment && mode === 'semi')"
      class="identity-hint"
    >
      点击树洞昵称可配置或查看审核进度。
    </text>
    <WhisperNicknameSetup
      v-if="nicknameOpen"
      :initial-state="nickname"
      :disabled="disabled"
      @update:state="emit('update:nickname', $event)"
      @close="nicknameOpen = false"
    />
    <view v-if="mode === 'semi' && semi && profileTags" class="tag-settings">
      <text class="identity-hint">
        {{
          Object.values(profileTags).some(Boolean)
            ? '来自个人资料，可选择展示的项目。'
            : '可在个人资料补充身份标签。'
        }}
      </text>
      <view v-for="(name, field) in fields" :key="field" class="tag-toggle">
        <view class="tag-caption">
          <text>{{ name }}</text>
          <text class="identity-hint">{{
            labels[field] || (tags[field] ? '原选项已停用' : '未填写')
          }}</text>
        </view>
        <switch
          :aria-label="`展示${name}`"
          :checked="!!tags[field]"
          :disabled="disabled || (!labels[field] && !tags[field])"
          @change="toggleTag(field, $event)"
        />
      </view>
    </view>
    <view v-else-if="mode === 'semi' && semi">
      <text class="ui-copy">选择希望展示的标签。</text>
      <picker
        class="ui-picker"
        :disabled="disabled"
        :range="[{ value: '', label: '不公开' }, ...identityCampuses]"
        range-key="label"
        @change="runPageAction(() => pick('campus', $event))"
        ><text class="ui-copy"
          >校区：{{ campuses.find((item) => item.value === tags.campus)?.label || '不公开' }}</text
        ></picker
      >
      <picker
        class="ui-picker"
        :disabled="disabled"
        :range="[{ value: '', label: '不公开' }, ...genders]"
        range-key="label"
        @change="runPageAction(() => pick('gender', $event))"
        ><text class="ui-copy"
          >性别：{{ genders.find((item) => item.value === tags.gender)?.label || '不公开' }}</text
        ></picker
      >
      <picker
        class="ui-picker"
        :disabled="disabled"
        :range="[{ code: '', label: '不公开' }, ...(config?.grade_dictionary.items || [])]"
        range-key="label"
        @change="runPageAction(() => pick('grade', $event))"
        ><text class="ui-copy"
          >年级：{{
            config?.grade_dictionary.items.find((item) => item.code === tags.grade)?.label ||
            '不公开'
          }}</text
        ></picker
      >
    </view>
    <text v-if="mode === 'semi' && noTags" class="identity-hint identity-warning">
      保留至少一项，或选择完全匿名。
    </text>
    <WhisperIdentityPreview :value="preview" />
  </view>
</template>

<style scoped>
.identity-card {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  min-width: 0;
  padding: 28rpx;
  border: 1px solid var(--theme-line);
  border-radius: 34rpx;
  background: var(--theme-surface);
}
.identity-title {
  margin: 0;
  color: var(--theme-ink);
  font-size: 32rpx;
  font-weight: 700;
}
.identity-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.identity-choices .identity-option {
  flex: 1 0 26%;
  min-width: 0;
  min-height: 44px;
  margin: 0;
  padding: 8rpx;
  border: 1px solid var(--theme-line);
  border-radius: 20rpx;
  background: var(--theme-surface);
  color: var(--theme-ink);
  font-size: 25rpx;
  line-height: 1.4;
}
.identity-option::after {
  border: 0;
}
.identity-choices .identity-selected {
  border-color: var(--theme-teal);
  background: var(--theme-mint);
  color: var(--theme-teal);
  font-weight: 650;
}
.tag-settings {
  display: flex;
  flex-direction: column;
}
.tag-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  min-height: 47px;
  border-bottom: 1px solid var(--theme-line);
}
.tag-caption {
  display: flex;
  flex-wrap: wrap;
  gap: 4rpx 12rpx;
  min-width: 0;
  font-size: 27rpx;
}
.tag-caption text,
.identity-hint {
  margin: 0;
}
.identity-hint {
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.5;
}
.identity-warning {
  color: var(--theme-danger);
}
</style>
