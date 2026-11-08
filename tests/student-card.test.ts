import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import {
  studentCardMultipart,
  assertStudentCardSize,
  assertStudentCardDimensions,
  studentCardMaxBytes,
  studentCardMaxPixels,
} from '../src/utils/student-card.ts'

test('T013：单个 file、显式图片 MIME、boundary 与二进制内容保持一致', () => {
  for (const [type, signature] of [
    ['png', [137, 80, 78, 71, 13, 10, 26, 10]],
    ['jpeg', [255, 216, 255]],
  ] as const) {
    const bytes = new Uint8Array([...signature, 0, 255, 128])
    const { body, contentType } = studentCardMultipart(bytes, type)
    const boundary = contentType.split('boundary=')[1]!
    const text = Buffer.from(body).toString('latin1')
    assert.ok(text.startsWith(`--${boundary}\r\n`))
    assert.ok(text.endsWith(`\r\n--${boundary}--\r\n`))
    assert.equal(text.match(/Content-Disposition:/g)?.length, 1)
    assert.ok(text.includes(`name="file"; filename="card.${type}"`))
    assert.ok(text.includes(`Content-Type: image/${type}\r\n\r\n`))
    const offset = text.indexOf('\r\n\r\n') + 4
    assert.deepEqual(new Uint8Array(body).slice(offset, offset + bytes.length), bytes)
  }
})

test('T013：拒绝伪装格式及 MIME 不匹配，大于 1 MiB 的文件不在客户端拦截', () => {
  assert.throws(() => studentCardMultipart(new Uint8Array([1, 2, 3]), 'png'), /真实/)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  assert.throws(() => studentCardMultipart(new Uint8Array(signature), 'jpeg'), /真实/)
  const bytes = new Uint8Array(1024 * 1024 + 1)
  bytes.set(signature)
  const { body } = studentCardMultipart(bytes, 'png')
  assert.ok(body.byteLength > bytes.length)
  const encoded = new Uint8Array(body)
  const offset = Buffer.from(body).indexOf('\r\n\r\n') + 4
  assert.deepEqual(encoded.slice(offset, offset + bytes.length), bytes)
})

