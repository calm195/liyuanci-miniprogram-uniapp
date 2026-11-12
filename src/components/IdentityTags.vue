<script setup lang="ts">
import { computed } from 'vue'
import { campuses, genders } from '@/types/wish'
import type { IdentityTags } from '@/types/wish'
import { useUserStore } from '@/stores/user'
import { useWhispersStore } from '@/stores/whispers'
import { dictionaryLabel } from '@/features/dictionaries/catalog'
const props = defineProps<{ tags?: IdentityTags | null }>()
const user = useUserStore()
const whispers = useWhispersStore()
const labels = computed(() => {
  const tags = props.tags
  if (!tags) return []
  const grade = tags.grade
    ? (user.user?.grade_options?.find((item) => item.code === tags.grade)?.label ??
      whispers.config?.grade_dictionary.items.find((item) => item.code === tags.grade)?.label ??
      dictionaryLabel('grade', tags.grade, tags.grade))
    : ''
  return [
    campuses.find((item) => item.value === tags.campus)?.label,
    genders.find((item) => item.value === tags.gender)?.label,
    grade,
  ].filter(Boolean)
})
</script>
<template>
  <view v-if="labels.length" class="identity-tags"
    ><text v-for="label in labels" :key="label">{{ label }}</text></view
  >
</template>
<style scoped>
.identity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 12rpx;
  font-size: 23rpx;
  color: var(--theme-muted);
}
.identity-tags text {
  background: var(--theme-bg);
  padding: 5rpx 12rpx;
  border-radius: 10rpx;
}
</style>
