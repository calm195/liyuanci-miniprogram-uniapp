import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import { defineStore, createPinia, setActivePinia } from 'pinia'
import { session } from '../src/utils/session.ts'
import * as content from '../src/utils/whisper-content.ts'
import { campuses, genders } from '../src/types/wish.ts'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'
import { whispersRuntime, WhisperTestError as RequestError } from './support/whispers-runtime.ts'
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/whispers.json', import.meta.url), 'utf8'),
) as { fixtures: { schema: string; valid: boolean; body: unknown }[] }
function sample(schema: string) {
  return structuredClone(
    fixture.fixtures.find((item) => item.schema === schema && item.valid)!.body,
  ) as Record<string, unknown>
}
const postId = '6c500000-0000-4000-8000-000000000001'
const commentId = '6c500000-0000-4000-8000-000000000002'
type Input = {
  url: string
  method: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}
async function setup(name: string, query: Record<string, string> = {}, guest = false) {
  setActivePinia(createPinia())
  if (guest) session.clear()
  else session.setToken('synthetic-whisper-pages')
  const user = reactive({ user: guest ? null : { id: 'synthetic-owner' }, validated: true })
  const calls: Input[] = []
  const config = { useMock: false }
  const moduleConfig = {
    ...sample('ModuleConfig'),
    enabled: true,
    semi_available: true,
    grade_dictionary: { version: 4, items: [{ code: 'first', label: '合成年级' }] },
    report_types: [{ code: 'unsafe', label: '合成举报类型' }],
  }
  const workspace = {
    ...sample('Workspace'),
    verification: 'verified',
    allowed_actions: ['whisperPostCreate', 'interactionBlockCreate'],
  }
  let owner = {
    ...sample('OwnerPost'),
    id: postId,
    version: 8,
    content_version: 3,
    status: 'draft',
    body: '合成旧正文',
    identity_input: { mode: 'anonymous' },
    allowed_actions: [
      'whisperPostUpdate',
      'whisperPostSubmit',
      'whisperPostWithdraw',
      'whisperCommentsSetting',
    ],
  }
  let publicPost = {
    ...sample('PublicPost'),
    id: postId,
    version: 8,
    content_version: 3,
    comments_epoch: 2,
    viewer_is_author: true,
    allowed_actions: ['whisperReportCreate', 'interactionBlockCreate'],
  }
  let nickname = {
    ...sample('NicknameState'),
    version: 5,
    active: { nickname_version: 3, label: '合成旧昵称' },
    candidate: {
      nickname_version: 4,
      label: '合成待审昵称',
      status: 'review_pending',
      review_result: null,
    },
    allowed_actions: ['whisperNicknameSet'],
  }
  const comment = {
    ...sample('PublicComment'),
    id: commentId,
    post_id: postId,
    parent_content_version: 3,
    allowed_actions: ['whisperReportCreate', 'interactionBlockCreate'],
  }
  let transport: (input: Input) => Promise<unknown> = async (input) => {
    const path = input.url.split('?')[0]
    if (path === '/whispers/config') return structuredClone(moduleConfig)
    if (path === '/me/whispers') return structuredClone(workspace)
    if (path === '/me/whispers/nickname') {
      if (input.method === 'PUT')
        nickname = {
          ...nickname,
          version: nickname.version + 1,
          candidate: { ...nickname.candidate, label: String(input.data?.label) },
        }
      return structuredClone(nickname)
    }
    if (path === '/me/whispers/posts' && input.method === 'POST') {
      owner = {
        ...owner,
        version: owner.version + 1,
        body: String(input.data?.body),
        identity_input: input.data?.identity as { mode: string },
      }
      return structuredClone(owner)
    }
    if (path === `/me/whispers/posts/${postId}`) {
      if (input.method === 'PUT')
        owner = {
          ...owner,
          version: owner.version + 1,
          body: String(input.data?.body),
          identity_input: input.data?.identity as { mode: string },
        }
      return structuredClone(owner)
    }
    if (path === `/me/whispers/posts/${postId}/submit`) {
      owner = { ...owner, version: owner.version + 1, status: 'scanning' }
      return structuredClone(owner)
    }
    if (path === `/me/whispers/posts/${postId}/withdraw`) {
      owner = { ...owner, version: owner.version + 1, status: 'withdrawn' }
      return structuredClone(owner)
    }
    if (path === `/me/whispers/posts/${postId}/comments-setting`) {
      owner = {
        ...owner,
        version: owner.version + 1,
        comments_open: input.data?.comments_open,
      } as typeof owner
      return structuredClone(owner)
    }
    if (path === '/whispers/posts')
      return { items: [structuredClone(publicPost)], next_cursor: null }
    if (path === `/whispers/posts/${postId}`) return structuredClone(publicPost)
    if (path === `/whispers/posts/${postId}/comments`)
      return { items: [structuredClone(comment)], next_cursor: null }
    if (path === '/me/whispers/posts') return { items: [structuredClone(owner)], next_cursor: null }
    if (path === '/me/whispers/comments')
      return {
        items: [
          {
            ...sample('OwnerComment'),
            id: commentId,
            post_id: postId,
            status: 'context_changed',
            body: null,
            recovery_body: null,
          },
        ],
        next_cursor: null,
      }
    if (path === '/whispers/help')
      return { status: 'unavailable', version: null, verified_at: null, items: [] }
    if (path === '/whispers/reports') return { id: postId, status: 'pending' }
    if (path === '/me/interaction-blocks') return { accepted: true }
    throw new Error('未配置的合成路径：' + input.url)
  }
  const api = await whispersRuntime(async (options) => {
    const input = options as Input
    calls.push(structuredClone(input))
    return transport(input)
  }, session)
  const hooks: Record<string, ((query?: Record<string, string>) => unknown)[]> = {
    show: [],
    hide: [],
    unload: [],
    load: [],
  }
  const platform = {
    onShow: (fn: () => unknown) => hooks.show!.push(fn),
    onHide: (fn: () => unknown) => hooks.hide!.push(fn),
    onUnload: (fn: () => unknown) => hooks.unload!.push(fn),
    onLoad: (fn: () => unknown) => hooks.load!.push(fn),
  }
  const storeRuntime = await loadRuntime(
    readFileSync(new URL('../src/stores/whispers.ts', import.meta.url), 'utf8'),
    { defineStore, session, useUserStore: () => user, callWhisper: api.callWhisper },
  )
  const module = storeRuntime.useWhispersStore()
  const controller = await loadRuntime(
    readFileSync(new URL('../src/composables/use-whisper-page.ts', import.meta.url), 'utf8'),
    {
      ...platform,
      config,
      session,
      useUserStore: () => user,
      RequestError,
      createWhisperScope: api.createWhisperScope,
    },
  )
  const feed = await loadRuntime(
    readFileSync(new URL('../src/composables/use-whisper-feed.ts', import.meta.url), 'utf8'),
    {
      ...platform,
      callWhisper: api.callWhisper,
      useWhispersStore: () => module,
      useWhisperPage: controller.useWhisperPage,
      mergeWhisperPage: content.mergeWhisperPage,
    },
  )
  const exports: Record<string, string> = {
    editor:
      'id,record,body,mode,tags,nickname,identityNotice,canSave,changed,load,save,submit,withdraw,commentsSetting,page',
    nickname: 'state,label,canSave,load,save,page',
    mine: 'tab,posts,comments,cursor,ready,load,switchTab,withdraw,page',
    detail: 'post,comments,cursor,commentsError,load,block,page',
    help: 'directory,load,page',
    report: 'target,typeCode,load,submit,page',
    index: 'items,cursor,ready,busy,error,load',
  }
  const source =
    pageScript(new URL(`../src/pages/whispers/${name}.vue`, import.meta.url)) +
    `\nexport { ${exports[name]} }`
  const runtime = await loadRuntime(source, {
    ...platform,
    ...api,
    ...content,

    session,
    RequestError,
    useWhispersStore: () => module,
    useWhisperPage: controller.useWhisperPage,
    useWhisperFeed: feed.useWhisperFeed,
  })
  for (const fn of hooks.load!) fn(query)
  for (const fn of hooks.show!) fn()
  await settle()
  return {
    runtime,
    calls,
    user,
    module,
    moduleConfig,
    workspace,
    config,
    owner: () => owner,
    publicPost: () => publicPost,
    nickname: () => nickname,
    setOwner: (value: typeof owner) => {
      owner = value
    },
    setPublic: (value: Record<string, unknown>) => {
      publicPost = value as typeof publicPost
    },
    transport: (fn: typeof transport) => {
      transport = fn
    },
    defaultTransport: () => transport,
    show: async () => {
      for (const fn of hooks.show!) fn()
      await settle()
    },
    hide: () => {
      for (const fn of hooks.hide!) fn()
    },
    unload: () => {
      for (const fn of hooks.unload!) fn()
    },
  }
}

