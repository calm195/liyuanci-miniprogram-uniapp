<script setup lang="ts">
import { computed } from 'vue'
import { campuses, genders } from '@/types/wish'
import type { WhisperTagsDraft } from '@/utils/whisper-content'
import { semiReady } from '@/utils/whisper-content'
import type { IdentityInput, ModuleConfig, NicknameState } from '@/types/whispers'
const props = defineProps<{
  mode: IdentityInput['mode']
  tags: WhisperTagsDraft
  config: ModuleConfig | null
  nickname: NicknameState | null
  disabled: boolean
}>()
const identityCampuses = campuses.filter((item) => item.value !== 'any')
const emit = defineEmits<{
  'update:mode': [value: IdentityInput['mode']]
  'update:tags': [value: WhisperTagsDraft]
}>()
const semi = computed(() => semiReady(props.config))
const preview = computed(() =>
  props.mode === 'named'
    ? (props.nickname?.active?.label ?? '昵称尚未可用')
    : props.mode === 'semi'
      ? '自选标签 + 本帖随机别名（隐藏设置优先）'
      : '随机别名由系统在帖子内分配，跨帖重新分配',
)
function choose(mode: IdentityInput['mode']) {
  if (
    props.disabled ||
    (mode === 'semi' && !semi.value) ||
    (mode === 'named' && !props.nickname?.active)
  )
    return
  emit('update:mode', mode)
}
function tag(field: keyof WhisperTagsDraft, value: string) {
  if (!props.disabled) emit('update:tags', { ...props.tags, [field]: value })
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
  <view class="ui-section ce-group">
    <text class="ui-section-title">身份展示</text>
    <button
      class="ui-button"
      :disabled="disabled"
      :loading="isPageActionPending('components-WhisperIdentity-button-1')"
      :class="{ 'identity-selected': mode === 'anonymous' }"
      @click="runPageAction(() => choose('anonymous'), 'components-WhisperIdentity-button-1')"
    >
      {{ mode === 'anonymous' ? '已选：完全匿名' : '完全匿名' }}
    </button>
    <button
      class="ui-button"
      :disabled="disabled || !semi"
      :loading="isPageActionPending('components-WhisperIdentity-button-2')"
      :class="{ 'identity-selected': mode === 'semi' }"
      @click="runPageAction(() => choose('semi'), 'components-WhisperIdentity-button-2')"
    >
      {{ mode === 'semi' ? '已选：半匿名' : '半匿名' }}
    </button>
    <text v-if="!semi" class="ui-copy">受控年级资料未就绪，半匿名暂不可选。</text>
    <button
      class="ui-button"
      :disabled="disabled || !nickname?.active"
      :loading="isPageActionPending('components-WhisperIdentity-button-3')"
      :class="{ 'identity-selected': mode === 'named' }"
      @click="runPageAction(() => choose('named'), 'components-WhisperIdentity-button-3')"
    >
      {{ mode === 'named' ? '已选：树洞昵称' : '树洞昵称' }}
    </button>
    <text v-if="!nickname?.active" class="ui-copy">仅已审昵称可用，待审候选不能用于发布。</text>
    <text v-if="!nickname?.active" class="ui-copy">可以到个人中心的悄悄话设置中管理昵称。</text>
    <view v-if="mode === 'semi' && semi">
      <text class="ui-copy">可只选择校区等一项标签，其余选择不公开，不从认证资料推断。</text>
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
    <text class="ui-copy">展示预览：{{ preview }}</text>
    <text class="ui-copy">实际公开展示以当前审核投影为准，不关联个人主页。</text>
  </view>
</template>

<style scoped>
.ui-section.ce-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  min-width: 0;
}
.ui-button.identity-selected {
  border-color: var(--theme-brand);
  color: var(--theme-brand);
  background: var(--theme-peach);
}
</style>
