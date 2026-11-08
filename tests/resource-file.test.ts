import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadRuntime } from './support/page-runtime.ts'
import { resourceSchemas } from '../src/utils/resource-contract-extensions.ts'
import { matchesResourceSchema } from '../src/utils/resource-schema.ts'
const file = {
  id: 'ac230000-0000-4000-8000-000000000001',
  name: '合成.pdf',
  content_type: 'application/pdf',
  size: 100,
}

test('文件协议严格验证元信息与反馈合计，外链资料允许空文件', () => {
  assert.equal(matchesResourceSchema(resourceSchemas.ResourceFile!, file, resourceSchemas), true)
  assert.equal(
    matchesResourceSchema(resourceSchemas.ResourceFile!, { ...file, size: -1 }, resourceSchemas),
    false,
  )
  const summary = {
    content_version: 2,
    valid: 2,
    link_invalid: 1,
    outdated: 0,
    incomplete: 0,
    total: 3,
  }
  assert.equal(
    matchesResourceSchema(resourceSchemas.FeedbackSummary!, summary, resourceSchemas),
    true,
  )
  assert.equal(
    matchesResourceSchema(
      resourceSchemas.FeedbackSummary!,
      { ...summary, total: 4 },
      resourceSchemas,
    ),
    false,
  )
})

test('下载只使用签名地址，显示进度，失败可重试，离开可取消', async () => {
  let response: { success: (v: unknown) => void; fail: () => void } | undefined
  let progress: ((v: { progress: number }) => void) | undefined
  let options: Record<string, unknown> = {}
  let aborted = false
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/resource-file.ts', import.meta.url), 'utf8'),
    {
      uni: {
        downloadFile(value: typeof response & Record<string, unknown>) {
          response = value
          options = value!
          return {
            onProgressUpdate: (fn: typeof progress) => {
              progress = fn
            },
            abort() {
              aborted = true
              response?.fail()
            },
          }
        },
      },
    },
  )
  let percent = 0
  const input = { file, download_url: 'https://synthetic.invalid/signed-file' }
  const transfer = api.downloadResourceFile(input, (value: number) => {
    percent = value
  })
  progress?.({ progress: 35 })
  assert.equal(percent, 35)
  assert.equal(options.header, undefined)
  response?.success({ statusCode: 200, tempFilePath: '/synthetic-file' })
  assert.equal(await transfer.promise, '/synthetic-file')
  const cancelled = api.downloadResourceFile(input, () => {})
  cancelled.cancel()
  await assert.rejects(cancelled.promise, /下载未完成/)
  assert.equal(aborted, true)
  const expired = api.downloadResourceFile(input, () => {})
  response?.success({ statusCode: 403, tempFilePath: '/synthetic-error' })
  await assert.rejects(expired.promise, /地址已过期/)
  assert.throws(
    () =>
      api.downloadResourceFile({ ...input, download_url: 'http://invalid.test/file' }, () => {}),
    /不支持直接下载/,
  )
})

test('COS 文件写入持久目录，后续可定位，保存失败不返回临时路径', async () => {
  const localFiles = new Set<string>()
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/resource-file.ts', import.meta.url), 'utf8'),
    {
      wx: { env: { USER_DATA_PATH: 'wxfile://usr' } },
      uni: {
        getFileSystemManager: () => ({
          access(options: { path: string; success: () => void; fail: () => void }) {
            if (localFiles.has(options.path)) options.success()
            else options.fail()
          },
          saveFile(options: {
            tempFilePath: string
            filePath: string
            success: (v: { savedFilePath: string }) => void
            fail: () => void
          }) {
            if (options.tempFilePath !== 'wxfile://tmp/file') {
              options.fail()
              return
            }
            localFiles.add(options.filePath)
            options.success({ savedFilePath: options.filePath })
          },
        }),
      },
    },
  )
  assert.equal(await api.findSavedResourceFile(file), null)
  await assert.rejects(api.saveResourceFile('wxfile://tmp/missing', file), /保存失败/)
  assert.equal(await api.findSavedResourceFile(file), null)
  const savedPath = await api.saveResourceFile('wxfile://tmp/file', file)
  assert.equal(savedPath, `wxfile://usr/resource-${file.id}.pdf`)
  assert.equal(await api.findSavedResourceFile(file), savedPath)
})