test('REQ-009：保存只创建草稿，提交单独授权，更新取本人版本，正文不隐式trim', async () => {
  const s = await setup('editor')
  const r = s.runtime
  r.body.value = '  合成😀正文  '
  await r.save()
  assert.equal(s.calls.filter((x) => x.method !== 'GET').length, 1)
  assert.equal(r.record.value.status, 'draft')
  assert.match(r.page.notice.value, /尚未提交/)
  const save = s.calls.find((x) => x.method === 'POST')!
  assert.equal(save.data?.body, '  合成😀正文  ')
  r.body.value = '修改后未保存'
  await r.submit()
  assert.equal(s.calls.filter((x) => x.url.endsWith('/submit')).length, 0)
  await r.save()
  const update = s.calls.find((x) => x.method === 'PUT')!
  assert.equal(update.data?.expected_version, 9)
  await r.submit()
  assert.equal(r.record.value.status, 'scanning')
  assert.match(r.page.notice.value, /扫描中/)
  assert.equal(s.calls.find((x) => x.url.endsWith('/submit'))!.data?.expected_version, 10)
})
test('REQ-009：500码点通过，501／全空白／孤立代理项不发送；游客与未授权不发帖', async () => {
  const s = await setup('editor')
  const r = s.runtime
  for (const text of ['😀'.repeat(501), '  \n ', '\ud800']) {
    r.body.value = text
    await r.save()
  }
  assert.equal(s.calls.filter((x) => x.method !== 'GET').length, 0)
  r.body.value = '😀'.repeat(500)
  await r.save()
  assert.equal(r.record.value.body.length, 1000)
  const guest = await setup('editor', {}, true)
  assert.equal(guest.runtime.canSave.value, false)
  const restricted = await setup('editor')
  restricted.workspace.allowed_actions = []
  await restricted.runtime.load()
  restricted.runtime.body.value = '不该提交'
  await restricted.runtime.save()
  assert.equal(restricted.calls.filter((x) => x.method !== 'GET').length, 0)
})
test('REQ-009：三档身份只用受控版本，named使用active而非candidate，字典缺失禁止semi', async () => {
  const s = await setup('editor')
  const r = s.runtime
  r.body.value = '合成正文'
  r.mode.value = 'named'
  await r.save()
  assert.deepEqual(s.calls.find((x) => x.method === 'POST')!.data?.identity, {
    mode: 'named',
    nickname_version: 3,
  })
  r.mode.value = 'semi'
  r.tags.value = { campus: 'university_town', gender: 'undisclosed', grade: 'first' }
  await r.save()
  assert.deepEqual(s.calls.find((x) => x.method === 'PUT')!.data?.identity, {
    mode: 'semi',
    tags: { campus: 'university_town', gender: 'undisclosed', grade: 'first' },
    dictionary_version: 4,
  })
  s.moduleConfig.semi_available = false
  await r.load()
  r.mode.value = 'semi'
  r.body.value = '合成正文'
  await r.save()
  assert.equal(s.calls.filter((x) => x.method !== 'GET').length, 2)
  assert.match(r.page.error.value, /年级/)
})
test('REQ-009：隐私屏障清正文与编辑，撤回／开关使用最新资源版本，撤回不会自动重提', async () => {
  const s = await setup('editor', { id: postId })
  const r = s.runtime
  await r.commentsSetting()
  assert.equal(s.calls.find((x) => x.url.endsWith('/comments-setting'))!.data?.expected_version, 8)
  await r.withdraw()
  assert.equal(r.record.value.status, 'withdrawn')
  assert.equal(s.calls.filter((x) => x.url.endsWith('/submit')).length, 0)
  s.setOwner({
    ...s.owner(),
    status: 'privacy_hold',
    body: null,
    identity_input: null,
    allowed_actions: ['whisperPostWithdraw'],
  } as unknown as ReturnType<typeof s.owner>)
  await r.load()
  assert.equal(r.body.value, '')
  assert.equal(r.canSave.value, false)
  await r.save()
  assert.equal(
    s.calls.filter((x) => x.method === 'PUT' && !x.url.endsWith('comments-setting')).length,
    0,
  )
})
test('REQ-009/018：结果未知原键原体重试，不确认成功；离页与同账号换会话清输入和晚到结果', async () => {
  const s = await setup('editor')
  const r = s.runtime
  const original = s.defaultTransport()
  let fail = true
  s.transport(async (input) => {
    if (input.method === 'POST' && fail) throw new RequestError('合成超时', -1)
    return original(input)
  })
  r.body.value = '合成待确认正文'
  await r.save()
  assert.equal(r.page.retryReady.value, true)
  assert.equal(r.record.value, null)
  r.body.value = '被程序改变的表单'
  await r.save()
  assert.equal(s.calls.filter((x) => x.method === 'POST').length, 1)
  fail = false
  await r.page.retry()
  const writes = s.calls.filter((x) => x.method === 'POST')
  assert.deepEqual(writes[0], writes[1])
  assert.equal(r.body.value, '合成待确认正文')
  let done: (value: unknown) => void = () => {}
  s.transport(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  const pending = r.load()
  await settle()
  s.hide()
  done(sample('ModuleConfig'))
  await pending
  assert.equal(r.body.value, '')
  assert.equal(r.record.value, null)
  await s.show()
  session.setToken('synthetic-same-account-new-token')
  assert.equal(r.body.value, '')
  assert.equal(r.record.value, null)
})
test('REQ-009：版本冲突刷新当前状态，受限后不能沿用旧正文重新保存', async () => {
  const s = await setup('editor', { id: postId })
  const r = s.runtime
  const original = s.defaultTransport()
  s.transport(async (input) => {
    if (input.method === 'PUT') {
      s.setOwner({
        ...s.owner(),
        status: 'restricted',
        body: null,
        identity_input: null,
        allowed_actions: ['whisperPostWithdraw'],
      } as unknown as ReturnType<typeof s.owner>)
      throw new RequestError('合成冲突', 409, 'VERSION_CONFLICT', '', 409)
    }
    return original(input)
  })
  r.body.value = '并发改稿'
  await r.save()
  assert.equal(r.body.value, '')
  assert.equal(r.record.value.status, 'restricted')
  assert.equal(r.canSave.value, false)
  await r.save()
  assert.equal(s.calls.filter((x) => x.method === 'PUT').length, 1)
})
test('REQ-009：昵称候选独立展示，提交使用NicknameState版本，旧active不被候选替换', async () => {
  const s = await setup('nickname')
  const r = s.runtime
  r.label.value = '新合成昵称'
  await r.save()
  assert.deepEqual(s.calls.find((x) => x.method === 'PUT')!.data, {
    label: '新合成昵称',
    expected_version: 5,
  })
  assert.equal(r.state.value.active.label, '合成旧昵称')
  assert.equal(r.state.value.candidate.label, '新合成昵称')
  assert.equal(r.label.value, '')
  r.label.value = '一'
  await r.save()
  assert.equal(s.calls.filter((x) => x.method === 'PUT').length, 1)
  s.hide()
  assert.equal(r.state.value, null)
  assert.equal(r.label.value, '')
})
test('REQ-009：公开空页保留游标可继续、跨页去重，循环游标停止，停用不展示入口资料', async () => {
  const s = await setup('index', {}, true)
  const r = s.runtime
  const original = s.defaultTransport()
  let count = 0
  s.transport(async (input) =>
    input.url.startsWith('/whispers/posts?')
      ? ++count === 1
        ? { items: [], next_cursor: 'a/b' }
        : { items: [s.publicPost(), s.publicPost()], next_cursor: 'a/b' }
      : original(input),
  )
  await r.load()
  assert.equal(r.items.value.length, 0)
  assert.equal(r.cursor.value, 'a/b')
  await r.load(true)
  assert.equal(r.items.value.length, 0)
  assert.equal(r.cursor.value, null)
  assert.match(r.error.value, /游标/)
  s.moduleConfig.enabled = false
  await r.load()
  assert.equal(r.ready.value, false)
  assert.match(r.error.value, /尚未开放/)
})
test('REQ-009/010：详情按父正文读取公开暖评，关闭保留只读；父版本变化或404清旧串', async () => {
  const s = await setup('detail', { id: postId })
  const r = s.runtime
  assert.equal(r.comments.value.length, 1)
  s.setPublic({ ...s.publicPost(), comments_open: false })
  await r.load()
  assert.equal(r.comments.value.length, 1)
  assert.equal(r.post.value.comments_open, false)
  r.cursor.value = 'next'
  s.setPublic({ ...s.publicPost(), version: 9, comments_epoch: 3 })
  await r.load(true)
  assert.equal(r.post.value, null)
  assert.deepEqual(r.comments.value, [])
  s.transport(async () => {
    throw new RequestError('合成下线', 404, 'NOT_FOUND', '', 404)
  })
  await r.load()
  assert.equal(r.post.value, null)
})
test('REQ-014：匿名屏蔽只提交来源内容版本，成功清正文，不取得作者或block_id映射', async () => {
  const s = await setup('detail', { id: postId })
  await s.runtime.block()
  assert.ok(s.calls.find((x) => x.method === 'POST'))
  assert.deepEqual(s.calls.find((x) => x.method === 'POST')!.data, {
    source: { kind: 'whisper_post', id: postId, content_version: 3 },
  })
  assert.equal(s.runtime.post.value, null)
  assert.match(s.runtime.page.notice.value, /已受理/)
})
test('REQ-009/018：我的帖子和评论切页隔离，隐私记录不回显原文，仅显示安全候选', async () => {
  const s = await setup('mine')
  const r = s.runtime
  assert.equal(r.posts.value.length, 1)
  await r.switchTab('comments')
  assert.equal(r.posts.value.length, 0)
  assert.equal(r.comments.value[0].status, 'context_changed')
  const original = s.defaultTransport()
  s.transport(async (input) =>
    input.url.startsWith('/me/whispers/comments?')
      ? {
          items: [
            {
              ...sample('OwnerComment'),
              id: commentId,
              status: 'privacy_hold',
              post_id: null,
              body: null,
              identity_input: null,
              recovery_body: '已脱敏合成候选',
              allowed_actions: [],
            },
          ],
          next_cursor: null,
        }
      : original(input),
  )
  await r.load()
  assert.equal(r.comments.value[0].body, null)
  assert.equal(r.comments.value[0].post_id, null)
  assert.equal(r.comments.value[0].recovery_body, '已脱敏合成候选')
  session.setToken('synthetic-new-session')
  assert.deepEqual(r.comments.value, [])
  assert.deepEqual(r.posts.value, [])
})
test('REQ-011：公共解忧无需登录，资料缺失保持不可用，不把本人关怀卡当公共目录', async () => {
  const s = await setup('help', {}, true)
  assert.equal(s.runtime.directory.value.status, 'unavailable')
  assert.equal(
    s.calls.some((x) => x.url.startsWith('/me/')),
    false,
  )
  const source = readFileSync(new URL('../src/pages/whispers/help.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b1[0-9]{10}\b/)
})
test('REQ-014：举报来源发送前重验，内容版本取当前投影，类型来自配置；失效不提交', async () => {
  const s = await setup('report', { id: postId, kind: 'whisper_post' })
  const r = s.runtime
  r.typeCode.value = 'unsafe'
  s.setPublic({ ...s.publicPost(), content_version: 4 })
  await r.submit()
  assert.ok(
    s.calls.find((x) => x.method === 'POST'),
    r.page.error.value,
  )
  assert.deepEqual(s.calls.find((x) => x.method === 'POST')!.data, {
    source: { kind: 'whisper_post', id: postId, content_version: 4 },
    type_code: 'unsafe',
  })
  const c = await setup('report', { id: commentId, kind: 'whisper_comment', postId })
  c.runtime.typeCode.value = 'unsafe'
  await c.runtime.submit()
  assert.equal(c.calls.filter((x) => x.method === 'POST').length, 1)
  c.transport(async () => {
    throw new RequestError('不可见', 404, 'NOT_FOUND', '', 404)
  })
  await c.runtime.submit()
  assert.equal(c.calls.filter((x) => x.method === 'POST').length, 1)
})
test('REQ-009：身份选择组件关闭未就绪档位，半匿名校区不包含不限，不推断年级或个人资料', async () => {
  const props = reactive({
    mode: 'anonymous',
    tags: { campus: '', gender: '', grade: '' },
    config: null,
    nickname: null,
    disabled: false,
  }) as Record<string, unknown>
  const events: unknown[][] = []
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/WhisperIdentity.vue', import.meta.url)) +
      '\nexport { choose,pick,preview,semi,identityCampuses }',
    {
      campuses,
      genders,
      semiReady: content.semiReady,
      defineProps: () => props,
      defineEmits:
        () =>
        (...args: unknown[]) =>
          events.push(args),
    },
  )
  runtime.choose('semi')
  runtime.choose('named')
  assert.equal(events.length, 0)
  runtime.choose('anonymous')
  assert.deepEqual(events[0], ['update:mode', 'anonymous'])
  assert.ok(runtime.identityCampuses.every((item: { value: string }) => item.value !== 'any'))
  assert.throws(() =>
    content.identityFor(
      'semi',
      { campus: '', gender: '', grade: 'first' },
      {
        ...sample('ModuleConfig'),
        enabled: true,
        semi_available: true,
        grade_dictionary: { version: 1, items: [{ code: 'first', label: '合成' }] },
      } as never,
      null,
    ),
  )
  assert.match(runtime.preview.value, /跨帖/)
})
test('REQ-009/018：所有树洞页面注册并使用可见性边界，无正文持久化、主页跳转或语音分享入口', () => {
  const pages = JSON.parse(readFileSync(new URL('../src/pages.json', import.meta.url), 'utf8'))
    .pages as { path: string }[]
  for (const name of ['index', 'detail', 'editor', 'nickname', 'mine', 'report', 'help']) {
    assert.ok(pages.some((item) => item.path === 'pages/whispers/' + name))
    const source = readFileSync(
      new URL(`../src/pages/whispers/${name}.vue`, import.meta.url),
      'utf8',
    )
    assert.match(source, /AppPage/)
    assert.doesNotMatch(
      source,
      /setStorage|localStorage|v-html|rich-text|public-profile|onShareAppMessage|RecorderManager/,
    )
  }
})
