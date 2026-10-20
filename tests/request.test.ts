import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { session } from '../src/utils/session.ts'
// T009 / REQ-002、018：替换平台传输，直接执行生产请求层；不访问网络。
const config = { apiBaseUrl: 'https://synthetic.invalid/api/v1', useMock: false, isDev: false }
let statusCode = 200
let data: unknown
let calls = 0
let expired = 0
let sent: Record<string, unknown> = {}
Object.assign(globalThis, {
  __requestTest: { config, session },
  uni: {
    request(options: { success: (value: unknown) => void }) {
      calls++
      sent = options
      options.success({ statusCode, data })
    },
    $emit() {
      expired++
    },
    showToast() {},
  },
})
const source = readFileSync(new URL('../src/utils/request.ts', import.meta.url), 'utf8')
  .replace(
    "import { config } from '@/config'",
    'const { config, session } = globalThis.__requestTest',
  )
  .replace("import { session } from './session'", '')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const { request } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
test('T009 / REQ-002、018：成功、错误标识、204、401与 Mock 隔离', async () => {
  session.setToken('synthetic-test-only')
  data = {
    code: 0,
    message: 'ok',
    request_id: 'synthetic-request',
    data: { verification: 'pending' },
  }
  assert.deepEqual(await request({ url: '/me' }), { verification: 'pending' })
  assert.equal(sent.url, config.apiBaseUrl + '/me')
  assert.equal((sent.header as Record<string, string>).Authorization, 'Bearer synthetic-test-only')
  statusCode = 409
  data = { code: 409, error_code: 'VERSION_CONFLICT', request_id: 'synthetic-conflict' }
  await assert.rejects(request({ url: '/me' }), {
    error_code: 'VERSION_CONFLICT',
    request_id: 'synthetic-conflict',
  })
  statusCode = 204
  data = ''
  assert.equal(await request({ url: '/auth/session', method: 'DELETE' }), undefined)
  statusCode = 401
  data = { code: 401, error_code: 'UNAUTHENTICATED', request_id: 'synthetic-expired' }
  await assert.rejects(request({ url: '/me' }), { error_code: 'UNAUTHENTICATED' })
  assert.equal(session.getToken(), '')
  assert.equal(expired, 1)
  const before = calls
  await assert.rejects(request({ url: '//other.invalid/me' }))
  config.useMock = true
  await assert.rejects(request({ url: '/me' }))
  assert.equal(calls, before)
})

test('T009 / REQ-018：仅开发环境放行本机与私网 HTTP，生产强制 HTTPS', async () => {
  config.useMock = false
  statusCode = 200
  data = { code: 0, request_id: 'synthetic-local', data: {} }
  const localAddresses = [
    'http://localhost:8080/api/v1',
    'http://127.0.0.1:8080/api/v1',
    'http://[::1]:8080/api/v1',
    'http://10.0.0.2/api/v1',
    'http://172.16.0.2/api/v1',
    'http://172.31.255.254/api/v1',
    'http://192.168.1.10:8080/api/v1',
  ]
  for (const isDev of [true, false]) {
    config.isDev = isDev
    for (const address of localAddresses) {
      config.apiBaseUrl = address
      const before = calls
      if (isDev) {
        await request({ url: '/me' })
        assert.equal(sent.url, address + '/me')
        assert.equal(calls, before + 1)
      } else {
        await assert.rejects(request({ url: '/me' }), /HTTPS/)
        assert.equal(calls, before)
      }
    }
    for (const address of [
      'http://example.com/api/v1',
      'http://8.8.8.8/api/v1',
      'http://172.15.0.1/api/v1',
      'http://172.32.0.1/api/v1',
      'http://192.168.1.256/api/v1',
      'http://localhost.evil.invalid/api/v1',
      'http://localhost@evil.invalid/api/v1',
      'http://localhost:65536/api/v1',
      'http://localhost:0/api/v1',
      'http://10..1.1/api/v1',
      'http://172.016.0.1/api/v1',
      '',
    ]) {
      config.apiBaseUrl = address
      const before = calls
      await assert.rejects(request({ url: '/me' }))
      assert.equal(calls, before)
    }
    config.apiBaseUrl = 'https://synthetic.invalid/api/v1'
    await request({ url: '/me' })
  }
})
