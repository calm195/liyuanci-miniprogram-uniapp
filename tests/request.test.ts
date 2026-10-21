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
  data = { code: 1009, error_code: 'VERSION_CONFLICT', request_id: 'synthetic-conflict' }
  await assert.rejects(request({ url: '/me' }), {
    code: 1009,
    statusCode: 409,
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

test('T013 / REQ-002、018：学生卡上传统一鉴权、幂等、202、401及会话失效隔离', async () => {
  config.useMock = false
  config.isDev = false
  config.apiBaseUrl = 'https://synthetic.invalid/api/v1'
  let uploadStatus = 202
  let uploadBody = JSON.stringify({
    code: 0,
    request_id: 'synthetic-upload',
    data: { asset_id: 'synthetic-asset', scan_status: 'pending' },
  })
  let uploadOptions: Record<string, unknown> = {}
  let changeSession = false
  let uploadCalls = 0
  Object.assign(uni, {
    uploadFile(options: { success: (response: unknown) => void }) {
      uploadCalls++
      uploadOptions = options
      if (changeSession) session.clear()
      options.success({ statusCode: uploadStatus, data: uploadBody })
    },
  })
  session.setToken('synthetic-upload-token')
  assert.deepEqual(
    await request({
      url: '/me/student-card-assets',
      method: 'POST',
      filePath: 'synthetic-local-card',
      header: { 'Idempotency-Key': 'synthetic-key' },
    }),
    { asset_id: 'synthetic-asset', scan_status: 'pending' },
  )
  assert.equal(uploadOptions.name, 'file')
  assert.equal(uploadOptions.filePath, 'synthetic-local-card')
  const header = uploadOptions.header as Record<string, string>
  assert.equal(header.Authorization, 'Bearer synthetic-upload-token')
  assert.equal(header['Idempotency-Key'], 'synthetic-key')
  assert.equal(header['Content-Type'], undefined)
  uploadBody = 'invalid JSON'
  await assert.rejects(
    request({ url: '/me/student-card-assets', filePath: 'synthetic-local-card' }),
  )
  uploadStatus = 401
  const beforeExpired = expired
  await assert.rejects(
    request({ url: '/me/student-card-assets', filePath: 'synthetic-local-card' }),
  )
  assert.equal(session.getToken(), '')
  assert.equal(expired, beforeExpired + 1)
  session.setToken('synthetic-new-token')
  uploadStatus = 202
  uploadBody = JSON.stringify({ code: 0, request_id: 'synthetic-upload', data: {} })
  changeSession = true
  await assert.rejects(
    request({ url: '/me/student-card-assets', filePath: 'synthetic-local-card' }),
    /会话已变化/,
  )
  config.useMock = true
  const before = uploadCalls
  await assert.rejects(
    request({ url: '/me/student-card-assets', filePath: 'synthetic-local-card' }),
  )
  assert.equal(uploadCalls, before)
})

// 复用实际请求层执行认证适配，平台传输仍为合成替代。
Object.assign(globalThis, { __verificationTest: { request } })
const verificationSource = readFileSync(
  new URL('../src/api/verification.ts', import.meta.url),
  'utf8',
).replace(
  "import { request } from '@/utils/request'",
  'const { request } = globalThis.__verificationTest',
)
const verificationCompiled = ts.transpileModule(verificationSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const verificationApi = await import(
  `data:text/javascript;base64,${Buffer.from(verificationCompiled).toString('base64')}`
)
test('T013 / REQ-002、015、018：0.2.0扫描单次查询、首次省略及重提审核版本与错误分支', async () => {
  config.useMock = false
  config.apiBaseUrl = 'https://synthetic.invalid/api/v1'
  session.setToken('synthetic-verification-token')
  statusCode = 200
  for (const scan_status of ['pending', 'approved', 'rejected']) {
    data = {
      code: 0,
      request_id: 'synthetic-scan',
      data: { asset_id: 'synthetic/asset', scan_status },
    }
    assert.deepEqual(
      await verificationApi.getStudentCardAsset('synthetic/asset'),
      (data as { data: unknown }).data,
    )
    assert.equal(sent.url, config.apiBaseUrl + '/me/student-card-assets/synthetic%2Fasset')
    assert.equal(sent.method, 'GET')
  }
  const input = { student_number: '合成学号', name: '合成姓名', asset_id: 'synthetic-asset' }
  statusCode = 202
  data = {
    code: 0,
    request_id: 'synthetic-submit',
    data: { request_id: 'synthetic-review', version: 1, status: 'pending' },
  }
  await verificationApi.submitVerification(input, 'synthetic-first')
  assert.equal(Object.prototype.hasOwnProperty.call(sent.data as object, 'expected_version'), false)
  assert.equal((sent.header as Record<string, string>)['Idempotency-Key'], 'synthetic-first')
  const review = { version: 3 }
  await verificationApi.submitVerification(
    { ...input, expected_version: review.version },
    'synthetic-resubmit',
  )
  assert.equal((sent.data as { expected_version: number }).expected_version, 3)
  for (const [status, error_code] of [
    [400, 'VALIDATION_FAILED'],
    [409, 'VERSION_CONFLICT'],
    [409, 'ASSET_NOT_READY'],
  ] as const) {
    statusCode = status
    data = { code: status, error_code, request_id: 'synthetic-error' }
    const before = calls
    await assert.rejects(verificationApi.submitVerification(input, 'synthetic-error'), {
      error_code,
      request_id: 'synthetic-error',
    })
    assert.equal(calls, before + 1)
  }
  statusCode = 404
  data = { code: 404, error_code: 'NOT_FOUND' }
  await assert.rejects(verificationApi.getStudentCardAsset('synthetic-other'), {
    error_code: 'NOT_FOUND',
  })
})

async function loadApi(name: string) {
  Object.assign(globalThis, { __auditedRequest: request })
  const source = readFileSync(new URL(`../src/api/${name}.ts`, import.meta.url), 'utf8').replace(
    "import { request } from '@/utils/request'",
    'const request = globalThis.__auditedRequest',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}

test('REQ-002、018：实际会话API符合契约，微信code无效不撤销现有Bearer会话', async () => {
  const api = await loadApi('auth')
  config.useMock = false
  session.setToken('synthetic-existing-token')
  const me = { id: 'synthetic-user', version: 1, verification: 'unverified', allowed_actions: [] }
  statusCode = 200
  data = { code: 0, request_id: 'synthetic-login', data: { token: 'synthetic-new-token', me } }
  await api.login('synthetic-code', 'synthetic-attempt')
  assert.equal(sent.url, config.apiBaseUrl + '/auth/wechat-sessions')
  assert.equal(sent.method, 'POST')
  assert.deepEqual(sent.data, { code: 'synthetic-code', client_request_id: 'synthetic-attempt' })
  assert.equal((sent.header as Record<string, string>).Authorization, undefined)
  assert.equal((sent.header as Record<string, string>)['Idempotency-Key'], undefined)
  statusCode = 401
  data = { code: 1001, error_code: 'UNAUTHENTICATED', request_id: 'synthetic-code-invalid' }
  const beforeExpired = expired
  await assert.rejects(api.login('synthetic-invalid', 'synthetic-attempt-2'), {
    statusCode: 401,
    message: '微信登录凭据无效，请重新登录',
  })
  assert.equal(expired, beforeExpired)
  assert.equal(session.getToken(), 'synthetic-existing-token')
  statusCode = 200
  data = { code: 0, request_id: 'synthetic-me', data: me }
  assert.deepEqual(await api.getMe(), me)
  assert.equal(sent.url, config.apiBaseUrl + '/me')
  assert.equal(
    (sent.header as Record<string, string>).Authorization,
    'Bearer synthetic-existing-token',
  )
  data = { code: 0, request_id: 'synthetic-review', data: { version: 3, status: 'rejected' } }
  await api.getVerification(true)
  assert.equal(sent.url, config.apiBaseUrl + '/me/verification-request')
  assert.equal(sent.silent, true)
  statusCode = 204
  data = ''
  await api.revokeSession('synthetic-logout-key')
  assert.equal(sent.url, config.apiBaseUrl + '/auth/session')
  assert.equal(sent.method, 'DELETE')
  assert.equal((sent.header as Record<string, string>)['Idempotency-Key'], 'synthetic-logout-key')
})

test('T009 / REQ-002、018：登录409不自动重发，调用方网络重发保持凭据对不变', async () => {
  const api = await loadApi('auth')
  config.useMock = false
  config.apiBaseUrl = 'https://synthetic.invalid/api/v1'
  statusCode = 409
  data = { code: 409, message: '请求未完成', request_id: 'synthetic-conflict' }
  const before = calls
  await assert.rejects(api.login('synthetic-code', 'synthetic-attempt'), { statusCode: 409 })
  assert.equal(calls, before + 1)
  const original = { ...(sent.data as Record<string, string>) }
  statusCode = 200
  data = { code: 0, request_id: 'synthetic-replay', data: { token: 'synthetic-token' } }
  await api.login('synthetic-code', 'synthetic-attempt')
  assert.deepEqual(sent.data, original)
  assert.equal(calls, before + 2)
})
