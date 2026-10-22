import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import ts from 'typescript'
import { canMeAction, canWishAction } from '../src/utils/actions.ts'
import { categories, campuses, rewards, genders } from '../src/types/wish.ts'
import {
  emptyWish,
  validateWish,
  wishStateLabels,
  publicWishBody,
  ownWishBody,
} from '../src/utils/wish.ts'
import type { WishResult } from '../src/types/wish.ts'

const sample: WishResult = {
  id: 'synthetic-wish-a',
  version: 9,
  content_version: 3,
  current_state: 'draft',
  allowed_actions: [
    'putWishesIdContent',
    'deleteWishesIdDraft',
    'postWishesIdSubmitReview',
    'postWishesIdPublish',
  ],
  own_content: { ...emptyWish(), body: '合成正文' },
}
type Transport = {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}
async function moduleFrom(source: string) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled + `\n// ${Math.random()}`).toString('base64')}`
  )
}
function stripImports(source: string) {
  return source.replace(/^import\s[\s\S]*?from\s+'([^']+)'\n/gm, (_all, name) =>
    name === 'vue' ? `import { computed, ref } from '${import.meta.resolve('vue')}'\n` : '',
  )
}
async function setup() {
  const hooks: Record<string, () => void> = {}
  let epoch = 1
  const config = reactive({ useMock: false, wishWritesReady: false })
  const user = reactive({
    isLoggedIn: true,
    validated: true,
    user: {
      id: 'synthetic-student-a',
      verification: 'verified',
      version: 99,
      allowed_actions: ['postWishes'],
    },
    refresh: async () => {},
  })
  const calls: Transport[] = []
  let rows = [structuredClone(sample)]
  let command: (options: Transport) => Promise<unknown> = async () => ({
    ...sample,
    current_state: 'pending_review',
  })
  class RequestError extends Error {
    code: number
    constructor(code: number) {
      super('合成错误')
      this.code = code
    }
  }
  const request = async (options: Transport) => {
    calls.push(JSON.parse(JSON.stringify(options)))
    return options.method ? command(options) : { items: structuredClone(rows), next_cursor: null }
  }
  Object.assign(globalThis, { __wishRequest: request })
  const api = await moduleFrom(
    `const request = globalThis.__wishRequest;\n${stripImports(readFileSync(new URL('../src/api/wishes.ts', import.meta.url), 'utf8'))}`,
  )
  Object.assign(globalThis, {
    __wishPage: {
      ...api,
      config,
      useUserStore: () => user,
      useWishStore: () => ({}),
      canMeAction,
      canWishAction,
      session: { getEpoch: () => epoch },
      RequestError,
      categories,
      campuses,
      rewards,
      genders,
      emptyWish,
      validateWish,
      wishStateLabels,
      publicWishBody,
      ownWishBody,
      onShow: (fn: () => void) => {
        hooks.show = fn
      },
      onHide: (fn: () => void) => {
        hooks.hide = fn
      },
      onUnload: (fn: () => void) => {
        hooks.unload = fn
      },
    },
  })
  const script = readFileSync(new URL('../src/pages/wishes/index.vue', import.meta.url), 'utf8')
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
  const names =
    'listWishes, createWish, updateWish, deleteWishDraft, submitWishReview, publishWish, config, useUserStore, useWishStore, canMeAction, canWishAction, session, RequestError, categories, campuses, rewards, genders, emptyWish, validateWish, wishStateLabels, publicWishBody, ownWishBody, onShow, onHide, onUnload'
  const page = await moduleFrom(
    `const { ${names} } = globalThis.__wishPage;\n${stripImports(script)}\nexport { own, load, items, edit, save, act, form, selectGender, selectIdentityCampus, error, editing, writing };`,
  )
  hooks.show!()
  await settle()
  page.own.value = true
  await page.load()
  return {
    page,
    config,
    user,
    hooks,
    calls,
    RequestError,
    setRows: (value: WishResult[]) => {
      rows = value
    },
    setCommand: (fn: typeof command) => {
      command = fn
    },
    changeSession: () => {
      epoch++
    },
  }
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
const writes = (calls: Transport[]) => calls.filter((call) => call.method)

test('B14 / I2-A01：默认入口关闭，缺失/错误投影/跨目标和会话变化不写入', async () => {
  const { page, config, calls, changeSession } = await setup()
  await page.act(page.items.value[0], 'publish')
  assert.equal(writes(calls).length, 0)
  config.wishWritesReady = true
  await page.act({ ...sample, id: 'synthetic-wish-b' }, 'publish')
  const wish = page.items.value[0]
  wish.allowed_actions = ['postWishes', 'unknown']
  await page.act(wish, 'publish')
  wish.allowed_actions = ['postWishesIdPublish']
  changeSession()
  await page.act(wish, 'publish')
  assert.equal(writes(calls).length, 0)
})
test('B14 / I2-01：实际页面和API构造可选性别创建，无标签省略、保密显式传值', async () => {
  const { page, config, calls } = await setup()
  config.wishWritesReady = true
  page.edit()
  page.form.value.body = '合成创建'
  page.selectIdentityCampus({ detail: { value: 1 } })
  page.selectGender({ detail: { value: 3 } })
  await page.save()
  assert.deepEqual(writes(calls)[0]?.data?.identity_tags, {
    campus: 'wushan',
    gender: 'undisclosed',
  })
  assert.equal(writes(calls)[0]?.url, '/wishes')
  page.edit()
  page.form.value.body = '合成无标签'
  page.selectGender({ detail: { value: 1 } })
  page.selectIdentityCampus({ detail: { value: 2 } })
  page.selectGender({ detail: { value: 0 } })
  assert.deepEqual({ ...page.form.value.identity_tags }, { campus: 'university_town' })
  page.selectIdentityCampus({ detail: { value: 0 } })
  await page.save()
  assert.equal(Object.prototype.hasOwnProperty.call(writes(calls)[1]?.data, 'identity_tags'), false)
})
test('B14 / I2-01/02：实际API绑定资源及正文版本，标签更新语义未知时拦截', async () => {
  const { page, config, calls } = await setup()
  config.wishWritesReady = true
  page.edit(page.items.value[0])
  page.form.value.body = '合成改版'
  await page.save()
  assert.equal(writes(calls)[0]?.url, '/wishes/synthetic-wish-a/content')
  assert.equal(writes(calls)[0]?.data?.expected_version, 9)
  page.items.value[0].own_content.identity_tags = { gender: 'male' }
  page.edit(page.items.value[0])
  await page.save()
  assert.equal(writes(calls).length, 1)
  assert.match(page.error.value, /标签更新/)
})
test('B14 / I2-02–05：送审/上架/删草稿使用正式动作和目标版本', async () => {
  for (const action of ['submit', 'publish', 'delete'] as const) {
    const { page, config, calls } = await setup()
    config.wishWritesReady = true
    await page.act(page.items.value[0], action)
    const call = writes(calls)[0]!
    assert.equal(call.data?.expected_version, 9)
    assert.ok(call.header?.['Idempotency-Key'])
    if (action === 'submit') {
      assert.equal(call.data?.content_version, 3)
      assert.match(call.url, /submit-review$/)
    }
    if (action === 'publish') assert.match(call.url, /publish$/)
    if (action === 'delete') {
      assert.equal(call.method, 'DELETE')
      assert.match(call.url, /draft$/)
    }
  }
})
test('B14 / REQ-018：409只重读，403停止且不自动重试；离开隔离迟到写结果', async () => {
  const { page, config, calls, RequestError, setCommand, setRows, hooks } = await setup()
  config.wishWritesReady = true
  setRows([{ ...sample, version: 10 }])
  setCommand(async () => {
    throw new RequestError(409)
  })
  await page.act(page.items.value[0], 'publish')
  assert.equal(writes(calls).length, 1)
  assert.equal(page.items.value[0].version, 10)
  assert.match(page.error.value, /手动/)
  setCommand(async () => {
    throw new RequestError(403)
  })
  await page.act(page.items.value[0], 'publish')
  assert.equal(writes(calls).length, 2)
  assert.equal(page.items.value.length, 0)
  await page.load()
  let resolve!: (value: unknown) => void
  setCommand(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = page.act(page.items.value[0], 'publish')
  hooks.hide!()
  resolve(sample)
  await pending
  assert.equal(page.items.value.length, 0)
  assert.equal(page.editing.value, false)
})

test('REQ-003：编辑服务端省略可选默认字段的草稿时补全默认报答和期限', async () => {
  const { page, config, setRows } = await setup()
  config.wishWritesReady = true
  const wish = structuredClone(sample)
  // 契约允许服务器省略可选默认字段，不能因此把合法草稿拦为无效输入。
  Reflect.deleteProperty(wish.own_content!, 'reward_method')
  Reflect.deleteProperty(wish.own_content!, 'duration_days')
  setRows([wish])
  await page.load()
  page.edit(page.items.value[0])
  assert.equal(page.form.value.reward_method, 'sincere_thanks')
  assert.equal(page.form.value.duration_days, 7)
  assert.equal(page.form.value.body, wish.own_content!.body)
  assert.equal(validateWish(page.form.value), '')
})
