import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadRuntime } from '../tests/support/page-runtime.ts'
import { whisperOperations, whisperSchemas } from '../src/utils/whispers-contract-extensions.ts'
import { matchesSchema } from '../src/utils/whispers-schema.ts'
import { contentSearchParams } from '../src/utils/content-search.ts'
import { resourceSchemas } from '../src/utils/resource-contract-extensions.ts'
import { resourceOperations } from '../src/utils/resource-contract.ts'
import {
  matchesResourceSchema,
  normalizeResourceText,
  resourceId,
  utf8Length,
} from '../src/utils/resource-schema.ts'

// 仅消费当前联调夹具，不输出会话，不从生产环境发现或创建账号。
const fixture = JSON.parse(
  readFileSync(process.argv[2] ?? '/tmp/liyuanci-content-smoke/fixture.json', 'utf8'),
) as { actors: { id: string; token: string }[]; wishes: string[] }
const base = 'http://127.0.0.1:18080/api/v1'
let actor = 1
let epoch = 1
const session = { getToken: () => fixture.actors[actor]!.token, getEpoch: () => epoch }
const uni = {
  $emit: () => {},
  request: (options: {
    url: string
    method?: string
    header?: Record<string, string>
    data?: unknown
    success: (value: unknown) => void
    fail: () => void
  }) => {
    void fetch(options.url, {
      method: options.method ?? 'GET',
      headers: options.header,
      body: options.data === undefined ? undefined : JSON.stringify(options.data),
    })
      .then(async (response) =>
        options.success({
          statusCode: response.status,
          data: response.status === 204 ? undefined : await response.json(),
          header: Object.fromEntries(response.headers),
        }),
      )
      .catch(options.fail)
  },
}
const source = (file: string) => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
const transport = await loadRuntime(source('utils/request.ts'), {
  config: { useMock: false, isDev: true, apiBaseUrl: base },
  session,
  uni,
})
const common = { request: transport.request, RequestError: transport.RequestError, session }
const wishes = await loadRuntime(source('api/wishes.ts'), common)
const interactions = await loadRuntime(source('api/interactions.ts'), common)
const whispers = await loadRuntime(source('api/whispers.ts'), {
  ...common,
  whisperOperations,
  whisperSchemas,
  matchesSchema,
  contentSearchParams,
})
const resources = await loadRuntime(source('api/resources.ts'), {
  ...common,
  resourceOperations,
  resourceSchemas,
  matchesResourceSchema,
  normalizeResourceText,
  resourceId,
  utf8Length,
})
const wish = await wishes.getWish(fixture.wishes[0])
assert.equal(wish.current_state, 'published')
assert.ok(Number.isSafeInteger(wish.public.view_count))
const key = interactions.interactionKey()
const first = await interactions.recordContentView('wish', wish.id, key)
const repeated = await interactions.recordContentView('wish', wish.id, key)
assert.equal(first.view_count, repeated.view_count)
assert.equal(
  (await interactions.setFavorite('wish', wish.id, true, interactions.interactionKey())).favorited,
  true,
)
const favorites = await interactions.listFavorites('wish')
assert.ok(
  favorites.items.some(
    (item: { target_id: string; available: boolean }) =>
      item.target_id === wish.id && item.available,
  ),
)
assert.equal(
  (await interactions.setFavorite('wish', wish.id, false, interactions.interactionKey())).favorited,
  false,
)
assert.ok(Number.isSafeInteger((await interactions.notificationSummary()).unread_count))
const comments = await interactions.listWishComments(wish.id)
assert.ok(Array.isArray(comments.items))
assert.ok(Array.isArray((await interactions.listOwnWishComments(wish.id)).items))
const whisperConfig = await whispers.callWhisper('whisperConfigGet', {})
assert.equal(whisperConfig.enabled, true)
const posts = await whispers.callWhisper('whisperPostsList', { query: { limit: 5 } })
if (posts.items.length) {
  const post = await whispers.callWhisper('whisperPostGet', {
    path: { post_id: posts.items[0].id },
  })
  assert.ok(Number.isSafeInteger(post.view_count))
  await whispers.callWhisper('whisperCommentsList', { path: { post_id: post.id } })
}
const resourcePage = await resources.listResources({ limit: 5 })
if (resourcePage.items.length) {
  const resource = await resources.getResource(resourcePage.items[0].id)
  assert.ok(Number.isSafeInteger(resource.view_count))
}
actor = 0
epoch++
const own = await wishes.getWish(wish.id)
assert.equal(own.is_owner, true)
assert.ok(own.own_content.duration_days >= 1 && own.own_content.duration_days <= 90)
console.log(
  JSON.stringify({
    result: 'passed',
    wish: 'read/favorite/view-dedup/comments',
    notification: 'summary',
    whisper: `strict-parser-${posts.items.length}-items`,
    resource: `strict-parser-${resourcePage.items.length}-items`,
    owner: 'identity-and-duration',
  }),
)
