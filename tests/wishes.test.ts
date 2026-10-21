import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import ts from 'typescript'
import { emptyWish, validateWish, publicWishBody, ownWishBody } from '../src/utils/wish.ts'
import { genders } from '../src/types/wish.ts'
import type { WishResult, WishInput } from '../src/types/wish.ts'

test('T015 / REQ-003：500 Unicode 码点、默认值、期限和枚举边界', () => {
  const input = emptyWish()
  assert.equal(input.duration_days, 7)
  assert.equal(input.reward_method, 'sincere_thanks')
  assert.ok(validateWish(input))
  input.body = '😀'.repeat(500)
  assert.equal(validateWish(input), '')
  input.body += ' '
  assert.ok(validateWish(input))
  input.body = '合成正文'
  for (const days of [1, 30]) assert.equal(validateWish({ ...input, duration_days: days }), '')
  for (const days of [0, 31, 1.5, NaN]) assert.ok(validateWish({ ...input, duration_days: days }))
  assert.ok(validateWish({ ...input, body: ' \n\t' }))
  assert.ok(validateWish({ ...input, category: 'invalid' as typeof input.category }))
  assert.ok(validateWish({ ...input, campus: 'invalid' as typeof input.campus }))
})
test('T015 / REQ-008、018：屏障隐藏本人正文，公开列表不从私有投影补位', () => {
  const wish: WishResult = {
    id: 'synthetic',
    version: 1,
    current_state: 'published',
    allowed_actions: [],
    own_content: { ...emptyWish(), body: '合成本人正文' },
  }
  assert.equal(publicWishBody(wish), '')
  assert.equal(ownWishBody(wish), '合成本人正文')
  wish.public = {
    id: wish.id,
    body: '合成公开正文',
    content_version: 1,
    school_related: false,
    notice_codes: [],
    notice_text: '',
  }
  assert.equal(publicWishBody(wish), '合成公开正文')
  wish.privacy_review_required = true
  assert.equal(publicWishBody(wish), '')
  assert.equal(ownWishBody(wish), '')
  wish.privacy_review_required = false
  for (const state of ['draft', 'pending_review', 'ready', 'expired', 'rejected'] as const) {
    wish.current_state = state
    assert.equal(publicWishBody(wish), '')
  }
})
const config = { useMock: true }
Object.assign(globalThis, { __wishTest: { config, validateWish } })
const source = readFileSync(new URL('../src/stores/wishes.ts', import.meta.url), 'utf8')
  .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replace("from 'pinia'", `from '${import.meta.resolve('pinia')}'`)
  .replace(
    "import { config } from '@/config'",
    'const { config, validateWish } = globalThis.__wishTest',
  )
  .replace("import { validateWish } from '@/utils/wish'", '')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const { useWishStore } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
test('T015 / REQ-004、005、015：合成审核不直通，驳回改版重审，上架满额不误报', () => {
  setActivePinia(createPinia())
  const store = useWishStore()
  const input = { ...emptyWish(), body: '合成测试心愿' }
  const wish = store.save(input)
  assert.throws(() => store.transition(wish.id, 'publish'))
  store.transition(wish.id, 'submit')
  assert.equal(store.demoWishes[0].current_state, 'pending_review')
  assert.throws(() => store.save(input, wish.id))
  store.transition(wish.id, 'reject')
  assert.ok(store.demoWishes[0].review_result.revision_suggestion)
  const changed = store.save({ ...input, body: '合成修改版' }, wish.id)
  assert.equal(changed.content_version, 2)
  assert.equal(changed.review_result, undefined)
  for (let index = 0; index < 4; index++) {
    const current = index === 0 ? changed : store.save(input)
    store.transition(current.id, 'submit')
    store.transition(current.id, 'approve')
    assert.equal(
      store.demoWishes.find((item: WishResult) => item.id === current.id).current_state,
      'ready',
    )
    if (index < 3) store.transition(current.id, 'publish')
    else {
      assert.throws(() => store.transition(current.id, 'publish'), /已满 3 条/)
      assert.equal(
        store.demoWishes.find((item: WishResult) => item.id === current.id).current_state,
        'ready',
      )
    }
  }
  config.useMock = false
  assert.throws(() => store.save(input))
  assert.throws(() => store.transition(changed.id, 'publish'))
})

test('T015 / REQ-003、018：可选标签省略与保密不同，性别映射及空年级边界', () => {
  const input = { ...emptyWish(), body: '合成标签心愿' }
  assert.equal(Object.prototype.hasOwnProperty.call(input, 'identity_tags'), false)
  assert.equal(validateWish(input), '')
  assert.deepEqual(
    genders.map(({ value, label }) => [value, label]),
    [
      ['male', '男'],
      ['female', '女'],
      ['undisclosed', '保密'],
    ],
  )
  for (const { value: gender } of genders) {
    assert.equal(validateWish({ ...input, identity_tags: { gender } }), '')
  }
  assert.equal(validateWish({ ...input, identity_tags: {} }), '')
  assert.ok(validateWish({ ...input, identity_tags: { grade: '' } }))
  assert.ok(validateWish({ ...input, identity_tags: { gender: '其他' } } as unknown as WishInput))
  assert.ok(
    validateWish({ ...input, identity_tags: { campus: 'invalid' } } as unknown as WishInput),
  )
})
