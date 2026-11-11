import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import {
  parseIdealTraits,
  parseMatchmakingPreferences,
  parseTraitSuggestions,
} from '../src/utils/matchmaking.ts'
import { loadRuntime, pageScript, settle, profileDraftStore } from './support/page-runtime.ts'

const preferences = {
  age: 0,
  age_min: 0,
  age_max: 0,
  height: 0,
  height_min: 0,
  height_max: 0,
  weight: 0,
  weight_min: 0,
  weight_max: 0,
  wechat: '',
  introduction: '',
}
test('特质规范化去重，限制字数与数量，旧请求省略字段不清空', () => {
  assert.deepEqual(parseIdealTraits([' ＡＢＣ ', 'ABC', '真诚']), ['ABC', '真诚'])
  assert.throws(() => parseIdealTraits(['\n']))
  assert.throws(() => parseIdealTraits(['真\n诚']))
  assert.throws(() => parseIdealTraits(['真\u200b诚']))
  assert.throws(() => parseIdealTraits(['真\u0080诚']))
  assert.throws(() => parseIdealTraits(['真\u009f诚']))
  assert.throws(() => parseIdealTraits(['长'.repeat(21)]))
  assert.throws(() => parseIdealTraits(Array.from({ length: 11 }, (_, i) => `特质${i}`)))
  assert.equal('ideal_traits' in parseMatchmakingPreferences(preferences), false)
  assert.deepEqual(
    parseMatchmakingPreferences({ ...preferences, ideal_traits: [] }).ideal_traits,
    [],
  )
  assert.throws(() => parseTraitSuggestions({ items: [{ id: 'invalid', name: '真诚', heat: 1 }] }))
})

test('码点校验完整拦截控制与格式字符，保留中文和辅助平面可见字符', () => {
  // 属性正则仅作为现代Node测试中的独立分类依据，生产代码不依赖该语法。
  const hidden = /[\p{Cc}\p{Cf}]/u
  for (let point = 0; point <= 0x10ffff; point++) {
    const character = String.fromCodePoint(point)
    if (hidden.test(character)) {
      assert.throws(() => parseIdealTraits([`真${character}诚`]), `码点 ${point.toString(16)}`)
    }
  }
  assert.deepEqual(parseIdealTraits(['真诚', '开朗😀', '𠮷祥']), ['真诚', '开朗😀', '𠮷祥'])
  for (const purpose of ['personal_traits', 'ideal_traits']) {
    assert.deepEqual(
      parseMatchmakingPreferences({ ...preferences, [purpose]: ['真诚'] })[
        purpose as 'personal_traits' | 'ideal_traits'
      ],
      ['真诚'],
    )
    assert.throws(() => parseMatchmakingPreferences({ ...preferences, [purpose]: ['真\u200b诚'] }))
  }
})

test('标签编辑新增删除与上限，迟到推荐在隐藏后不能回填', async () => {
  const props = reactive({
    modelValue: [] as string[],
    selections: [{ id: 'one', name: '真诚', status: 'pending', reason: '' }],
    disabled: false,
  })
  let hide = () => {}
  let resolve: (items: unknown[]) => void = () => {}
  let requests = 0
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/MatchmakingTraits.vue', import.meta.url)) +
      '\nexport { add, remove, state, query, suggestions, loading, error };',
    {
      defineProps: () => props,
      defineEmits: () => (_event: string, items: string[]) => {
        props.modelValue = items
      },
      onBeforeUnmount: () => {},
      onHide: (callback: () => void) => {
        hide = callback
      },
      onUnload: () => {},
      onShow: () => {},
      session: { getEpoch: () => 1 },
      parseIdealTraits,
      suggestMatchmakingTraits: () => {
        requests++
        return new Promise((done) => {
          resolve = done
        })
      },
    },
  )
  runtime.add(' 真诚 ')
  assert.deepEqual(props.modelValue, ['真诚'])
  assert.equal(runtime.state('真诚'), '待审核')
  props.selections[0]!.status = 'approved'
  assert.equal(runtime.state('真诚'), '')
  runtime.add('真诚')
  assert.match(runtime.error.value, /已选择/)
  runtime.remove('真诚')
  assert.deepEqual(props.modelValue, [])
  for (let i = 0; i < 10; i++) runtime.add(`特质${i}`)
  runtime.add('更多')
  assert.equal(props.modelValue.length, 10)
  assert.match(runtime.error.value, /最多/)
  runtime.query.value = '真'
  await settle()
  await new Promise((done) => setTimeout(done, 300))
  assert.equal(requests, 1)
  hide()
  resolve([{ id: 'one', name: '真诚', heat: 1 }])
  await settle()
  assert.deepEqual(runtime.suggestions.value, [])
  assert.equal(runtime.loading.value, false)
})

