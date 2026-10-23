import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import ts from 'typescript'
import { canWishAction } from '../src/utils/actions.ts'
import { categories, campuses, rewards } from '../src/types/wish.ts'
import type { WishResult } from '../src/types/wish.ts'
import { emptyWish, wishStateLabels } from '../src/utils/wish.ts'

const sample: WishResult = {
  id: 'synthetic-wish',
  version: 7,
  current_state: 'matching',
  allowed_actions: ['postWishesIdRollback', 'postWishesIdComplete'],
  own_content: { ...emptyWish(), body: '合成心愿正文' },
}
async function moduleFrom(source: string) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled + `\n// ${Math.random()}`).toString('base64')}`
  )
}
const strip = (source: string) =>
  source.replace(/^import\s[\s\S]*?from\s+'([^']+)'\n/gm, (_all, name) =>
    name === 'vue' ? `import { computed, ref, watch } from '${import.meta.resolve('vue')}'\n` : '',
  )
async function setup() {
  const hooks: Record<string, (query?: { id: string }) => void> = {}
  const user = reactive({
    user: { id: 'synthetic-owner', version: 1, verification: 'verified', allowed_actions: [] },
    validated: true,
    refresh: async () => {},
  })
  let epoch = 1
  let row = structuredClone(sample)
  let confirm = (fn: (result: { confirm: boolean }) => void) => fn({ confirm: true })
  const calls: {
    url: string
    method?: string
    data?: Record<string, unknown>
    header?: Record<string, string>
  }[] = []
  class RequestError extends Error {
    statusCode = 409
    error_code = 'VERSION_CONFLICT'
  }
  let command = async () => structuredClone(row)
  Object.assign(globalThis, {
    uni: {
      showModal: (options: { success: (result: { confirm: boolean }) => void }) =>
        confirm(options.success),
    },
    __detailRequest: async (options: (typeof calls)[number]) => {
      calls.push(options)
      return options.method ? command() : structuredClone(row)
    },
  })
  const api = await moduleFrom(
    `const request = globalThis.__detailRequest;\n${strip(readFileSync(new URL('../src/api/wishes.ts', import.meta.url), 'utf8'))}`,
  )
  Object.assign(globalThis, {
    __detail: {
      ...api,
      user,
      useUserStore: () => user,
      useWishStore: () => ({}),
      config: { useMock: false, wishWritesReady: true },
      canWishAction,
      RequestError,
      session: { getEpoch: () => epoch, getToken: () => 'synthetic-token' },
      categories,
      campuses,
      rewards,
      wishStateLabels,
      onLoad: (fn: typeof hooks.load) => {
        hooks.load = fn!
      },
      onShow: (fn: typeof hooks.show) => {
        hooks.show = fn!
      },
      onHide: (fn: typeof hooks.hide) => {
        hooks.hide = fn!
      },
      onUnload: (fn: typeof hooks.unload) => {
        hooks.unload = fn!
      },
    },
  })
  const source = readFileSync(
    new URL('../src/pages/wish-detail/index.vue', import.meta.url),
    'utf8',
  )
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
  const page = await moduleFrom(
    `const { useUserStore, useWishStore, config, canWishAction, RequestError, session, categories, campuses, rewards, wishStateLabels, getWish, changeWishState, onLoad, onShow, onHide, onUnload } = globalThis.__detail;\n${strip(source)}\nexport { act, load, wish, content, currentWish, notice, error, writing, refreshExpiry };`,
  )
  hooks.load!({ id: sample.id })
  hooks.show!()
  for (let i = 0; i < 15; i++) await Promise.resolve()
  return {
    page,
    hooks,
    calls,
    user,
    RequestError,
    setRow: (value: WishResult) => {
      row = value
    },
    setCommand: (value: typeof command) => {
      command = value
    },
    setConfirm: (value: typeof confirm) => {
      confirm = value
    },
    changeSession: () => {
      epoch++
    },
  }
}
test('REQ-004/005：回退绑定目标版本与幂等键，刷新期限由服务端决定，不本地伪造上架', async () => {
  const { page, calls } = await setup()
  page.refreshExpiry.value = true
  await page.act('rollback', 'published')
  const writes = calls.filter((call) => call.method)
  assert.equal(writes.length, 1)
  assert.equal(writes[0]!.url, '/wishes/synthetic-wish/rollback')
  assert.deepEqual(writes[0]!.data, {
    expected_version: 7,
    target: 'published',
    refresh_expiry: true,
  })
  assert.ok(writes[0]!.header?.['Idempotency-Key'])
  assert.equal(page.currentWish.value.current_state, 'matching')
})
test('REQ-018：确认期间离开和会话变化不能提交旧动作，隐私屏障不回显正文', async () => {
  const s = await setup()
  let resolve: ((value: { confirm: boolean }) => void) | undefined
  s.setConfirm((fn) => {
    resolve = fn
  })
  const pending = s.page.act('complete')
  s.hooks.hide!()
  s.changeSession()
  resolve!({ confirm: true })
  await pending
  assert.equal(s.calls.filter((call) => call.method).length, 0)
  assert.equal(s.page.wish.value, null)
  s.setRow({ ...sample, privacy_review_required: true })
  s.hooks.show!()
  await s.page.load()
  assert.equal(s.page.content.value, null)
})
test('REQ-004：409仅重读不自动重写；切换账号不保留原正文', async () => {
  const s = await setup()
  s.setCommand(async () => {
    throw new s.RequestError('合成冲突')
  })
  await s.page.act('complete')
  assert.equal(s.calls.filter((call) => call.method).length, 1)
  assert.match(s.page.notice.value, /手动操作/)
  s.user.user = { ...s.user.user, id: 'synthetic-other' }
  assert.equal(s.page.wish.value, null)
  assert.equal(s.page.currentWish.value, null)
})
