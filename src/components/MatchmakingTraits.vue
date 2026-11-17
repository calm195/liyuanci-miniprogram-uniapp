<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import AppNotice from '@/components/AppNotice.vue'
import { suggestMatchmakingTraits } from '@/api/matchmaking'
import { matchmakingTraitCategories, parseIdealTraits } from '@/utils/matchmaking'
import { session } from '@/utils/session'
import type {
  MatchmakingTraitCategories,
  MatchmakingTraitCategory,
  MatchmakingTraitSelection,
  MatchmakingTraitSuggestion,
} from '@/types/matchmaking'
const props = defineProps<{
  modelValue: string[]
  selections: MatchmakingTraitSelection[]
  categories?: MatchmakingTraitCategories
  disabled: boolean
  purpose?: 'ideal' | 'personal'
  endOfStep?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  change: [value: { traits: string[]; categories: MatchmakingTraitCategories }]
}>()
const label = computed(() => (props.purpose === 'personal' ? '个人特质' : '理想型特质'))
const query = ref('')
const category = ref<MatchmakingTraitCategory>('personality')
const inputDrafts = ref<Partial<Record<MatchmakingTraitCategory, string>>>({})
const editing = ref(false)
const suggestions = ref<MatchmakingTraitSuggestion[]>([])
const error = ref('')
const loading = ref(false)
const notice = ref('')
const available = computed(() =>
  suggestions.value.filter(
    (item) => !props.modelValue.includes(item.name) && item.enabled !== false,
  ),
)
function selectedCategory(name: string): MatchmakingTraitCategory {
  return (
    props.selections.find((item) => item.name === name)?.category ??
    props.categories?.[name] ??
    'uncategorized'
  )
}
const selected = computed(() =>
  props.modelValue.filter((name) => selectedCategory(name) === category.value),
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
  error.value = ''
  notice.value = ''
}
onHide(hide)
onUnload(hide)
onBeforeUnmount(hide)
onShow(() => {
  visible = true
  if (editing.value) search()
})
watch(
  () => session.getEpoch(),
  () => {
    hide()
    query.value = ''
    inputDrafts.value = {}
    editing.value = false
  },
)
function search() {
  cancel()
  error.value = ''
  const text = query.value.normalize('NFKC').trim()
  if (!visible || props.disabled || [...text].length > 20) return
  const current = generation
  const epoch = session.getEpoch()
  const selectedCategory = category.value
  const active = () =>
    visible &&
    current === generation &&
    epoch === session.getEpoch() &&
    selectedCategory === category.value
  timer = globalThis.setTimeout(async () => {
    loading.value = true
    try {
      const items = await suggestMatchmakingTraits(text, props.purpose ?? 'ideal', selectedCategory)
      if (active()) suggestions.value = items
    } catch (failure) {
      if (active())
        error.value = failure instanceof Error ? failure.message : '推荐暂不可用，可直接添加特质。'
    } finally {
      if (active()) loading.value = false
    }
  }, 250)
}
watch([query, () => props.disabled], search)
function selectCategory(value: MatchmakingTraitCategory) {
  if (props.disabled || value === category.value) return
  inputDrafts.value[category.value] = query.value
  category.value = value
  query.value = inputDrafts.value[value] ?? ''
  if (editing.value) search()
}
function openEditor() {
  if (props.disabled) return
  editing.value = !editing.value
  if (editing.value) search()
  else cancel()
}
function input(event: unknown) {
  const value = (event as { detail?: { value?: unknown } }).detail?.value
  query.value = typeof value === 'string' ? value : ''
  inputDrafts.value[category.value] = query.value
}
function update(traits: string[], categories: MatchmakingTraitCategories) {
  emit('update:modelValue', traits)
  emit('change', { traits, categories })
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
    const existing =
      suggestions.value.find((item) => item.name === name) ??
      props.selections.find((item) => item.name === name)
    if (existing?.enabled === false) {
      error.value = '该特质已停用，请选择其他特质。'
      return
    }
    const categories = { ...props.categories, [name]: existing?.category ?? category.value }
    update([...props.modelValue, name], categories)
    query.value = ''
    inputDrafts.value[category.value] = ''
    notice.value = '已添加到资料，保存后生效或进入审核。'
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请检查特质内容。'
  }
}
function remove(name: string) {
  if (props.disabled) return
  const categories = { ...props.categories }
  delete categories[name]
  update(
    props.modelValue.filter((item) => item !== name),
    categories,
  )
  notice.value = '已移除特质，随资料保存。'
}
function state(name: string) {
  const item = props.selections.find((item) => item.name === name)
  if (!item) return '待保存'
  if (item.enabled === false) return '已停用'
  if (item.status === 'pending') return '待审核'
  return ''
}
</script>
<template>
  <view class="traits-editor" :class="{ 'end-of-step': endOfStep }">
    <view class="traits-heading"
      ><text class="content-text traits-title">{{ label }}</text
      ><text class="content-text traits-count">{{ modelValue.length }} / 10</text></view
    >
    <view class="trait-categories" :aria-label="`${label}分类`"
      ><button
        v-for="item in matchmakingTraitCategories"
        :key="item.code"
        :class="{ selected: category === item.code }"
        :disabled="disabled"
        :aria-pressed="category === item.code"
        @click="selectCategory(item.code)"
      >
        {{ item.label
        }}<text
          v-if="modelValue.some((name) => selectedCategory(name) === item.code)"
          class="content-text category-count"
          >{{ modelValue.filter((name) => selectedCategory(name) === item.code).length }}</text
        >
      </button></view
    >
    <view class="trait-tags"
      ><view
        v-for="name in selected"
        :key="name"
        class="trait-tag"
        :class="{ 'trait-tag-pending': state(name) }"
        ><text class="content-text trait-name">{{ name }}</text
        ><text v-if="state(name)" class="content-text trait-state">{{ state(name) }}</text
        ><button
          class="trait-remove"
          :disabled="disabled"
          :aria-label="`移除${name}`"
          @click="remove(name)"
        >
          ×
        </button></view
      ><button
        class="trait-add"
        :disabled="disabled || modelValue.length >= 10"
        :aria-expanded="editing"
        @click="openEditor"
      >
        {{ editing ? '收起选择' : '＋ 添加特质' }}
      </button></view
    >
    <view v-show="editing" class="trait-picker"
      ><text class="content-text picker-label"
        >{{ matchmakingTraitCategories.find((item) => item.code === category)?.label }} ·
        推荐与新增</text
      ><view class="trait-input"
        ><input
          :value="query"
          :disabled="disabled || modelValue.length >= 10"
          maxlength="40"
          placeholder="搜索或填写新特质"
          confirm-type="done"
          @input="input"
          @confirm="add(query)"
        /><button
          :disabled="disabled || !query.trim() || modelValue.length >= 10"
          @click="add(query)"
        >
          添加
        </button></view
      ><text v-if="loading" class="content-text traits-help">正在寻找推荐…</text
      ><view v-else-if="available.length" class="trait-suggestions"
        ><button
          v-for="item in available"
          :key="item.id"
          :disabled="disabled || modelValue.length >= 10"
          @click="add(item.name)"
        >
          {{ item.name }}
        </button></view
      ><text v-else class="content-text traits-help"
        >还没有合适的推荐，可以写下自己的特质。</text
      ></view
    >
    <text class="content-text traits-help">新词保存后审核，通过后向对方展示。每个1～20字。</text>
    <AppNotice :message="error" kind="error" /><AppNotice :message="notice" kind="info" />
  </view>
