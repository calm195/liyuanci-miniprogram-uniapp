import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { reactive } from 'vue'
import { canMeAction, verificationInput } from '../src/utils/actions.ts'

// 执行实际页面脚本，仅替换平台、会话及后端传输，不能作为真实联调证据。
async function setup() {
  const hooks: Record<string, () => void> = {}
  let epoch = 1
  const sent: unknown[] = []
  let submit = async (input: unknown): Promise<unknown> => {
    sent.push(input)
    return {}
  }
  let query = async (id: string): Promise<unknown> => ({ asset_id: id, scan_status: 'approved' })
  const config = reactive({ useMock: false, verificationWritesReady: false })
  let read = async (): Promise<unknown> => ({ version: 7, status: 'rejected' })
  class RequestError extends Error {
    code: number
    error_code: string
    constructor(code: number, error_code = '') {
      super('合成错误')
      this.code = code
      this.error_code = error_code
    }
  }
  const store = reactive({
    isLoggedIn: true,
    validated: true,
    user: {
      id: 'synthetic-a',
      version: 99,
      verification: 'rejected',
      allowed_actions: ['postMeVerificationRequests', 'postMeStudentCardAssets'],
    },
    refresh: async () => {},
  })
  Object.assign(globalThis, {
    __verificationPage: {
      config,
      canMeAction,
      verificationInput,
      submitVerification: (input: unknown) => submit(input),
      getStudentCardAsset: (id: string) => query(id),
      useUserStore: () => store,
      getVerification: () => read(),
      RequestError,
      uploadStudentCard: async () => ({ asset_id: 'synthetic-upload', scan_status: 'pending' }),
      session: { getEpoch: () => epoch },
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
  const script = readFileSync(
    new URL('../src/pages/verification/index.vue', import.meta.url),
    'utf8',
  )
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
    .replace(/^import .* from '(?!vue')[^']+'\n/gm, '')
    .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  const source = `const { config, useUserStore, getVerification, RequestError, canMeAction, verificationInput, submitVerification, getStudentCardAsset, uploadStudentCard, session, onShow, onHide, onUnload } = globalThis.__verificationPage;\n${script}\nexport { refreshReview, currentReview, reviewState, refreshing, name, studentNumber, asset, assetEpoch, error, submitReal, queryAsset, canSubmitReal, canUpload, chooseCard };`
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText
  const page = await import(
    `data:text/javascript;base64,${Buffer.from(compiled + `\n// ${Math.random()}`).toString('base64')}`
  )
  return {
    page,
    hooks,
    RequestError,
    config,
    store,
    sent,
    setSubmit: (fn: typeof submit) => {
      submit = fn
    },
    setQuery: (fn: typeof query) => {
      query = fn
    },
    setRead: (fn: typeof read) => {
      read = fn
    },
    changeSession: () => {
      epoch++
    },
  }
}
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

test('T013 / 002-A/B/C：页面区分当前记录、404首次与读取失败，不使用Me.version', async () => {
  const { page, hooks, setRead, RequestError } = await setup()
  hooks.show!()
  await settle()
  assert.equal(page.currentReview.value.version, 7)
  assert.equal(page.reviewState.value, 'present')
  setRead(async () => {
    throw new RequestError(404)
  })
  await page.refreshReview()
  assert.equal(page.reviewState.value, 'absent')
  assert.equal(page.currentReview.value, null)
  setRead(async () => {
    throw new RequestError(403)
  })
  await page.refreshReview()
  assert.equal(page.reviewState.value, 'unknown')
  assert.ok(page.error.value)
  setRead(async () => ({ version: 0 }))
  await page.refreshReview()
  assert.equal(page.reviewState.value, 'unknown')
})
test('T013 / REQ-018：离开清理、重入重读，旧读取和会话变化不能恢复页面资料', async () => {
  const { page, hooks, setRead, changeSession } = await setup()
  let resolve!: (value: unknown) => void
  setRead(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  hooks.show!()
  await settle()
  page.name.value = '合成姓名'
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic', scan_status: 'approved' }
  hooks.hide!()
  assert.equal(page.name.value, '')
  assert.equal(page.asset.value, null)
  setRead(async () => ({ version: 8, status: 'pending' }))
  hooks.show!()
  await settle()
  resolve({ version: 7, status: 'rejected' })
  await settle()
  assert.equal(page.currentReview.value.version, 8)
  setRead(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = page.refreshReview()
  await settle()
  changeSession()
  resolve({ version: 9, status: 'approved' })
  await pending
  assert.equal(page.currentReview.value, null)
  assert.equal(page.reviewState.value, 'unknown')
  hooks.unload!()
  assert.equal(page.refreshing.value, false)
})

test('B14 / I1-V01/V02：实际页面构造首次和重提，服务准入关闭不发送', async () => {
  const { page, hooks, config, setRead, RequestError, sent } = await setup()
  setRead(async () => {
    throw new RequestError(404)
  })
  hooks.show!()
  await settle()
  page.name.value = '合成姓名'
  page.studentNumber.value = '合成学号'
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'approved' }
  await page.submitReal()
  assert.equal(sent.length, 0)
  config.verificationWritesReady = true
  await page.submitReal()
  assert.equal(sent.length, 1)
  assert.equal(Object.prototype.hasOwnProperty.call(sent[0], 'expected_version'), false)
  assert.equal(page.asset.value, null)
  setRead(async () => ({ version: 7, status: 'rejected' }))
  await page.refreshReview()
  page.name.value = '合成姓名'
  page.studentNumber.value = '合成学号'
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'approved' }
  await page.submitReal()
  assert.equal((sent[1] as { expected_version: number }).expected_version, 7)
})
test('B14 / I1-04：冲突只重读不自动重提，缺失授权拒绝提交', async () => {
  const { page, hooks, config, setRead, setSubmit, RequestError, store } = await setup()
  hooks.show!()
  await settle()
  config.verificationWritesReady = true
  page.name.value = '合成姓名'
  page.studentNumber.value = '合成学号'
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'approved' }
  let attempts = 0
  setRead(async () => ({ version: 8, status: 'rejected' }))
  setSubmit(async () => {
    attempts++
    throw new RequestError(409, 'VERSION_CONFLICT')
  })
  await page.submitReal()
  assert.equal(attempts, 1)
  assert.equal(page.currentReview.value.version, 8)
  assert.match(page.error.value, /手动/)
  store.user.allowed_actions = []
  await page.submitReal()
  assert.equal(attempts, 1)
  assert.equal(page.canUpload.value, false)
})
test('B14 / I1-S01/S02：单次查询不自动认证，离开丢弃、重入不恢复资产、404清引用', async () => {
  const { page, hooks, setQuery, RequestError, store } = await setup()
  hooks.show!()
  await settle()
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'pending' }
  await page.queryAsset()
  assert.equal(page.asset.value.scan_status, 'approved')
  assert.equal(store.user.verification, 'rejected')
  let resolve!: (value: unknown) => void
  setQuery(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = page.queryAsset()
  hooks.hide!()
  hooks.show!()
  resolve({ asset_id: 'synthetic-asset', scan_status: 'approved' })
  await pending
  assert.equal(page.asset.value, null)
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'approved' }
  setQuery(async () => {
    throw new RequestError(404)
  })
  await page.queryAsset()
  assert.equal(page.asset.value, null)
})

test('T013：选图临时隐藏保留表单，扫描通过且字段完整才可提交，正常离开仍清理', async () => {
  const { page, hooks, config, store } = await setup()
  hooks.show!()
  await settle()
  config.verificationWritesReady = true
  page.name.value = '合成姓名'
  page.studentNumber.value = '合成学号'
  let choose!: (result: { tempFilePaths: string[] }) => void
  Object.assign(globalThis, {
    uni: {
      chooseImage: (options: { success: typeof choose }) => {
        hooks.hide!()
        choose = options.success
      },
    },
  })
  try {
    const pending = page.chooseCard()
    assert.equal(page.name.value, '合成姓名')
    hooks.show!()
    // 应用返回前台刷新资格时，会先临时撤销 validated。
    store.validated = false
    store.refresh = async () => {
      store.validated = true
    }
    choose({ tempFilePaths: ['synthetic-path'] })
    await pending
    assert.equal(page.asset.value.asset_id, 'synthetic-upload')
    assert.equal(page.canSubmitReal.value, false)
    await page.queryAsset()
    assert.equal(page.canSubmitReal.value, true)
    page.studentNumber.value = ' '
    assert.equal(page.canSubmitReal.value, false)
    hooks.hide!()
    assert.equal(page.name.value, '')
    assert.equal(page.asset.value, null)
  } finally {
    Reflect.deleteProperty(globalThis, 'uni')
  }
})
