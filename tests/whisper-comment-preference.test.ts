import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setup, postId, commentId } from './support/whisper-pages-runtime.ts'
import { WhisperTestError as RequestError } from './support/whispers-runtime.ts'

const tags = { campus: 'wushan', gender: 'undisclosed', grade: 'first' }

test('评论身份：配置页保存到本机，按API与账号隔离，游客不能保存', async () => {
  const s = await setup('settings')
  s.runtime.identityMode.value = 'semi'
  s.runtime.identityTags.value = tags
  s.runtime.saveIdentity()
  assert.equal(s.preferenceStorage.size, 1)
  assert.match(s.runtime.page.notice.value, /已保存到本机/)
  const read = (owner = 'synthetic-owner') =>
    s.preference.readCommentIdentityPreference(owner, s.moduleConfig, s.nickname())
  assert.deepEqual(read().identity, { mode: 'semi', tags, dictionary_version: 4 })
  assert.deepEqual(read('another-owner').identity, { mode: 'anonymous' })
  s.config.apiBaseUrl = 'https://another.invalid/api/v1'
  assert.deepEqual(read().identity, { mode: 'anonymous' })
  const guest = await setup('settings', {}, true)
  guest.runtime.saveIdentity()
  assert.equal(guest.preferenceStorage.size, 0)
})

test('评论身份：损坏、字典换版与昵称换版降为匿名并提示，不采用待审昵称', async () => {
  const s = await setup('settings')
  const save = s.preference.saveCommentIdentityPreference
  const read = () =>
    s.preference.readCommentIdentityPreference('synthetic-owner', s.moduleConfig, s.nickname())
  save('synthetic-owner', 'named', tags, s.moduleConfig, s.nickname())
  assert.deepEqual(read().identity, { mode: 'named', nickname_version: 3 })
  s.nickname().active.nickname_version = 7
  assert.deepEqual(read().identity, { mode: 'anonymous' })
  assert.match(read().notice, /重新确认/)
  save('synthetic-owner', 'semi', tags, s.moduleConfig, s.nickname())
  s.moduleConfig.grade_dictionary.version = 5
  assert.deepEqual(read().identity, { mode: 'anonymous' })
  assert.match(read().notice, /完全匿名/)
  for (const key of s.preferenceStorage.keys()) s.preferenceStorage.set(key, '{broken')
  assert.deepEqual(read().identity, { mode: 'anonymous' })
  assert.match(read().notice, /暂不可用/)
})

test('评论身份：新回复采用已保存设置，未知结果仍用原身份与原键重试', async () => {
  const s = await setup('comment-editor', { postId })
  s.preference.saveCommentIdentityPreference(
    'synthetic-owner',
    'semi',
    tags,
    s.moduleConfig,
    s.nickname(),
  )
  await s.runtime.load()
  assert.equal(s.runtime.mode.value, 'semi')
  s.runtime.body.value = '合成沿用设置的回复'
  const original = s.defaultTransport()
  let timeout = true
  s.transport(async (input) => {
    if (input.method === 'POST' && timeout) {
      timeout = false
      throw new RequestError('合成超时', -1)
    }
    return original(input)
  })
  await s.runtime.submit()
  assert.equal(s.runtime.page.retryReady.value, true)
  s.preference.saveCommentIdentityPreference(
    'synthetic-owner',
    'named',
    tags,
    s.moduleConfig,
    s.nickname(),
  )
  await s.runtime.load()
  await s.runtime.page.retry()
  const writes = s.calls.filter((item) => item.method === 'POST')
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[0], writes[1])
  assert.deepEqual(writes[0]!.data?.identity, { mode: 'semi', tags, dictionary_version: 4 })
})

test('评论身份：编辑旧评论不采用新默认，旧昵称或字典换版不能静默替换', async () => {
  const s = await setup('comment-editor', { id: commentId, postId })
  s.preference.saveCommentIdentityPreference(
    'synthetic-owner',
    'named',
    tags,
    s.moduleConfig,
    s.nickname(),
  )
  await s.runtime.load()
  s.runtime.body.value = '合成编辑旧匿名评论'
  await s.runtime.submit()
  assert.deepEqual(s.calls.find((item) => item.method === 'PUT')!.data?.identity, {
    mode: 'anonymous',
  })
  for (const identity of [
    { mode: 'named', nickname_version: 1 },
    { mode: 'semi', tags, dictionary_version: 1 },
  ]) {
    s.setComment({ ...s.comment(), identity_input: identity })
    await s.runtime.load()
    s.runtime.body.value = '合成不能改变身份'
    const before = s.calls.filter((item) => item.method === 'PUT').length
    await s.runtime.submit()
    assert.equal(s.calls.filter((item) => item.method === 'PUT').length, before)
    assert.match(s.runtime.page.error.value, /暂不能修改/)
  }
})

test('评论身份：编辑中的新评论不能被共享字典刷新静默换版', async () => {
  const s = await setup('comment-editor', { postId })
  s.preference.saveCommentIdentityPreference(
    'synthetic-owner',
    'semi',
    tags,
    s.moduleConfig,
    s.nickname(),
  )
  await s.runtime.load()
  s.runtime.body.value = '合成保持原身份的草稿'
  s.module.config = {
    ...s.module.config,
    grade_dictionary: { version: 5, items: s.moduleConfig.grade_dictionary.items },
  }
  await s.runtime.submit()
  assert.equal(
    s.calls.some((item) => item.method === 'POST'),
    false,
  )
  assert.match(s.runtime.page.error.value, /身份已变化/)
  assert.equal(s.runtime.body.value, '合成保持原身份的草稿')
})
