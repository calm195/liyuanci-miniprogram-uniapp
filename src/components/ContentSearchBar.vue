<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ContentSort } from '@/types/content'

const props = defineProps<{ keyword: string; sort: ContentSort; disabled?: boolean }>()
const emit = defineEmits<{ search: [keyword: string, sort: ContentSort] }>()
const draft = ref(props.keyword)
watch(
  () => props.keyword,
  (keyword) => {
    draft.value = keyword
  },
)

function submit() {
  if (!props.disabled) emit('search', draft.value.trim(), props.sort)
}
function reset() {
  if (props.disabled) return
  draft.value = ''
  emit('search', '', props.sort)
}
function changeSort(event: { detail: { value: string | number } }) {
  if (!props.disabled)
    emit('search', props.keyword, Number(event.detail.value) === 1 ? 'hot' : 'time')
}
</script>

<template>
  <view class="search-bar">
    <view class="search-field">
      <input
        v-model="draft"
        aria-label="搜索标题或正文"
        placeholder="搜索标题或正文"
        confirm-type="search"
        :maxlength="80"
        :disabled="disabled"
        @confirm="runPageAction(submit)"
      />
      <button
        v-if="draft || keyword"
        class="clear-button"
        :disabled="disabled"
        :loading="isPageActionPending('content-search-clear')"
        @click="runPageAction(reset, 'content-search-clear')"
      >
        清空
      </button>
      <button
        class="search-button"
        :disabled="disabled"
        :loading="isPageActionPending('content-search-submit')"
        @click="runPageAction(submit, 'content-search-submit')"
      >
        搜索
      </button>
    </view>
    <picker
      class="sort-picker"
      :range="['最新', '最热']"
      :value="sort === 'hot' ? 1 : 0"
      :disabled="disabled"
      @change="runPageAction(() => changeSort($event))"
    >
      <view>{{ sort === 'hot' ? '最热' : '最新' }} ▾</view>
    </picker>
  </view>
</template>

<style scoped>
.search-bar {
  display: flex;
  gap: 16rpx;
  align-items: center;
  margin: 20rpx 0;
}
.search-field {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 10rpx;
  align-items: center;
}
.search-field input {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0 16rpx;
  font-size: 26rpx;
}
.search-field button {
  flex: 0 0 auto;
  width: auto;
  min-height: 58rpx;
  margin: 0;
  padding: 0 12rpx;
  font-size: 24rpx;
  line-height: 58rpx;
}
.search-field .clear-button {
  color: var(--theme-teal);
  background: transparent;
}
.sort-picker {
  flex: 0 0 auto;
  color: var(--theme-teal);
  font-size: 26rpx;
  white-space: nowrap;
}
</style>
