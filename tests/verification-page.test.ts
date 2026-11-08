import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { reactive, ref } from 'vue'
import { createVisiblePoller } from '../src/utils/visible-poller.ts'
import { canMeAction, validStudentNumber, verificationInput } from '../src/utils/actions.ts'

// 执行实际页面脚本，仅替换平台、会话及后端传输，不能作为真实联调证据。
async function setup(fromWish = false) {
  const hooks: Record<string, () => void> = {}
  let epoch = 1
  const scheduled = new Map<number, () => void>()
  const sent: unknown[] = []
  const modals: { title: string; content: string }[] = []
  const showModal = (modal: (typeof modals)[number]) => modals.push(modal)
  const $emit = (_event: string, value: { message: string }) => {
    const [title, ...parts] = value.message.split('：')
    modals.push({ title: title!, content: parts.join('：') })
  }
  Object.assign(globalThis, { uni: { showModal, $emit } })
  let submit = async (input: unknown): Promise<unknown> => {
    sent.push(input)
    return { request_id: 'synthetic-review', version: 1, status: 'pending' }
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
      createVisiblePoller: (task: () => Promise<void>, _: unknown, interval = 3000) =>
        createVisiblePoller(
          task,
          {
            set: (callback) => {
              scheduled.set(interval, callback)
              return interval as unknown as ReturnType<typeof setTimeout>
            },
            clear: () => {
              scheduled.delete(interval)
            },
          },
          interval,
        ),
      useWishActionReturn: () => ({ active: ref(fromWish) }),
      canMeAction,
      validStudentNumber,
      verificationInput,
      submitVerification: (input: unknown) => submit(input),
      getStudentCardAsset: (id: string) => query(id),
      useUserStore: () => store,
      getVerification: () => read(),
      RequestError,
      uploadStudentCard: async () => ({ asset_id: 'synthetic-upload', scan_status: 'pending' }),
      session: { getEpoch: () => epoch },
      onPullDownRefresh: () => {},
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
  const source = `const { config, createVisiblePoller, useWishActionReturn, useUserStore, getVerification, RequestError, canMeAction, validStudentNumber, verificationInput, submitVerification, getStudentCardAsset, uploadStudentCard, session, onPullDownRefresh, onShow, onHide, onUnload } = globalThis.__verificationPage;\n${script}\nexport { refreshReview, currentReview, reviewState, refreshing, name, studentNumber, asset, assetEpoch, error, submitReal, queryAsset, canSubmitReal, canUpload, chooseCard, uploading, submitting, querying, busy };`
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
    modals,
    showModal,
    $emit,
    nextScan: (interval = 3000) => {
      const callback = scheduled.get(interval)
      scheduled.delete(interval)
      return callback
    },
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

test('分享详情进入待审认证时只轮询资格，状态变化后更新审核记录，离开后停止', async () => {
  const { page, hooks, setRead, store, nextScan } = await setup(true)
  let recordReads = 0
  store.user.verification = 'pending'
  setRead(async () => {
    recordReads++
    return { version: recordReads, status: store.user.verification }
  })
  hooks.show!()
  await settle()
  assert.equal(page.currentReview.value.status, 'pending')
  nextScan(10_000)!()
  await settle()
  assert.equal(recordReads, 1)
  store.user.verification = 'rejected'
  nextScan(10_000)!()
  await settle()
  assert.equal(page.currentReview.value.status, 'rejected')
  assert.equal(nextScan(10_000), undefined)
  store.user.verification = 'pending'
  await page.refreshReview()
  hooks.hide!()
  assert.equal(nextScan(10_000), undefined)
})

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
  page.studentNumber.value = '202600001234'
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
  page.studentNumber.value = '202600001234'
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
  page.studentNumber.value = '202600001234'
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
  const { page, hooks, config, store, showModal, $emit } = await setup()
  hooks.show!()
  await settle()
  config.verificationWritesReady = true
  page.name.value = '合成姓名'
  page.studentNumber.value = '202600001234'
  let choose!: (result: { tempFilePaths: string[] }) => void
  Object.assign(globalThis, {
    uni: {
      showModal,
      $emit,
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

test('REQ-018：账号变化清空认证姓名、学号、审核记录与学生卡资产', async () => {
  const s = await setup()
  s.hooks.show!()
  await settle()
  s.page.name.value = '合成姓名'
  s.page.studentNumber.value = '202600001234'
  s.page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'approved' }
  s.store.user.id = 'synthetic-other'
  assert.equal(s.page.name.value, '')
  assert.equal(s.page.studentNumber.value, '')
  assert.equal(s.page.asset.value, null)
  assert.equal(s.page.currentReview.value, null)
})

test('认证页每个动作只显示自身进度，并阻止重复上传、查询和提交', async () => {
  const { page, hooks, config, setSubmit, sent, showModal, $emit } = await setup()
  hooks.show!()
  await settle()
  config.verificationWritesReady = true
  let choose!: (result: { tempFilePaths: string[] }) => void
  let chooseCalls = 0
  Object.assign(globalThis, {
    uni: {
      showModal,
      $emit,
      chooseImage: (options: { success: typeof choose }) => {
        chooseCalls++
        choose = options.success
      },
    },
  })
  try {
    const upload = page.chooseCard()
    assert.equal(page.uploading.value, true)
    assert.equal(page.submitting.value, false)
    assert.equal(page.querying.value, false)
    await page.chooseCard()
    await page.queryAsset()
    await page.submitReal()
    assert.equal(chooseCalls, 1)
    assert.equal(sent.length, 0)
    choose({ tempFilePaths: ['synthetic-path'] })
    await upload
    assert.equal(page.busy.value, false)
    await page.queryAsset()
    page.name.value = '合成姓名'
    page.studentNumber.value = '202600001234'
    let complete!: (result: unknown) => void
    setSubmit(() => new Promise((resolve) => (complete = resolve)))
    const submit = page.submitReal()
    assert.equal(page.submitting.value, true)
    assert.equal(page.uploading.value, false)
    assert.equal(page.querying.value, false)
    await page.chooseCard()
    await page.submitReal()
    assert.equal(chooseCalls, 1)
    complete({ request_id: 'synthetic-review', version: 8, status: 'pending' })
    await submit
    assert.equal(page.busy.value, false)
  } finally {
    Reflect.deleteProperty(globalThis, 'uni')
  }
})

test('申请回执确认待审核，后续本人资格刷新失败也保留记录', async () => {
  const { page, hooks, config, setRead, setSubmit, store } = await setup()
  hooks.show!()
  await settle()
  config.verificationWritesReady = true
  page.name.value = '合成姓名'
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'approved' }
  for (const invalid of ['20260000123', '０20600001234', '002600001234', '202600001234\n']) {
    page.studentNumber.value = invalid
    assert.equal(page.canSubmitReal.value, false)
  }
  page.studentNumber.value = '202600001234'
  let reads = 0
  setRead(async () => {
    reads++
    throw new Error('读取失败')
  })
  setSubmit(async () => {
    store.refresh = async () => {
      throw new Error('资格读取失败')
    }
    return { request_id: 'synthetic-review', version: 8, status: 'pending' }
  })
  await page.submitReal()
  assert.equal(page.currentReview.value.status, 'pending')
  assert.equal(page.reviewState.value, 'present')
  assert.equal(page.canSubmitReal.value, false)
  assert.equal(page.error.value, '')
  assert.equal(reads, 0)
})

test('图片扫描拒绝和通过都悬浮提示，分别提示重传和提交认证申请', async () => {
  const { page, hooks, setQuery, modals } = await setup()
  hooks.show!()
  await settle()
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'pending' }
  setQuery(async (id) => ({ asset_id: id, scan_status: 'rejected' }))
  await page.queryAsset()
  assert.equal(modals[0]?.title, '图片扫描未通过')
  assert.match(modals[0]?.content ?? '', /安全内容检查/)
  await page.queryAsset()
  assert.equal(modals.length, 1)
  page.asset.value = { asset_id: 'another-asset', scan_status: 'pending' }
  setQuery(async (id) => ({ asset_id: id, scan_status: 'approved' }))
  await page.queryAsset()
  assert.equal(modals[1]?.title, '图片扫描通过')
  assert.match(modals[1]?.content ?? '', /提交认证申请/)
})

test('扫描服务不可用时悬浮提示提示，并保留图片供手动重新查询', async () => {
  const { page, hooks, setQuery, RequestError, modals } = await setup()
  hooks.show!()
  await settle()
  page.assetEpoch.value = 1
  page.asset.value = { asset_id: 'synthetic-asset', scan_status: 'pending' }
  setQuery(async () => {
    throw new RequestError(503, 'DEPENDENCY_UNAVAILABLE')
  })
  await page.queryAsset()
  assert.equal(modals[0]?.title, '图片扫描查询未完成')
  assert.match(modals[0]?.content ?? '', /安全扫描服务暂未能完成处理/)
  assert.equal(page.asset.value.asset_id, 'synthetic-asset')
  assert.equal(page.canSubmitReal.value, false)
  setQuery(async (id) => ({ asset_id: id, scan_status: 'approved' }))
  await page.queryAsset()
  assert.equal(modals[1]?.title, '图片扫描通过')
})

test('上传后自动查询，等待超过两分钟时悬浮提示并停止自动查询', async (context) => {
  const { page, hooks, setQuery, modals, showModal, $emit, nextScan } = await setup()
  const clock = context.mock.method(Date, 'now', () => 1000)
  hooks.show!()
  await settle()
  Object.assign(globalThis, {
    uni: {
      showModal,
      $emit,
      chooseImage: (options: { success: (value: { tempFilePaths: string[] }) => void }) =>
        options.success({ tempFilePaths: ['synthetic-path'] }),
    },
  })
  let reads = 0
  setQuery(async (id) => {
    reads++
    return { asset_id: id, scan_status: 'pending' }
  })
  await page.chooseCard()
  assert.equal(modals[0]?.title, '图片已受理，等待安全扫描。')
  await settle()
  nextScan()?.()
  await settle()
  assert.equal(reads, 1)
  assert.equal(modals.length, 1)
  clock.mock.mockImplementation(() => 122_000)
  nextScan()?.()
  await settle()
  assert.equal(reads, 2)
  assert.equal(modals[1]?.title, '图片扫描时间较长')
  assert.equal(nextScan(), undefined)
  await page.queryAsset()
  assert.equal(reads, 3)
})