</template>
<style scoped>
.content-text {
  margin: 0;
}
.traits-editor {
  display: block;
  margin: 32rpx 0 40rpx;
}
.traits-editor.end-of-step {
  margin-bottom: 0;
}
.traits-heading {
  margin-bottom: 16rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.traits-title {
  font-size: 28rpx;
  font-weight: 600;
}
.traits-count,
.traits-help {
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.trait-categories {
  display: flex;
  gap: 32rpx;
  border-bottom: 1rpx solid var(--theme-line);
}
.trait-categories button {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin: 0;
  padding: 20rpx 0;
  border: 0;
  border-bottom: 4rpx solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.trait-categories button.selected {
  color: var(--match-accent, var(--theme-teal));
  border-bottom-color: var(--match-accent, var(--theme-teal));
}
.category-count {
  font-size: 18rpx;
}
.trait-tags {
  margin: 20rpx 0;
}
.trait-tags,
.trait-suggestions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}
.trait-tag {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 12rpx 8rpx 20rpx;
  border: 1rpx solid var(--match-accent, var(--theme-teal));
  border-radius: 40rpx;
  background: var(--match-soft, var(--theme-mint));
  color: var(--match-accent, var(--theme-teal));
  font-size: 24rpx;
}
.trait-tag-pending {
  border-style: dashed;
}
.trait-name {
  overflow-wrap: anywhere;
}
.trait-state {
  font-size: 20rpx;
}
.trait-tag .trait-remove {
  flex: none;
  width: 40rpx;
  min-height: 40rpx;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 30rpx;
  line-height: 40rpx;
}
.trait-tags .trait-add,
.trait-suggestions button {
  margin: 0;
  padding: 12rpx 22rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 40rpx;
  background: var(--theme-canvas);
  color: var(--theme-ink);
  font-size: 24rpx;
  line-height: 1.6;
}
.trait-picker {
  display: grid;
  gap: 16rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: var(--theme-canvas);
}
.picker-label {
  color: var(--match-accent, var(--theme-teal));
  font-size: 24rpx;
}
.trait-input {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.trait-input input {
  margin: 0;
  flex: 1;
  min-width: 0;
  height: 88rpx;
  padding: 20rpx;
  border: 1rpx solid var(--theme-line);
  border-radius: 16rpx;
  background: var(--theme-surface);
  font-size: 26rpx;
}
.trait-input button {
  flex: none;
  margin: 0;
  padding: 20rpx 24rpx;
  border: 0;
  border-radius: 16rpx;
  background: var(--match-accent, var(--theme-teal));
  color: var(--match-on-accent, #fff);
  font-size: 26rpx;
  line-height: 1.7;
}
.trait-picker[hidden] {
  display: none !important;
}
</style>