test('本人编辑保留待审核标签并移除旧服务返回的驳回标签，后续保存不重新带回', async () => {
  const selected = [
    { id: '10000000-0000-4000-8000-000000000001', name: '真诚', status: 'approved', reason: '' },
    {
      id: '10000000-0000-4000-8000-000000000002',
      name: '待审核特质',
      status: 'pending',
      reason: '',
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      name: '被驳回特质',
      status: 'rejected',
      reason: '请调整',
    },
  ]
  const writes: unknown[] = []
  const { readFileSync } = await import('node:fs')
  const { ref } = await import('vue')
  const runtime = await loadRuntime(
    readFileSync(new URL('../src/composables/use-matchmaking-profile.ts', import.meta.url), 'utf8'),
    {
      useProfileDraftStore: await profileDraftStore(),
      getMatchmakingAccountProfile: async () => ({
        version: 1,
        account_version: 1,
        profile: { ...preferences, ideal_traits: ['真诚'] },
        trait_selections: selected,
      }),
      parseMatchmakingPreferences,
      matchmakingKey: () => 'synthetic-trait-profile',
      useMatchmakingPage: () => ({
        busy: ref(false),
        writing: ref(false),
        pending: ref(null),
        error: ref(''),
        read: async (run: (active: () => boolean) => Promise<void>) => run(() => true),
        actionTicket: () => () => true,
        write: async (command: unknown) => {
          writes.push(command)
        },
      }),
    },
  )
  const editor = runtime.useMatchmakingProfile()
  await editor.load()
  assert.deepEqual(
    editor.form.value.ideal_traits,
    selected.filter((item) => item.status !== 'rejected').map((item) => item.name),
  )
  editor.form.value.introduction = '新的介绍'
  await editor.save(true)
  assert.deepEqual(
    (writes[0] as { input: { profile: { ideal_traits: string[] } } }).input.profile.ideal_traits,
    selected.filter((item) => item.status !== 'rejected').map((item) => item.name),
  )
})

test('刷新和保存回读恢复草稿时剔除明确驳回词条，同时保留新的输入与待审核标签', async () => {
  const { readFileSync } = await import('node:fs')
  const { ref } = await import('vue')
  let status = 'pending'
  let afterWrite: (() => Promise<void>) | undefined
  let written: { input: { profile: { ideal_traits: string[] } } } | undefined
  const runtime = await loadRuntime(
    readFileSync(new URL('../src/composables/use-matchmaking-profile.ts', import.meta.url), 'utf8'),
    {
      useProfileDraftStore: await profileDraftStore(),
      getMatchmakingAccountProfile: async () => ({
        version: 1,
        account_version: 1,
        profile: { ...preferences, ideal_traits: ['真诚'] },
        trait_selections: [
          { id: 'one', name: '真诚', status: 'approved', reason: '' },
          { id: 'two', name: '审核中词条', status, reason: '' },
          { id: 'three', name: '仍待审核', status: 'pending', reason: '' },
          { id: 'two', name: '审核中词条', purpose: 'personal', status, reason: '' },
          { id: 'four', name: '个人待审核', purpose: 'personal', status: 'pending', reason: '' },
        ],
      }),
      parseMatchmakingPreferences,
      matchmakingKey: () => 'synthetic-trait-refresh',
      useMatchmakingPage: () => ({
        busy: ref(false),
        writing: ref(false),
        pending: ref(null),
        error: ref(''),
        read: async (run: (active: () => boolean) => Promise<void>) => run(() => true),
        actionTicket: () => () => true,
        write: async (command: typeof written, callback: () => Promise<void>) => {
          written = command
          afterWrite = callback
        },
      }),
    },
  )
  const editor = runtime.useMatchmakingProfile()
  await editor.load()
  editor.form.value.introduction = '未保存的介绍'
  editor.form.value.ideal_traits.push('刷新前新输入')
  editor.form.value.personal_traits.push('个人刷新前新输入')
  status = 'rejected'
  await editor.refreshDraft()
  assert.deepEqual(editor.form.value.ideal_traits, ['真诚', '仍待审核', '刷新前新输入'])
  assert.equal(editor.form.value.introduction, '未保存的介绍')
  assert.deepEqual(editor.form.value.personal_traits, ['个人待审核', '个人刷新前新输入'])
  status = 'pending'
  await editor.load()
  editor.form.value.introduction = '提交中的介绍'
  await editor.save(true)
  assert.ok(written?.input.profile.ideal_traits.includes('审核中词条'))
  editor.form.value.ideal_traits.push('请求期间新输入')
  editor.form.value.personal_traits.push('个人请求期间新输入')
  editor.form.value.introduction = '请求期间的新介绍'
  status = 'rejected'
  assert.ok(afterWrite)
  await afterWrite()
  assert.deepEqual(editor.form.value.ideal_traits, ['真诚', '仍待审核', '请求期间新输入'])
  assert.equal(editor.form.value.introduction, '请求期间的新介绍')
  assert.deepEqual(editor.form.value.personal_traits, ['个人待审核', '个人请求期间新输入'])
})

