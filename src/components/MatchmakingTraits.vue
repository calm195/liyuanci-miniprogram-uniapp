<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import AppNotice from '@/components/AppNotice.vue'
import { suggestMatchmakingTraits } from '@/api/matchmaking'
import { parseIdealTraits } from '@/utils/matchmaking'
import { session } from '@/utils/session'
import type { MatchmakingTraitSelection, MatchmakingTraitSuggestion } from '@/types/matchmaking'

const props = defineProps<{
  modelValue: string[]
  selections: MatchmakingTraitSelection[]
  disabled: boolean
  purpose?: 'ideal' | 'personal'
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const label = computed(() => (props.purpose === 'personal' ? '个人特质' : '理想型特质'))
const query = ref('')
const suggestions = ref<MatchmakingTraitSuggestion[]>([])
const error = ref('')
const loading = ref(false)
const notice = ref('')
const available = computed(() =>
  suggestions.value.filter((item) => !props.modelValue.includes(item.name)),
)
let generation = 0
let visible = true
let timer: ReturnType<typeof globalThis.setTimeout> | undefined
function cancel() {
  generation++
  if (timer) globalThis.clearTimeout(timer)
  timer = undefined
  loading.value = false
  suggestions.value = []
}
function hide() {
  visible = false
  cancel()
  query.value = ''
  error.value = ''
  notice.value = ''
}
onHide(hide)
onUnload(hide)
onBeforeUnmount(hide)
onShow(() => {
  visible = true
})
watch(() => session.getEpoch(), hide)
watch([query, () => props.disabled], () => {
  cancel()
  error.value = ''
  const text = query.value.normalize('NFKC').trim()
  if (!visible || props.disabled || !text || [...text].length > 20) return
  const current = generation
  const epoch = session.getEpoch()
  const active = () => visible && current === generation && epoch === session.getEpoch()
  timer = globalThis.setTimeout(async () => {
    loading.value = true
    try {
      const items = await suggestMatchmakingTraits(text, props.purpose ?? 'ideal')
      if (active()) suggestions.value = items
    } catch (failure) {
      if (active())
        error.value = failure instanceof Error ? failure.message : '推荐暂不可用，可直接添加特质。'
    } finally {
      if (active()) loading.value = false
    }
  }, 250)
})
function input(event: unknown) {
  const value = (event as { detail?: { value?: unknown } }).detail?.value
  query.value = typeof value === 'string' ? value : ''
}
function add(value: string) {
  if (props.disabled) return
  error.value = ''
  notice.value = ''
  try {
    const [name] = parseIdealTraits([value])
    if (!name) return
    if (props.modelValue.includes(name)) {
      error.value = '已选择该特质。'
      return
    }
    if (props.modelValue.length >= 10) {
      error.value = `最多选择10个${label.value}，请先移除一个。`
      return
    }
    emit('update:modelValue', [...props.modelValue, name])
    query.value = ''
    notice.value = '已添加到资料，保存后生效或进入审核。'
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请检查特质内容。'
  }
}
function remove(name: string) {
  if (props.disabled) return
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => item !== name),
  )
  notice.value = '已移除特质，随资料保存。'
}
function state(name: string) {
  const selected = props.selections.find((item) => item.name === name)
  if (!selected) return '待保存'
  if (selected.status === 'pending') return '待审核'
  return ''
}
</script>
<template>
  <view class="traits-editor">
    <text class="section-title">{{ label }}（选填）</text>
    <text class="traits-help"
      >{{
        purpose === 'personal' ? '描述你自己的性格与特点。' : '描述你期待对方的特质。'
      }}最多10个，每个1～20字。输入后选择推荐或点击添加；命中词库的特质审核通过后才会对外展示，不影响其他资料保存。</text
    >
    <view class="trait-tags">
      <view
        v-for="name in modelValue"
        :key="name"
        class="trait-tag"
        :class="{ 'trait-tag-pending': state(name) === '待审核' }"
      >
        <text class="trait-name">{{ name }}</text>
        <text v-if="state(name)" class="trait-state">{{ state(name) }}</text>
        <button
          class="trait-remove"
          size="mini"
          :disabled="disabled"
          :aria-label="`移除${name}`"
          @click="remove(name)"
        >
          ×
        </button>
      </view>
    </view>
    <view class="trait-input">
      <input
        :value="query"
        :disabled="disabled || modelValue.length >= 10"
        maxlength="40"
        placeholder="例如：真诚、有责任心"
        confirm-type="done"
        @input="input"
        @confirm="add(query)"
      />
      <button
        size="mini"
        :disabled="disabled || !query.trim() || modelValue.length >= 10"
        @click="add(query)"
      >
        添加
      </button>
    </view>
    <text v-if="loading" class="traits-help">正在查找已有特质…</text>
    <view v-if="available.length" class="trait-suggestions">
      <button
        v-for="item in available"
        :key="item.id"
        size="mini"
        :disabled="disabled || modelValue.length >= 10"
        @click="add(item.name)"
      >
        {{ item.name }}
      </button>
    </view>
    <text v-else-if="query.trim() && !loading && !error" class="traits-help"
      >输入尚未加入资料，请先点击添加或选择推荐；保存时自动创建新词条或复用已有词条。</text
    >
    <AppNotice :message="error" kind="error" />
    <AppNotice :message="notice" kind="info" />
  </view>
</template>
<style scoped>
.traits-editor {
  display: grid;
  gap: 16rpx;
}
.traits-help {
  font-size: 24rpx;
  opacity: 0.75;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.trait-tags,
.trait-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.trait-tag {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  max-width: 100%;
  box-sizing: border-box;
  padding: 6rpx 6rpx 6rpx 22rpx;
  border: 1rpx solid var(--theme-mint);
  border-radius: 999rpx;
  background: var(--theme-mint);
  color: var(--theme-teal);
}
.trait-name {
  min-width: 0;
  font-size: 26rpx;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.trait-state {
  flex-shrink: 0;
  font-size: 20rpx;
  opacity: 0.8;
}
.trait-tag-pending {
  border-color: var(--theme-warning);
  background: var(--theme-warning);
  color: var(--theme-warning-ink);
}
.trait-tag .trait-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 56rpx;
  width: 56rpx;
  height: 56rpx;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: 36rpx;
  line-height: 1;
}
.trait-remove::after {
  border: 0;
}
.trait-suggestions button,
.trait-input button {
  margin: 0;
}
.trait-input {
  display: flex;
  gap: 12rpx;
  align-items: center;
}
.trait-input input {
  flex: 1;
  min-width: 0;
  border: 1rpx solid var(--theme-line);
  border-radius: 18rpx;
  padding: 22rpx;
  background: var(--theme-surface);
}
</style>
