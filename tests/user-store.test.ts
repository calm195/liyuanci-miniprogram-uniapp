import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import ts from 'typescript'
import { session } from '../src/utils/session.ts'
import { verificationLabel } from '../src/utils/access.ts'
import type { UserInfo } from '../src/types/api.ts'

const me: UserInfo = {
  id: 'synthetic-user',
  version: 1,
  verification: 'unverified',
  allowed_actions: [],
}
const config = { useMock: false }
const listeners = new Map<string, () => void>()
let codes: string[] = []
let requestIds: string[] = []
let failLogin = false
let failRevoke = false
let loadMe = async (): Promise<UserInfo> => me
const auth = {
  async wechatCode() {
    return `synthetic-code-${codes.length + 1}`
  },
  async login(code: string, clientRequestId: string) {
    codes.push(code)
    requestIds.push(clientRequestId)
    if (failLogin) throw new Error('合成登录失败')
    return { token: 'synthetic-token', me }
  },
  getMe: () => loadMe(),
  async getVerification() {
    return {
      request_id: 'synthetic-request',
      version: 1,
      status: 'rejected',
      reason: '合成原因',
      revision_suggestion: '合成建议',
    }
  },
  async revokeSession(key: string) {
    assert.ok(key)
    if (failRevoke) throw new Error('合成撤销失败')
  },
}
Object.assign(globalThis, {
  __storeTest: { auth, config, session, verificationLabel },
  uni: { $on: (event: string, handler: () => void) => listeners.set(event, handler) },
})
// 直接执行实际 Store，使用真实 Vue/Pinia，仅替换平台与后端边界。
const source = readFileSync(new URL('../src/stores/user.ts', import.meta.url), 'utf8')
  .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replace("from 'pinia'", `from '${import.meta.resolve('pinia')}'`)
  .replace(
    "import * as auth from '@/api/auth'",
    'const { auth, config, session, verificationLabel } = globalThis.__storeTest',
  )
  .replace("import { config } from '@/config'", '')
  .replace("import { session } from '@/utils/session'", '')
  .replace("import { verificationLabel } from '@/utils/access'", '')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const { useUserStore } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
function setup() {
  session.clear()
  config.useMock = false
  codes = []
  requestIds = []
  failLogin = false
  failRevoke = false
  loadMe = async () => me
  listeners.clear()
  setActivePinia(createPinia())
  return useUserStore()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('T009 / REQ-002：登录失败重试重新取 code，成功后刷新本人状态', async () => {
  const store = setup()
  failLogin = true
  await assert.rejects(store.login(), /合成登录失败/)
  assert.equal(store.busy, false)
  assert.equal(session.getToken(), '')
  failLogin = false
  await store.login()
  assert.deepEqual(codes, ['synthetic-code-1', 'synthetic-code-2'])
  assert.equal(requestIds.length, 2)
  assert.ok(requestIds.every(Boolean))
  assert.notEqual(requestIds[0], requestIds[1])
  assert.equal(store.isLoggedIn, true)
  assert.equal(store.validated, true)
  assert.equal(session.getToken(), 'synthetic-token')
})
test('T009 / REQ-018：重复点击登录只交换一次 code', async () => {
  const store = setup()
  const pending = deferred<UserInfo>()
  loadMe = () => pending.promise
  const login = store.login()
  await store.login()
  pending.resolve(me)
  await login
  assert.equal(codes.length, 1)
  assert.equal(requestIds.length, 1)
})
test('T009 / REQ-002：驳回展示建议，刷新失败关闭资格', async () => {
  const store = setup()
  loadMe = async () => ({ ...me, verification: 'rejected' })
  await store.login()
  assert.equal(store.verification.reason, '合成原因')
  assert.equal(store.verification.revision_suggestion, '合成建议')
  loadMe = async () => {
    throw new Error('合成网络失败')
  }
  await assert.rejects(store.refresh())
  assert.equal(store.validated, false)
  assert.equal(store.verification, null)
})
test('T009 / REQ-018：撤销失败仍清理本地，迟到刷新不恢复身份', async () => {
  const store = setup()
  await store.login()
  const pending = deferred<UserInfo>()
  loadMe = () => pending.promise
  const refresh = store.refresh()
  failRevoke = true
  await assert.rejects(store.logout(), /合成撤销失败/)
  pending.resolve(me)
  await refresh
  assert.equal(store.user, null)
  assert.equal(store.validated, false)
  assert.equal(store.busy, false)
  assert.equal(session.getToken(), '')
})
test('T009 / REQ-018：过期事件清理身份并丢弃迟到的登录结果', async () => {
  const store = setup()
  const pending = deferred<UserInfo>()
  loadMe = () => pending.promise
  const login = store.login()
  // 等到登录已进入本人资料刷新阶段。
  await Promise.resolve()
  await Promise.resolve()
  listeners.get('auth:expired')!()
  pending.resolve(me)
  await login
  assert.equal(store.user, null)
  assert.equal(store.expired, true)
  assert.equal(store.validated, false)
  assert.equal(session.getToken(), '')
})

test('REQ-002：认证页可只刷新本人资格，由页面独立读取审核记录', async () => {
  const store = setup()
  loadMe = async () => ({ ...me, verification: 'rejected' })
  await store.login()
  assert.ok(store.verification)
  await store.refresh(false)
  assert.equal(store.validated, true)
  assert.equal(store.user.verification, 'rejected')
  assert.equal(store.verification, null)
  await store.refresh()
  assert.equal(store.verification.version, 1)
})

test('REQ-018：并发资格刷新乱序返回时，旧权限不能覆盖新结果', async () => {
  const store = setup()
  await store.login()
  const old = deferred<UserInfo>()
  loadMe = () => old.promise
  const first = store.refresh(false)
  loadMe = async () => ({ ...me, version: 3, allowed_actions: [] })
  await store.refresh(false)
  old.resolve({ ...me, version: 2, allowed_actions: ['postWishes'] })
  await first
  assert.equal(store.user.version, 3)
  assert.deepEqual(store.user.allowed_actions, [])
})

test('REQ-018：最新资格刷新失败后，旧成功响应不能重新开放权限', async () => {
  const store = setup()
  await store.login()
  const old = deferred<UserInfo>()
  loadMe = () => old.promise
  const first = store.refresh(false)
  loadMe = async () => {
    throw new Error('合成新请求失败')
  }
  await assert.rejects(store.refresh(false))
  old.resolve({ ...me, allowed_actions: ['postWishes'] })
  await first
  assert.equal(store.validated, false)
})

test('REQ-007：静默资格刷新保留已验证展示直到返回，失败撤销发送资格', async () => {
  const store = setup()
  await store.login()
  const next = deferred<UserInfo>()
  loadMe = () => next.promise
  const pending = store.refresh(false, true)
  assert.equal(store.validated, true)
  next.resolve(me)
  await pending
  loadMe = async () => {
    throw new Error('网络失败')
  }
  await assert.rejects(store.refresh(false, true))
  assert.equal(store.validated, false)
})