test('个人与理想型同词可分别选择，旧用途归理想型，两类分别限制10项', async () => {
  const { parseMatchmakingAccountProfile } = await import('../src/utils/matchmaking.ts')
  const item = {
    id: '10000000-0000-4000-8000-000000000001',
    name: '真诚',
    status: 'approved',
    reason: '',
  }
  const base = {
    version: 1,
    account_version: 1,
    profile: {
      ...preferences,
      name: '',
      gender: '',
      campus: '',
      grade: '',
      mbti: '',
      consent: false,
    },
  }
  const old = parseMatchmakingAccountProfile({ ...base, trait_selections: [item] })
  assert.equal(old.trait_selections?.[0]?.purpose, 'ideal')
  assert.deepEqual(old.profile?.personal_traits, [])
  const both = parseMatchmakingAccountProfile({
    ...base,
    trait_selections: [{ ...item, purpose: 'personal' }, item],
  })
  assert.equal(both.trait_selections?.length, 2)
  assert.throws(() => parseMatchmakingAccountProfile({ ...base, trait_selections: [item, item] }))
  assert.throws(() =>
    parseMatchmakingAccountProfile({
      ...base,
      trait_selections: Array.from({ length: 11 }, (_, i) => ({
        ...item,
        id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        purpose: 'personal',
      })),
    }),
  )
  assert.equal('personal_traits' in parseMatchmakingPreferences(preferences), false)
  const parsed = parseMatchmakingPreferences({
    ...preferences,
    personal_traits: [' Ａ ', '真诚'],
    ideal_traits: ['真诚'],
  })
  assert.deepEqual(parsed.personal_traits, ['A', '真诚'])
  assert.deepEqual(parsed.ideal_traits, ['真诚'])
})

test('个人特质草稿与理想型独立回填保存，驳回共同词条同时移除两个用途', async () => {
  const { readFileSync } = await import('node:fs')
  const { ref } = await import('vue')
  let rejected = false
  let written:
    { input: { profile: { personal_traits: string[]; ideal_traits: string[] } } } | undefined
  const runtime = await loadRuntime(
    readFileSync(new URL('../src/composables/use-matchmaking-profile.ts', import.meta.url), 'utf8'),
    {
      useProfileDraftStore: await profileDraftStore(),
      getMatchmakingAccountProfile: async () => ({
        version: 1,
        account_version: 1,
        profile: { ...preferences },
        trait_selections: [
          {
            id: 'one',
            name: '真诚',
            purpose: 'personal',
            status: rejected ? 'rejected' : 'approved',
            reason: '',
          },
          {
            id: 'one',
            name: '真诚',
            purpose: 'ideal',
            status: rejected ? 'rejected' : 'approved',
            reason: '',
          },
          { id: 'two', name: '安静', purpose: 'personal', status: 'pending', reason: '' },
          { id: 'three', name: '开朗', purpose: 'ideal', status: 'pending', reason: '' },
        ],
      }),
      parseMatchmakingPreferences,
      matchmakingKey: () => 'synthetic-two-purpose',
      useMatchmakingPage: () => ({
        busy: ref(false),
        writing: ref(false),
        pending: ref(null),
        error: ref(''),
        read: async (run: (active: () => boolean) => Promise<void>) => run(() => true),
        actionTicket: () => () => true,
        write: async (command: typeof written) => {
          written = command
        },
      }),
    },
  )
  const editor = runtime.useMatchmakingProfile()
  await editor.load()
  assert.deepEqual(editor.form.value.personal_traits, ['真诚', '安静'])
  assert.deepEqual(editor.form.value.ideal_traits, ['真诚', '开朗'])
  editor.form.value.personal_traits.push('阅读')
  rejected = true
  await editor.refreshDraft()
  assert.deepEqual(editor.form.value.personal_traits, ['安静', '阅读'])
  assert.deepEqual(editor.form.value.ideal_traits, ['开朗'])
  await editor.save(true)
  assert.deepEqual(written?.input.profile.personal_traits, ['安静', '阅读'])
  assert.deepEqual(written?.input.profile.ideal_traits, ['开朗'])
})
