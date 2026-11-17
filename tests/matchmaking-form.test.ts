import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import {
  parseIdealTraits,
  parseMatchmakingPreferences,
  parseTraitSuggestions,
  matchmakingResultState,
  matchmakingTraitCategories,
} from '../src/utils/matchmaking.ts'
import type {
  MatchmakingPreferences,
  MatchmakingTraitCategories,
  MatchmakingDetail,
} from '../src/types/matchmaking.ts'
const initial: MatchmakingPreferences = {
  age: 22,
  height: 168,
  weight: 110,
  age_min: 20,
  age_max: 25,
  height_min: 160,
  height_max: 190,
  weight_min: 90,
  weight_max: 160,
  preferred_campuses: [],
  preferred_mbti: [],
  personal_traits: [],
  ideal_traits: [],
  introduction: '介绍草稿',
  wechat: '合成微信',
}

test('三步切换保留数值、多选和介绍草稿，分类与词条一次更新，禁用时不改写', async () => {
  const props = reactive({ modelValue: structuredClone(initial), step: 1, disabled: false })
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/MatchmakingForm.vue', import.meta.url)) +
      '\nexport { changeStep, numeric, input, togglePreference, changeTraits }',
    {
      defineProps: () => props,
      defineEmits: () => (event: string, value: MatchmakingPreferences | number) => {
        if (event === 'update:step') props.step = value as number
        else props.modelValue = value as MatchmakingPreferences
      },
      campuses: [],
    },
  )
  runtime.numeric('weight', { detail: { value: '112' } })
  runtime.input('introduction', { detail: { value: '切换后仍保留的介绍' } })
  runtime.changeStep(2)
  runtime.togglePreference('preferred_mbti', 'INFP')
  runtime.togglePreference('preferred_campuses', 'wushan')
  runtime.changeTraits('ideal', { traits: ['摄影'], categories: { 摄影: 'interest' } })
  runtime.changeStep(3)
  runtime.changeStep(1)
  assert.equal(props.modelValue.weight, 112)
  assert.equal(props.modelValue.wechat, '合成微信')
  assert.equal(props.modelValue.introduction, '切换后仍保留的介绍')
  assert.deepEqual(props.modelValue.preferred_mbti, ['INFP'])
  assert.deepEqual(props.modelValue.preferred_campuses, ['wushan'])
  assert.deepEqual(props.modelValue.ideal_traits, ['摄影'])
  assert.deepEqual(props.modelValue.ideal_trait_categories, { 摄影: 'interest' })
  props.disabled = true
  runtime.numeric('weight', { detail: { value: '150' } })
  runtime.changeStep(2)
  assert.equal(props.step, 1)
  assert.equal(props.modelValue.weight, 112)
})

test('分类切换保存未添加输入，新词与权威推荐分类一致，移除不留下孤立映射', async () => {
  const props = reactive({
    modelValue: [] as string[],
    categories: {} as MatchmakingTraitCategories,
    selections: [],
    disabled: false,
    purpose: 'personal',
  })
  let hidden = () => {}
  const requests: unknown[][] = []
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/MatchmakingTraits.vue', import.meta.url)) +
      '\nexport { query, category, selectCategory, input, add, remove, suggestions, openEditor, available }',
    {
      defineProps: () => props,
      defineEmits:
        () =>
        (event: string, value: { traits: string[]; categories: MatchmakingTraitCategories }) => {
          if (event === 'change') {
            props.modelValue = value.traits
            props.categories = value.categories
          }
        },
      onBeforeUnmount: () => {},
      onHide: (fn: () => void) => {
        hidden = fn
      },
      session: { getEpoch: () => 1 },
      parseIdealTraits,
      matchmakingTraitCategories,
      suggestMatchmakingTraits: async (...args: unknown[]) => {
        requests.push(args)
        return []
      },
    },
  )
  runtime.input({ detail: { value: '温柔草稿' } })
  runtime.selectCategory('interest')
  runtime.input({ detail: { value: '摄影' } })
  runtime.selectCategory('personality')
  assert.equal(runtime.query.value, '温柔草稿')
  runtime.selectCategory('interest')
  assert.equal(runtime.query.value, '摄影')
  runtime.add(runtime.query.value)
  assert.deepEqual(props.categories, { 摄影: 'interest' })
  runtime.selectCategory('personality')
  assert.equal(runtime.query.value, '温柔草稿')
  runtime.suggestions.value = [
    { id: 'one', name: '散步', category: 'lifestyle', enabled: true },
    { id: 'two', name: '停用词', category: 'personality', enabled: false },
  ]
  runtime.add('散步')
  assert.equal(props.categories.散步, 'lifestyle')
  runtime.add('停用词')
  assert.equal(props.modelValue.includes('停用词'), false)
  runtime.remove('摄影')
  assert.equal('摄影' in props.categories, false)
  runtime.openEditor()
  await settle()
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.deepEqual(requests.at(-1), ['', 'personal', 'personality'])
  hidden()
})

test('分类协议兼容旧请求，拒绝孤立名称或非法分类，保留停用推荐状态', () => {
  const result = parseMatchmakingPreferences({
    ...initial,
    personal_traits: ['摄影'],
    personal_trait_categories: { 摄影: 'interest' },
  })
  assert.deepEqual(result.personal_trait_categories, { 摄影: 'interest' })
  assert.equal('personal_trait_categories' in parseMatchmakingPreferences(initial), false)
  assert.throws(() =>
    parseMatchmakingPreferences({ ...initial, personal_trait_categories: { 摄影: 'interest' } }),
  )
  assert.throws(() =>
    parseMatchmakingPreferences({
      ...initial,
      personal_traits: ['摄影'],
      personal_trait_categories: { 摄影: 'other' },
    }),
  )
  const items = parseTraitSuggestions({
    items: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: '摄影',
        heat: 1,
        category: 'interest',
        enabled: false,
      },
    ],
  })
  assert.equal(items[0]?.enabled, false)
  assert.equal(items[0]?.category, 'interest')
})

test('结果展示依赖真实发布状态，旧服务无配对结果保持等待，结束覆盖过期对象', () => {
  const detail = {
    activity: { phase: 'active', status: 'published' },
    enrollment: { status: 'approved' },
  } as MatchmakingDetail
  assert.equal(matchmakingResultState(detail), 'waiting')
  assert.equal(matchmakingResultState({ ...detail, result_state: 'unmatched' }), 'unmatched')
  assert.equal(
    matchmakingResultState({
      ...detail,
      result_state: 'paired',
      activity: { ...detail.activity, phase: 'ended' },
    }),
    'ended',
  )
  assert.equal(
    matchmakingResultState({ ...detail, enrollment: { ...detail.enrollment!, status: 'pending' } }),
    'pending_review',
  )
})
