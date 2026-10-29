import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { session } from '../src/utils/session.ts'
import { resourceSchemas, resourceOperations } from '../src/utils/resource-contract.ts'
import { matchesResourceSchema, normalizeResourceText } from '../src/utils/resource-schema.ts'
import {
  fixture,
  sample,
  resourcesRuntime,
  setupResourcePage,
  envelope,
  resourceId,
  categoryId,
} from './support/resources-runtime.ts'
import { settle } from './support/page-runtime.ts'
import type { Input } from './support/resources-runtime.ts'
import { beijingTime } from '../src/utils/capsules.ts'

test('REQ-023：正式学生schema字段/约束完整，正反夹具和31个规范文本向量均消费', () => {
  function constraints(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(constraints)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([k]) => !['description', 'default'].includes(k))
          .map(([k, v]) => [
            k,
            k === 'properties'
              ? Object.fromEntries(
                  Object.entries(v as object).map(([name, part]) => [name, constraints(part)]),
                )
              : constraints(v),
          ]),
      )
    return value
  }
  for (const [name, schema] of Object.entries(resourceSchemas))
    assert.deepEqual(schema, constraints(fixture.schemas[name]), name)
  assert.ok(resourceSchemas.ResourceDetail!.properties!.description)
  for (const f of fixture.fixtures)
    assert.equal(
      matchesResourceSchema(resourceSchemas[f.schema]!, f.value, resourceSchemas),
      f.valid,
      f.name,
    )
  for (const f of fixture.text_vectors) {
    if (f.valid) assert.equal(normalizeResourceText(f.kind, f.value), f.normalized, f.name)
    else assert.throws(() => normalizeResourceText(f.kind, f.value), f.name)
  }
  assert.equal(beijingTime('2026-10-29T20:15:00.123456Z'), '2026-10-30 04:15:00')
})
test('REQ-023：五接口完整路径、200封装、错误码配对、no-store及未知字段拒绝', async () => {
  session.setToken('synthetic-resource-tests')
  let response: {
    statusCode: number
    data: Record<string, unknown>
    header: Record<string, string>
  } = envelope(null)
  const api = await resourcesRuntime(async () => response)
  const methods: Record<string, () => Promise<unknown>> = {
    resourceCategoriesList: () => api.listResourceCategories(),
    resourcesList: () => api.listResources(),
    resourceDetail: () => api.getResource(resourceId),
    resourceDownloadInfo: () => api.getResourceDownload(resourceId, 3),
    resourceFeedbackPut: () =>
      api.putResourceFeedback(
        resourceId,
        { kind: 'valid', expected_content_version: 2, expected_feedback_version: 0 },
        'synthetic-key',
      ),
  }
  for (const exchange of fixture.exchanges) {
    response = {
      statusCode: exchange.http_status,
      data: exchange.body,
      header: { 'Cache-Control': 'no-store' },
    }
    assert.deepEqual(await methods[exchange.operation_id]!(), exchange.body.data)
    const sent = api.calls.at(-1)!
    const spec = resourceOperations[exchange.operation_id as keyof typeof resourceOperations]
    assert.equal(sent.method, spec.method)
    assert.equal(
      sent.url.split('?')[0],
      'https://synthetic.invalid/api/v1' + spec.path.replace('{id}', resourceId),
    )
    assert.equal(
      api.validResourceResponse(exchange.operation_id, { ...response, statusCode: 201 }),
      false,
    )
    assert.equal(
      api.validResourceResponse(exchange.operation_id, { ...response, header: {} }),
      false,
    )
    assert.equal(
      api.validResourceResponse(exchange.operation_id, {
        ...response,
        data: { ...response.data, extra: true },
      }),
      false,
    )
  }
  for (const e of fixture.error_examples) {
    const wire = {
      statusCode: e.http_status,
      data: e.body,
      header: { 'Cache-Control': 'no-store' },
    }
    assert.equal(api.validResourceResponse(e.operation_id, wire), true)
    assert.equal(
      api.validResourceResponse(e.operation_id, {
        ...wire,
        data: { ...e.body, data: { secret: 'no' } },
      }),
      false,
    )
    assert.equal(
      api.validResourceResponse(e.operation_id, {
        ...wire,
        data: { ...e.body, error_code: 'UNKNOWN' },
      }),
      false,
    )
  }
  response = {
    statusCode: 403,
    data: {
      code: 403,
      message: '合成拒绝',
      error_code: 'VERIFICATION_REQUIRED',
      request_id: 'synthetic',
    },
    header: { 'Cache-Control': 'no-store' },
  }
  await assert.rejects(api.getResource(resourceId), {
    statusCode: 403,
    error_code: 'VERIFICATION_REQUIRED',
  })
  assert.ok(session.getToken())
})
test('REQ-023：目标/版本/复制文本和本人反馈绑定，错误响应不可当成功', async () => {
  session.setToken('synthetic-target-test')
  let data = { ...sample('resourceDownloadInfo'), resource_id: categoryId }
  const api = await resourcesRuntime(async () => envelope(data))
  await assert.rejects(api.getResourceDownload(resourceId, 3))
  data = { ...sample('resourceDownloadInfo'), version: 4 }
  await assert.rejects(api.getResourceDownload(resourceId, 3))
  data = { ...sample('resourceDownloadInfo'), copy_text: '注入其他剪贴板文本' }
  await assert.rejects(api.getResourceDownload(resourceId, 3))
  data = {
    ...sample('resourceDetail'),
    my_feedback: { ...sample('resourceFeedbackPut'), content_version: 3 },
  }
  await assert.rejects(api.getResource(resourceId))
  data = { ...sample('resourceFeedbackPut'), content_version: 3 }
  await assert.rejects(
    api.putResourceFeedback(
      resourceId,
      { kind: 'valid', expected_content_version: 2, expected_feedback_version: 0 },
      'key',
    ),
  )
  const before = api.calls.length
  await assert.rejects(async () => api.listResources({ q: '😀'.repeat(101) }))
  await assert.rejects(async () => api.listResources({ limit: 1.5 }))
  await assert.rejects(async () => api.listResourceCategories({ cursor: '' }))
  await assert.rejects(api.getResource('invalid'))
  assert.equal(api.calls.length, before)
})
test('REQ-023：游客及四种认证，禁言仍可读取但无反馈动作', async () => {
  for (const state of ['guest', 'unverified', 'pending', 'rejected'] as const) {
    const s = await setupResourcePage('index', state)
    assert.equal(s.api.calls.length, 0)
    assert.equal(s.runtime.page.ready.value, false)
    assert.ok(s.runtime.page.gate.value)
  }
  const s = await setupResourcePage('detail')
  s.setDetail({ ...s.detail(), allowed_actions: ['copy_download'] })
  await s.runtime.load()
  s.runtime.select('valid')
  await s.runtime.submit()
  assert.equal(s.api.calls.filter((x: Input) => x.method === 'PUT').length, 0)
  await s.runtime.copy(false)
  assert.equal(s.clipboard(), sample('resourceDownloadInfo').copy_text)
})
test('REQ-023：分类完整翻页、搜索交集、晚到结果与循环游标', async () => {
  const s = await setupResourcePage('index')
  let categoryCalls = 0
  s.transport(async (input) => {
    if (input.url.includes('resource-categories'))
      return envelope({
        items: [{ id: categoryCalls++ ? resourceId : categoryId, name: '合成分类' }],
        next_cursor: categoryCalls === 1 ? 'next-category' : null,
      })
    return envelope(sample('resourcesList'))
  })
  await s.runtime.load()
  assert.equal(s.runtime.categories.value.length, 2)
  s.runtime.category.value = categoryId
  s.runtime.keyword.value = '  数学  '
  await s.runtime.search()
  const url = s.api.calls.at(-1)!.url
  assert.match(url, /category_id=ac230/)
  assert.match(url, /q=%E6%95%B0%E5%AD%A6/)
  let done: (value: ReturnType<typeof envelope>) => void = () => {}
  s.transport(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  s.runtime.keyword.value = '旧查询'
  const old = s.runtime.search()
  await settle()
  s.transport(async () => envelope({ items: [], next_cursor: null }))
  s.runtime.keyword.value = '新查询'
  await s.runtime.search()
  done(envelope(sample('resourcesList')))
  await old
  assert.equal(s.runtime.items.value.length, 0)
  s.transport(async () => envelope({ ...sample('resourcesList'), next_cursor: 'loop' }))
  await s.runtime.search()
  await s.runtime.search(true)
  assert.equal(s.runtime.items.value.length, 0)
  assert.match(s.runtime.page.error.value, /分页/)
})
test('REQ-023：每次复制重新取链，剪贴板失败/409刷新不兜底；隐藏或换会话拒绝晚到结果', async () => {
  const s = await setupResourcePage('detail')
  await s.runtime.copy(true)
  await s.runtime.copy(false)
  assert.equal(s.api.calls.filter((x: Input) => x.url.includes('download-info')).length, 2)
  s.failClipboard()
  await s.runtime.copy(false)
  assert.match(s.runtime.page.error.value, /复制失败/)
  let done: (value: ReturnType<typeof envelope>) => void = () => {}
  s.transport(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  const copying = s.runtime.copy(false)
  await settle()
  s.hide()
  done(envelope(sample('resourceDownloadInfo')))
  await copying
  assert.equal(s.runtime.detail.value, null)
  assert.equal(s.runtime.page.notice.value, '')
  const second = await setupResourcePage('detail')
  second.delayClipboard()
  const pending = second.runtime.copy(false)
  await settle()
  session.setToken('synthetic-new-account')
  second.finishClipboard()
  await pending
  assert.equal(second.runtime.detail.value, null)
  assert.equal(second.runtime.page.notice.value, '')
  const third = await setupResourcePage('detail')
  third.transport(async (input) =>
    input.url.includes('download-info')
      ? {
          statusCode: 409,
          data: { code: 409, error_code: 'VERSION_CONFLICT', message: '合成冲突', request_id: 's' },
          header: { 'Cache-Control': 'no-store' },
        }
      : envelope({ ...sample('resourceDetail'), my_feedback: null }),
  )
  await third.runtime.copy(false)
  assert.equal(third.clipboard(), '')
  assert.match(third.runtime.page.notice.value, /再次操作/)
})
test('REQ-023：反馈初次0/改选版本、网络未知同键同体重试，409不自动重投', async () => {
  const s = await setupResourcePage('detail')
  s.runtime.select('valid')
  await s.runtime.submit()
  const first = s.api.calls.find((x: Input) => x.method === 'PUT')!
  assert.equal(first.data?.expected_feedback_version, 0)
  assert.equal(s.runtime.detail.value.my_feedback.kind, 'valid')
  s.runtime.select('outdated')
  await s.runtime.submit()
  assert.equal(s.api.calls.at(-1)!.data?.expected_feedback_version, 1)
  let fail = true
  s.transport(async (input) => {
    if (fail) throw new Error('合成网络超时')
    return envelope({ ...sample('resourceFeedbackPut'), kind: input.data?.kind, version: 3 })
  })
  s.runtime.select('incomplete')
  await s.runtime.submit()
  assert.ok(s.runtime.pending.value)
  const original = s.api.calls.at(-1)!
  s.runtime.select('valid')
  await s.runtime.submit()
  assert.equal(s.api.calls.at(-1), original)
  fail = false
  await s.runtime.submit(true)
  assert.deepEqual(s.api.calls.at(-1), original)
  assert.equal(s.runtime.detail.value.my_feedback.kind, 'incomplete')
  const writes = s.api.calls.filter((x: Input) => x.method === 'PUT').length
  s.transport(async (input) =>
    input.method === 'PUT'
      ? {
          statusCode: 409,
          data: { code: 409, error_code: 'VERSION_CONFLICT', message: '合成冲突', request_id: 's' },
          header: { 'Cache-Control': 'no-store' },
        }
      : envelope({ ...sample('resourceDetail'), my_feedback: null }),
  )
  s.runtime.select('valid')
  await s.runtime.submit()
  assert.equal(s.api.calls.filter((x: Input) => x.method === 'PUT').length, writes + 1)
  assert.equal(s.runtime.pending.value, null)
  assert.equal(s.runtime.choice.value, '')
})
test('REQ-023：403清空敏感详情，401清会话，投稿仅固定图且缺图可关闭', async () => {
  const s = await setupResourcePage('detail')
  s.transport(async () => ({
    statusCode: 403,
    data: { code: 403, error_code: 'FORBIDDEN', message: '合成受限', request_id: 's' },
    header: { 'Cache-Control': 'no-store' },
  }))
  await s.runtime.copy(false)
  assert.equal(s.runtime.detail.value, null)
  assert.equal(s.clipboard(), '')
  s.transport(async () => ({
    statusCode: 401,
    data: { code: 401, error_code: 'UNAUTHENTICATED', message: '合成失效', request_id: 's' },
    header: { 'Cache-Control': 'no-store' },
  }))
  await s.runtime.load()
  assert.equal(session.getToken(), '')
  const source = readFileSync(
    new URL('../src/components/ResourceContribution.vue', import.meta.url),
    'utf8',
  )
  assert.match(source, /投稿二维码暂未配置/)
  assert.match(source, /mode="widthFix"/)
  assert.doesNotMatch(source, /uploadFile|sendMessage|navigateTo/)
  const index = await setupResourcePage('index')
  index.runtime.openContribution()
  assert.equal(index.runtime.contribution.value, true)
  index.hide()
  assert.equal(index.runtime.contribution.value, false)
  const home = readFileSync(new URL('../src/pages/index/index.vue', import.meta.url), 'utf8')
  assert.match(home, /资料广场/)
  assert.match(home, /认证后查看/)
  const requestSource = readFileSync(new URL('../src/utils/request.ts', import.meta.url), 'utf8')
  assert.match(requestSource, /validateResponse/)
})

test('REQ-023：固定二维码缺图不预览、加载失败可重试、查看大图只使用固定路径', async () => {
  const source = readFileSync(
    new URL('../src/components/ResourceContribution.vue', import.meta.url),
    'utf8',
  )
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
  const { loadRuntime } = await import('./support/page-runtime.ts')
  const views: unknown[] = []
  let fail: () => void = () => {}
  async function component(image: string) {
    return loadRuntime(source + '\nexport {preview,retry,failed,attempt}', {
      resourceContributionImage: image,
      defineProps: () => ({ open: true }),
      defineEmits: () => () => {},
      uni: {
        previewImage(options: { fail: () => void }) {
          views.push(options)
          fail = options.fail
        },
      },
    })
  }
  const missing = await component('')
  missing.preview()
  assert.equal(views.length, 0)
  const ready = await component('/static/synthetic-test-qr.png')
  ready.preview()
  assert.equal(views.length, 1)
  assert.deepEqual((views[0] as { urls: string[] }).urls, ['/static/synthetic-test-qr.png'])
  fail()
  assert.equal(ready.failed.value, true)
  ready.preview()
  assert.equal(views.length, 1)
  ready.retry()
  assert.equal(ready.failed.value, false)
  assert.equal(ready.attempt.value, 1)
  ready.preview()
  assert.equal(views.length, 2)
})
