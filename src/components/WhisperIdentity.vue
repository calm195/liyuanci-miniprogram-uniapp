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
  const index = Number(event.detail.value)
  if (!Number.isInteger(index) || index < 0) return
  const value =
    field === 'campus'
      ? identityCampuses[index]?.value
      : field === 'gender'
        ? genders[index]?.value
        : props.config?.grade_dictionary.items[index]?.code
  if (value) tag(field, value)
}
</script>
<template>
  <view class="card">
    <text>身份展示</text>
    <button :disabled="disabled" @click="runPageAction(() => choose('anonymous'))">
      {{ mode === 'anonymous' ? '已选：完全匿名' : '完全匿名' }}
    </button>
    <button :disabled="disabled || !semi" @click="runPageAction(() => choose('semi'))">
      {{ mode === 'semi' ? '已选：半匿名' : '半匿名' }}
    </button>
    <text v-if="!semi">受控年级资料未就绪，半匿名暂不可选。</text>
    <button :disabled="disabled || !nickname?.active" @click="runPageAction(() => choose('named'))">
      {{ mode === 'named' ? '已选：树洞昵称' : '树洞昵称' }}
    </button>
    <text v-if="!nickname?.active">仅已审昵称可用，待审候选不能用于发布。</text>
    <navigator url="/pages/whispers/nickname">管理树洞昵称（离开会清空未保存正文）</navigator>
    <view v-if="mode === 'semi' && semi">
      <text>标签全部由本人选择，不从学生认证资料推断。</text>
      <picker
        :disabled="disabled"
        :range="identityCampuses"
        range-key="label"
        @change="runPageAction(() => pick('campus', $event))"
        ><text
          >校区：{{
            campuses.find((item) => item.value === tags.campus)?.label || '请选择校区'
          }}</text
        ></picker
      >
      <picker
        :disabled="disabled"
        :range="genders"
        range-key="label"
        @change="runPageAction(() => pick('gender', $event))"
        ><text
          >性别：{{
            genders.find((item) => item.value === tags.gender)?.label || '请选择性别'
          }}</text
        ></picker
      >
      <picker
        :disabled="disabled"
        :range="config?.grade_dictionary.items || []"
        range-key="label"
        @change="runPageAction(() => pick('grade', $event))"
        ><text
          >年级：{{
            config?.grade_dictionary.items.find((item) => item.code === tags.grade)?.label ||
            '请选择年级'
          }}</text
        ></picker
      >
    </view>
    <text>展示预览：{{ preview }}</text>
    <text>实际公开展示以当前审核投影为准，不关联个人主页。</text>
  </view>
</template>
