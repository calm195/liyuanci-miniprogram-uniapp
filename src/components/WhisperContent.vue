<script setup lang="ts">
import { useWhispersStore } from '@/stores/whispers'
import { campuses, genders } from '@/types/wish'
import type { PublicPost, PublicComment } from '@/types/whispers'
defineProps<{ content: PublicPost | PublicComment }>()
const module = useWhispersStore()
</script>
<template>
  <view>
    <text>{{ content.identity.label }}{{ content.identity.is_author ? ' · 帖主' : '' }}</text>
    <view v-if="content.identity.tags">
      <text
        >校区：{{
          campuses.find((item) => item.value === content.identity.tags?.campus)?.label
        }}</text
      >
      <text
        >性别：{{
          genders.find((item) => item.value === content.identity.tags?.gender)?.label
        }}</text
      >
      <text
        >年级：{{
          module.config?.grade_dictionary.items.find(
            (item) => item.code === content.identity.tags?.grade,
          )?.label || '年级资料暂不可用'
        }}</text
      >
    </view>
    <text class="whitespace-pre-wrap break-words">{{ content.body }}</text>
    <text v-if="content.school_related" class="notice">{{ content.notice_text }}</text>
  </view>
</template>
