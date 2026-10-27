import assert from 'node:assert/strict'
import { test } from 'node:test'
import { session } from '../src/utils/session.ts'
import { settle } from './support/page-runtime.ts'
import { WhisperTestError as RequestError } from './support/whispers-runtime.ts'
import { setup, postId, commentId } from './support/whisper-pages-runtime.ts'

test('REQ-010：未认证正常账号新建暖评不取Workspace，使用当前父帖版本与epoch，202不冒充公开', async () => {
  const s = await setup('comment-editor', { postId })
  s.workspace.verification = 'unverified'
  const r = s.runtime
  assert.equal(r.canSubmit.value, true)
  assert.equal(
    s.calls.some((x) => x.url === '/me/whispers'),
    false,
  )
  r.body.value = '  合成暖评😀  '
  await r.submit()
  const write = s.calls.find((x) => x.method === 'POST')!
  assert.equal(write.url, `/whispers/posts/${postId}/comments`)
  assert.deepEqual(write.data, {
    body: '  合成暖评😀  ',
    identity: { mode: 'anonymous' },
    expected_post_version: 8,
    expected_comments_epoch: 2,
  })
  assert.match(write.header!['Idempotency-Key']!, /^[0-9a-f-]{36}$/)
  assert.equal(r.record.value.status, 'scanning')
  assert.match(r.page.notice.value, /已受理.*扫描/)
  assert.equal(r.id.value, commentId)
})
test('REQ-010：暖评500码点可提交，超长／全空白／孤立代理项拒绝；三档版本来自当前资料', async () => {
  const s = await setup('comment-editor', { postId })
  const r = s.runtime
  for (const text of ['😀'.repeat(501), ' \n\t ', '\ud800']) {
    r.body.value = text
    await r.submit()
  }
  assert.equal(s.calls.filter((x) => x.method === 'POST').length, 0)
  r.body.value = '😀'.repeat(500)
  r.mode.value = 'named'
  await r.submit()
  assert.deepEqual(s.calls.find((x) => x.method === 'POST')!.data?.identity, {
    mode: 'named',
    nickname_version: 3,
  })
  r.body.value = '合成半匿名暖评'
  r.mode.value = 'semi'
  r.tags.value = { campus: 'baoshan', gender: 'private', grade: 'first' }
  await r.submit()
  // 校区枚举严格由正式契约决定，非法标签不发送。
  assert.equal(s.calls.filter((x) => x.method === 'PUT').length, 0)
  r.tags.value = { campus: 'wushan', gender: 'undisclosed', grade: 'first' }
  await r.submit()
  assert.deepEqual(s.calls.find((x) => x.method === 'PUT')!.data?.identity, {
    mode: 'semi',
    tags: { campus: 'wushan', gender: 'undisclosed', grade: 'first' },
    dictionary_version: 4,
  })
})
test('REQ-010：编辑先读本人暖评，不信路由父帖，跨正文重提使用独立本人版本与最新父上下文', async () => {
  const s = await setup('comment-editor', { id: commentId, postId: '不可用的路由父帖' })
  s.setComment({
    ...s.comment(),
    status: 'context_changed',
    parent_content_version: 2,
    version: 21,
  })
  s.setPublic({ ...s.publicPost(), version: 19, comments_epoch: 7, content_version: 4 })
  await s.runtime.load()
  assert.equal(s.runtime.postId.value, postId)
  s.runtime.body.value = '合成当前上下文改稿'
  await s.runtime.submit()
  const write = s.calls.find((x) => x.method === 'PUT')!
  assert.equal(write.url, `/me/whispers/comments/${commentId}`)
  assert.deepEqual(write.data, {
    body: '合成当前上下文改稿',
    identity: { mode: 'anonymous' },
    expected_version: 21,
    expected_post_version: 19,
    expected_comments_epoch: 7,
  })
  assert.equal(s.runtime.record.value.status, 'scanning')
})
test('REQ-010/018：父帖关闭／删除、隐私屏障与缺动作不能提交，安全候选不复制为草稿或恢复旧父帖', async () => {
  const s = await setup('comment-editor', { id: commentId, postId })
  s.setPublic({ ...s.publicPost(), comments_open: false })
  await s.runtime.load()
  s.runtime.body.value = '合成不得提交'
  await s.runtime.submit()
  assert.equal(
    s.calls.some((x) => x.method === 'PUT'),
    false,
  )
  s.setComment({
    ...s.comment(),
    post_id: null,
    status: 'privacy_hold',
    body: null,
    identity_input: null,
    recovery_body: '合成安全候选',
    allowed_actions: ['whisperCommentWithdraw'],
  })
  const before = s.calls.length
  await s.runtime.load()
  assert.equal(s.runtime.post.value, null)
  assert.equal(s.runtime.body.value, '')
  assert.equal(s.runtime.record.value.recovery_body, '合成安全候选')
  assert.equal(
    s.calls.slice(before).some((x) => x.url.startsWith('/whispers/posts/')),
    false,
  )
  await s.runtime.submit()
  assert.equal(
    s.calls.some((x) => x.method === 'PUT'),
    false,
  )
  const guest = await setup('comment-editor', { postId }, true)
  guest.runtime.body.value = '合成游客输入'
  await guest.runtime.submit()
  assert.equal(guest.calls.length, 0)
})
test('REQ-010：暖评冲突清未提交文字并重读关闭状态；关系错误保持通用，429不显示受理', async () => {
  const s = await setup('comment-editor', { postId })
  const original = s.defaultTransport()
  s.transport(async (input) => {
    if (input.method === 'POST') {
      s.setPublic({ ...s.publicPost(), comments_open: false, version: 9, comments_epoch: 3 })
      throw new RequestError('合成冲突', 409, 'STATE_CONFLICT', '', 409)
    }
    return original(input)
  })
  s.runtime.body.value = '合成旧意图'
  await s.runtime.submit()
  assert.equal(s.runtime.body.value, '')
  assert.equal(s.runtime.canSubmit.value, false)
  assert.equal(s.calls.filter((x) => x.method === 'POST').length, 1)
  const forbidden = await setup('comment-editor', { postId })
  forbidden.transport(async () => {
    throw new RequestError('合成关系错误', 403, 'INTERACTION_UNAVAILABLE', '', 403)
  })
  forbidden.runtime.body.value = '合成输入'
  await forbidden.runtime.submit()
  assert.doesNotMatch(forbidden.runtime.page.error.value, /对方|拉黑|作者/)
  const limited = await setup('comment-editor', { postId })
  limited.transport(async () => {
    throw new RequestError('合成限频', 429, 'RATE_LIMITED', '', 429)
  })
  limited.runtime.body.value = '合成输入'
  await limited.runtime.submit()
  assert.match(limited.runtime.page.error.value, /频繁/)
  assert.equal(limited.runtime.page.notice.value, '')
})
test('REQ-010/018：暖评结果未知只原键原体重试，离页、同账号换会话与晚到响应清稿', async () => {
  const s = await setup('comment-editor', { postId })
  const original = s.defaultTransport()
  let fail = true
  s.transport(async (input) => {
    if (input.method === 'POST' && fail) {
      fail = false
      throw new RequestError('合成超时', -1)
    }
    return original(input)
  })
  s.runtime.body.value = '合成原稿'
  await s.runtime.submit()
  assert.equal(s.runtime.page.retryReady.value, true)
  s.runtime.body.value = '合成后改稿'
  await s.runtime.submit()
  await s.runtime.page.retry()
  const writes = s.calls.filter((x) => x.method === 'POST')
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[0], writes[1])
  let finish!: (value: unknown) => void
  s.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  s.runtime.body.value = '合成晚到改稿'
  const saving = s.runtime.submit()
  await settle()
  session.setToken('synthetic-replacement-session')
  finish(s.comment())
  await saving
  assert.equal(s.runtime.body.value, '')
  assert.equal(s.runtime.record.value, null)
  assert.equal(s.runtime.page.retryReady.value, false)
  s.hide()
  assert.equal(s.runtime.post.value, null)
})
async function hugPage() {
  const s = await setup('detail', { id: postId })
  s.setPublic({
    ...s.publicPost(),
    viewer_is_author: false,
    my_hug: { active: false, version: 4 },
    hug_count: 100,
    allowed_actions: ['whisperHugSet'],
  })
  await s.runtime.load()
  return s
}
test('REQ-010：抱抱使用目标状态、父帖版本和本人抱抱版本，采用权威总数而非本地加减', async () => {
  const s = await hugPage()
  await s.runtime.hug(true)
  assert.deepEqual(s.calls.find((x) => x.method === 'PUT')!.data, {
    active: true,
    expected_post_version: 8,
    expected_hug_version: 4,
  })
  assert.equal(s.runtime.post.value.hug_count, 6)
  assert.deepEqual(s.runtime.post.value.my_hug, { active: true, version: 5 })
  await s.runtime.hug(false)
  assert.deepEqual(s.calls.filter((x) => x.method === 'PUT')[1]!.data, {
    active: false,
    expected_post_version: 8,
    expected_hug_version: 5,
  })
  assert.equal(s.runtime.post.value.hug_count, 5)
})
test('REQ-010：自抱、游客与缺动作不发送；抱抱冲突只重读，不重新点亮取消意图', async () => {
  const self = await setup('detail', { id: postId })
  self.setPublic({
    ...self.publicPost(),
    my_hug: { active: false, version: 4 },
    allowed_actions: ['whisperHugSet'],
  })
  await self.runtime.load()
  await self.runtime.hug(true)
  assert.equal(
    self.calls.some((x) => x.method === 'PUT'),
    false,
  )
  const s = await hugPage()
  const original = s.defaultTransport()
  s.transport(async (input) => {
    if (input.method === 'PUT')
      throw new RequestError('合成旧版本', 409, 'VERSION_CONFLICT', '', 409)
    return original(input)
  })
  await s.runtime.hug(true)
  assert.equal(s.calls.filter((x) => x.method === 'PUT').length, 1)
  assert.equal(s.runtime.post.value.my_hug.active, false)
  assert.equal(s.runtime.page.retryReady.value, false)
  const guest = await setup('detail', { id: postId }, true)
  guest.setPublic({
    ...guest.publicPost(),
    viewer_is_author: false,
    my_hug: null,
    allowed_actions: [],
  })
  await guest.runtime.load()
  await guest.runtime.hug(true)
  assert.equal(
    guest.calls.some((x) => x.method === 'PUT'),
    false,
  )
})
test('REQ-010/014：抱抱连点互斥、未知结果原请求重试；暖评屏蔽只携来源内容版本', async () => {
  const s = await hugPage()
  let finish!: (value: unknown) => void
  s.transport(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const first = s.runtime.hug(true)
  await settle()
  await s.runtime.hug(false)
  assert.equal(s.calls.filter((x) => x.method === 'PUT').length, 1)
  finish({ post_id: postId, hug_count: 10, my_hug: { active: true, version: 5 } })
  await first
  s.transport(async () => {
    throw new RequestError('合成超时', -1)
  })
  await s.runtime.hug(false)
  await s.runtime.page.retry()
  const writes = s.calls.filter((x) => x.method === 'PUT')
  assert.deepEqual(writes[1], writes[2])
  s.hide()
  assert.equal(s.runtime.post.value, null)
  const block = await setup('detail', { id: postId })
  const contentVersion = block.runtime.comments.value[0].content_version
  await block.runtime.block(block.runtime.comments.value[0])
  assert.deepEqual(block.calls.find((x) => x.method === 'POST')!.data, {
    source: {
      kind: 'whisper_comment',
      id: commentId,
      content_version: contentVersion,
    },
  })
})
