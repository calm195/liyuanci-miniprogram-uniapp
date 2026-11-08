import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadRuntime } from './support/page-runtime.ts'
import { isPublicContent } from '../src/utils/story.ts'
import { matchesSchema } from '../src/utils/whispers-schema.ts'
import { whisperSchemas } from '../src/utils/whispers-contract.ts'
import { setup, sample } from './support/whisper-pages-runtime.ts'

test('悄悄话关键词及排序绑定分页，切换排序重新请求首页', async () => {
  const page = await setup('index')
  const original = page.defaultTransport()
  page.transport(async (input) =>
    input.url.startsWith('/whispers/posts?')
      ? { items: [page.publicPost()], next_cursor: 'feed.cursor' }
      : original(input),
  )
  await page.runtime.search('考研 & 自习', 'hot')
  const requests = () => page.calls.filter((call) => call.url.startsWith('/whispers/posts?'))
  let url = new URL(requests().at(-1)!.url, 'https://example.test')
  assert.equal(url.searchParams.get('keyword'), '考研 & 自习')
  assert.equal(url.searchParams.get('sort'), 'hot')
  assert.equal(url.searchParams.has('cursor'), false)

  await page.runtime.load(true)
  url = new URL(requests().at(-1)!.url, 'https://example.test')
  assert.equal(url.searchParams.get('cursor'), 'feed.cursor')
  assert.equal(url.searchParams.get('keyword'), '考研 & 自习')
  await page.runtime.search('', 'time')
  url = new URL(requests().at(-1)!.url, 'https://example.test')
  assert.equal(url.searchParams.get('sort'), 'time')
  assert.equal(url.searchParams.has('keyword'), false)
  assert.equal(url.searchParams.has('cursor'), false)
})

test('热点榜保持服务端顺序，映射详情路由并拒绝过量结果', async () => {
  const urls: string[] = []
  const wish = {
    id: 'wish-one',
    title: '公开心愿',
    body: '公开正文',
    content_version: 1,
    school_related: false,
  }
  let wishes = [wish, { ...wish, id: 'wish-two' }]
  const post = sample('PublicPost')
  const { listHotContent } = await loadRuntime(
    readFileSync(new URL('../src/api/hot-content.ts', import.meta.url), 'utf8'),
    {
      request: async (input: { url: string }) => {
        urls.push(input.url)
        return { items: input.url.endsWith('=wish') ? wishes : [post] }
      },
      isPublicContent,
      matchesSchema,
      whisperSchemas,
      RequestError: Error,
    },
  )
  assert.deepEqual(
    (await listHotContent('wish')).map((entry: { url: string }) => entry.url),
    ['/pages/wish-detail/index?id=wish-one', '/pages/wish-detail/index?id=wish-two'],
  )
  assert.equal((await listHotContent('whisper'))[0].url, '/pages/whispers/detail?id=' + post.id)
  wishes = Array.from({ length: 11 }, () => wish)
  await assert.rejects(listHotContent('wish'), /格式/)
  assert.deepEqual(urls, [
    '/content/hot?kind=wish',
    '/content/hot?kind=whisper',
    '/content/hot?kind=wish',
  ])
})