test('T013：真实上传适配发送二进制 multipart、幂等键，兼容跨上下文二进制且准备期间会话变化拒绝发送', async () => {
  let epoch = 1
  const sent: Record<string, unknown>[] = []
  const bytes = runInNewContext(
    'new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer',
  ) as ArrayBuffer
  assert.equal(bytes instanceof ArrayBuffer, false)
  let changeDuringRead = false
  let fileSize = bytes.byteLength
  let imageWidth = 2
  let imageHeight = 2
  let reads = 0
  let compressions = 0
  let rejectCompression = false
  let rejectNormalization = false
  class RequestError extends Error {
    readonly error_code: string
    constructor(error_code: string) {
      super(error_code)
      this.error_code = error_code
    }
  }
  Object.assign(globalThis, {
    __studentCardApi: {
      request: async (options: Record<string, unknown>) => {
        sent.push(options)
        if (rejectNormalization) {
          rejectNormalization = false
          throw new RequestError('STUDENT_CARD_NORMALIZED_IMAGE_TOO_LARGE')
        }
      },
      RequestError,
      session: { getEpoch: () => epoch, getToken: () => 'synthetic-token' },
      studentCardMultipart,
      assertStudentCardSize,
      assertStudentCardDimensions,
      studentCardMaxBytes,
      studentCardMaxPixels,
    },
    uni: {
      getFileInfo: async ({ filePath }: { filePath: string }) => ({
        size: filePath === 'synthetic-path' ? fileSize : bytes.byteLength,
      }),
      getImageInfo: async ({ src }: { src: string }) => ({
        type: 'png',
        width: src === 'synthetic-path' ? imageWidth : 2,
        height: src === 'synthetic-path' ? imageHeight : 2,
      }),
      compressImage: (options: {
        src: string
        compressedWidth: number
        compressedHeight: number
        success: (value: { tempFilePath: string }) => void
        fail: () => void
      }) => {
        compressions++
        assert.equal(options.src, 'synthetic-path')
        assert.ok(options.compressedWidth * options.compressedHeight <= studentCardMaxPixels)
        if (rejectCompression) options.fail()
        else options.success({ tempFilePath: 'compressed-path' })
      },
      getFileSystemManager: () => ({
        readFile: (options: { success: (value: { data: ArrayBuffer }) => void }) => {
          reads++
          if (changeDuringRead) epoch++
          options.success({ data: bytes })
        },
      }),
    },
  })
  try {
    const source = readFileSync(
      new URL('../src/api/verification.ts', import.meta.url),
      'utf8',
    ).replace(/^import\s[\s\S]*?from\s+'[^']+'\n/gm, '')
    const compiled = ts.transpileModule(
      `const { request, RequestError, session, studentCardMultipart, assertStudentCardSize, assertStudentCardDimensions, studentCardMaxBytes, studentCardMaxPixels } = globalThis.__studentCardApi;\n${source}`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
    ).outputText
    const { uploadStudentCard } = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    )
    await uploadStudentCard('synthetic-path', 'synthetic-key')
    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.url, '/me/student-card-assets')
    assert.equal(sent[0]!.method, 'POST')
    assert.equal(sent[0]!.timeout, 45_000)
    assert.ok(sent[0]!.data instanceof ArrayBuffer)
    const headers = sent[0]!.header as Record<string, string>
    assert.match(headers['Content-Type']!, /^multipart\/form-data; boundary=/)
    assert.equal(headers['Idempotency-Key'], 'synthetic-key')
    assert.equal(sent[0]!.filePath, undefined)
    assert.equal(compressions, 0)
    fileSize = studentCardMaxBytes + 1
    imageWidth = 4032
    imageHeight = 3024
    await uploadStudentCard('synthetic-path', 'synthetic-large')
    assert.equal(compressions, 1)
    assert.equal(reads, 2)
    assert.equal(sent.length, 2)
    fileSize = bytes.byteLength
    rejectCompression = true
    await uploadStudentCard('synthetic-path', 'synthetic-png', {
      resize: async (path: string, width: number, height: number) => {
        assert.equal(path, 'synthetic-path')
        assert.ok(width > height && width * height <= studentCardMaxPixels)
        return 'canvas-path'
      },
      isCurrent: () => true,
    })
    assert.equal(compressions, 2)
    assert.equal(sent.length, 3)
    imageWidth = 2000
    imageHeight = 1500
    rejectCompression = false
    rejectNormalization = true
    await uploadStudentCard('synthetic-path', 'synthetic-normalized')
    assert.equal(compressions, 3)
    assert.equal(sent.length, 5)
    for (const options of sent.slice(-2)) {
      assert.equal(
        (options.header as Record<string, string>)['Idempotency-Key'],
        'synthetic-normalized',
      )
    }
    changeDuringRead = true
    await assert.rejects(uploadStudentCard('synthetic-path', 'synthetic-key'), /会话已变化/)
    assert.equal(sent.length, 5)
  } finally {
    Reflect.deleteProperty(globalThis, 'uni')
    Reflect.deleteProperty(globalThis, '__studentCardApi')
  }
})

test('学生卡上传文件遵守字节预算，原图尺寸校验允许高分辨率', () => {
  assert.doesNotThrow(() => assertStudentCardSize(4 * 1024 * 1024))
  assert.throws(() => assertStudentCardSize(4 * 1024 * 1024 + 1), /4 MiB/)
  assert.throws(() => assertStudentCardSize(Number.NaN), /无法确认/)
  assert.doesNotThrow(() => assertStudentCardDimensions(2000, 2000))
  assert.doesNotThrow(() => assertStudentCardDimensions(4032, 3024))
  assert.throws(() => assertStudentCardDimensions(0, 2000), /无法确认/)
})
