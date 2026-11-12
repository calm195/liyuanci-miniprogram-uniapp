<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { campuses, genders } from '@/types/wish'
import type { IdentityTags } from '@/types/wish'
const props = defineProps<{
  mode: 'named' | 'semi'
  tags: IdentityTags
  locked?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:mode': [value: 'named' | 'semi']
  'update:tags': [value: IdentityTags]
}>()
const user = useUserStore()
const gradeOptions = computed(() => user.user?.grade_options ?? [])
function choose(field: keyof IdentityTags, value: string | undefined) {
  const tags = { ...props.tags, [field]: value }
  if (!value) delete tags[field]
  emit('update:tags', tags)
}
function selectTag(field: keyof IdentityTags, event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value) - 1
  const value =
    field === 'campus'
      ? campuses[index]?.value
      : field === 'gender'
        ? genders[index]?.value
        : gradeOptions.value[index]?.code
  choose(field, value)
}
</script>
<template>
  <view class="identity-editor"
    ><text class="section-title">身份展示</text
    ><view class="identity-modes"
      ><button
        :class="{ selected: mode === 'named' }"
        :disabled="disabled || locked"
        @click="emit('update:mode', 'named')"
      >
        公开署名</button
      ><button
        :class="{ selected: mode === 'semi' }"
        :disabled="disabled || locked"
        @click="emit('update:mode', 'semi')"
      >
        半匿名
      </button></view
    ><text v-if="locked" class="identity-hint">首次公开后身份模式固定，公开标签仍可调整。</text
    ><text class="identity-hint">仅展示选中的资料，可只选择校区；个人隐藏设置优先。</text
    ><picker
      :disabled="disabled"
      :range="['不公开校区', ...campuses.map((item) => item.label)]"
      :value="campuses.findIndex((item) => item.value === tags.campus) + 1"
      @change="selectTag('campus', $event)"
      ><view
        >校区：{{ campuses.find((item) => item.value === tags.campus)?.label || '不公开' }} ▾</view
      ></picker
    ><picker
      :disabled="disabled"
      :range="['不公开性别', ...genders.map((item) => item.label)]"
      :value="genders.findIndex((item) => item.value === tags.gender) + 1"
      @change="selectTag('gender', $event)"
      ><view
        >性别：{{ genders.find((item) => item.value === tags.gender)?.label || '不公开' }} ▾</view
      ></picker
    ><picker
      :disabled="disabled"
      :range="['不公开年级', ...gradeOptions.map((item) => item.label)]"
      :value="gradeOptions.findIndex((item) => item.code === tags.grade) + 1"
      @change="selectTag('grade', $event)"
      ><view
        >年级：{{
          gradeOptions.find((item) => item.code === tags.grade)?.label || '不公开'
        }}
        ▾</view
      ></picker
    ><view class="identity-preview"
      ><text>公开预览</text
      ><text>{{
        mode === 'semi'
          ? '默认头像 · 本心愿匿名编号 · 不关联个人主页'
          : '可公开头像 · 昵称 · 展示编号 · 公开主页'
      }}</text
      ><text v-if="tags.campus || tags.gender || tags.grade">{{
        [
          campuses.find((item) => item.value === tags.campus)?.label,
          genders.find((item) => item.value === tags.gender)?.label,
          gradeOptions.find((item) => item.code === tags.grade)?.label,
        ]
          .filter(Boolean)
          .join(' · ')
      }}</text></view
    ></view
  >
</template>
<style scoped>
.identity-editor {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.identity-modes {
  display: flex;
  gap: 16rpx;
}
.identity-modes button {
  flex: 1;
  font-size: 26rpx;
}
.identity-modes .selected {
  background: var(--theme-teal);
  color: white;
}
.identity-hint {
  color: var(--theme-muted);
  font-size: 24rpx;
}
.identity-preview {
  padding: 20rpx;
  background: var(--theme-bg);
  border-radius: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  font-size: 24rpx;
}
</style>
