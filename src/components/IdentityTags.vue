<script setup lang="ts">
import { computed } from 'vue'
import { campuses, genders } from '@/types/wish'
import type { IdentityTags } from '@/types/wish'
import { useUserStore } from '@/stores/user'
import { useWhispersStore } from '@/stores/whispers'
import { dictionaryLabel } from '@/features/dictionaries/catalog'
defineOptions({ options: { virtualHost: true } })
const props = defineProps<{ tags?: IdentityTags | null; compact?: boolean; byline?: boolean }>()
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
  const campus = campuses.find((item) => item.value === tags.campus)?.label
  const gender = genders.find((item) => item.value === tags.gender)?.label
  return (props.compact || props.byline ? [campus, grade, gender] : [campus, gender, grade]).filter(
    Boolean,
  )
})
</script>
<template>
  <text v-if="byline && labels.length" class="identity-byline">{{ labels.join(' · ') }}</text>
  <view v-else-if="labels.length" class="identity-tags" :class="{ compact }"
    ><text v-for="label in labels" :key="label">{{ label }}</text></view
  >
</template>
<style scoped>
.identity-byline {
  margin: 0;
  color: var(--theme-muted);
  font-size: 24rpx;
  overflow-wrap: anywhere;
}
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
.identity-tags.compact {
  justify-content: flex-end;
  flex: 0 0 auto;
  max-width: 46%;
  margin: 0;
}
.identity-tags.compact text {
  box-sizing: border-box;
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--theme-mint);
  color: var(--theme-teal);
}
</style>
