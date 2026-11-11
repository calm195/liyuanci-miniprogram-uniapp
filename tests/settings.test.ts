import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { computed, reactive, ref } from 'vue'
import { matchmakingID, matchmakingMbtis } from '../src/utils/matchmaking.ts'
import type { UserInfo } from '../src/types/api.ts'
import { whispersRuntime, WhisperTestError as RequestError } from './support/whispers-runtime.ts'
import { session as realSession } from '../src/utils/session.ts'
import { loadRuntime, pageScript, settle, profileDraftStore } from './support/page-runtime.ts'
const actor = {
  id: 'synthetic-owner',
  version: 19,
  nickname: '合成昵称',
  mbti: 'INFP',
  verification: 'unverified' as const,
  hide_identity_tags: true,
  allowed_actions: ['putMeProfile'],
}
type Input = {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
  uploadFormData?: Record<string, string>
  filePath?: string
}
const settingsPage = new URL('../src/pages/settings/index.vue', import.meta.url)
const blacklistPage = new URL('../src/pages/blacklist/index.vue', import.meta.url)

async function setup(
  query: Record<string, string> = {},
  useRealSession = false,
  page = settingsPage,
) {
  if (useRealSession) realSession.setToken('synthetic-settings-token')
  let epoch = 1
  let token = 'synthetic-token'
  const user = reactive({
    user: structuredClone(actor) as UserInfo | null,
    validated: true,
    refresh: async () => {},
    acceptAvatarProfile(result: UserInfo) {
      this.user = result
      return result
    },
  })
  const hooks: Record<string, (query?: Record<string, string>) => unknown> = {}
  const calls: Input[] = []
  const workspace = {
    server_now: '2026-10-27T04:00:00Z',
    verification: 'unverified',
    write_restricted: false,
    allowed_actions: ['interactionBlockCreate'],
  }
  let transport: (input: Input) => Promise<unknown> = async (input) => {
    if (input.url === '/me/whispers') return structuredClone(workspace)
    if (input.url.startsWith('/me/interaction-blocks?'))
      return {
        items: [
          {
            block_id: '6c500000-0000-4000-8000-000000000002',
            version: 3,
            label: '已屏蔽对象',
            allowed_actions: ['interactionBlockDelete'],
          },
        ],
        next_cursor: null,
      }
    if (input.url.startsWith('/users/'))
      return {
        profile: { id: '6c500000-0000-4000-8000-000000000002', nickname: '合成对方' },
        items: [],
        next_cursor: null,
      }
    if (input.url === '/me/profile') return { ...actor, ...input.data, version: 20 }
    if (input.url === '/me/interaction-blocks') return { accepted: true }
    return undefined
  }
  const session = useRealSession ? realSession : { getEpoch: () => epoch, getToken: () => token }
  const helpers = await whispersRuntime(async (options) => {
    const input = options as Input
    calls.push(input)
    // Workspace 由正式投影独立提供，旧Me动作不再控制黑名单。
    if (input.url === '/me/whispers') return structuredClone(workspace)
    return transport(input)
  }, session)
  const api = await loadRuntime(
    readFileSync(new URL('../src/api/settings.ts', import.meta.url), 'utf8'),
    {
      callWhisper: helpers.callWhisper,
      request: async (input: Input) => {
        calls.push(input)
        return transport(input)
      },
    },
  )
  const avatarApi = await loadRuntime(
    readFileSync(new URL('../src/api/avatar.ts', import.meta.url), 'utf8'),
    {
      request: async (input: Input) => {
        calls.push(input)
        return transport(input)
      },
    },
  )
  type PickedImage = { tempFilePath: string; size: number }
  let choose:
    | {
        success: (result: { tempFiles: PickedImage[] }) => void
        fail: (failure: { errMsg: string }) => void
      }
    | undefined
  let imageType = 'png'
  let imageWidth = 256
  let imageHeight = 256
  let confirmed = true
  let delayed = false
  let modal: (() => void) | undefined
  const prompts: string[] = []
  const navigation: string[] = []
  let matchmakingReads = 0
  const savedPreferences = reactive({ age: 0 })
  const matchmakingForm = ref({ ...savedPreferences })
  const matchmakingDirty = computed(() => matchmakingForm.value.age !== savedPreferences.age)
  const matchmakingError = ref('')
  let failMatchmaking = false
  const config = { useMock: false }
  const runtime = await loadRuntime(
    pageScript(page) +
      (page === blacklistPage
        ? '\nexport { currentMe,rows,blocksReady,cursor,targetName,busy,writing,error,notice,load,act,retryWrite,retryReady,workspace }'
        : '\nexport { currentMe,nickname,hidden,busy,writing,error,notice,load,act,allowed,chooseAvatar,changeAvatar,avatarDraft,avatarPending,avatarError,activity,returnToActivity,queueSave,enrollmentYear,educationLevel,gradeOverride,selectEducation,restoreAutomaticGrade,adjustGradeNumber }'),
    {
      config,
      session: useRealSession ? realSession : { getEpoch: () => epoch, getToken: () => token },
      useUserStore: () => user,
      useProfileDraftStore: await profileDraftStore({ session, user }),
      matchmakingID,
      matchmakingMbtis,
      useMatchmakingProfile: () => ({
        page: {
          busy: ref(false),
          writing: ref(false),
          pending: ref(null),
          error: matchmakingError,
        },
        dirty: matchmakingDirty,
        form: matchmakingForm,
        save: async () => {
          if (!matchmakingDirty.value) return
          calls.push({
            url: '/matchmaking/profile',
            method: 'PUT',
            data: { ...matchmakingForm.value },
          })
          if (failMatchmaking) matchmakingError.value = '合成保存失败'
          else {
            matchmakingError.value = ''
            savedPreferences.age = matchmakingForm.value.age
          }
        },
        load: async () => {
          matchmakingReads++
        },
      }),
      ...api,
      ...avatarApi,
      ...helpers,
      RequestError,
      getWish: (id: string) => {
        const input = { url: `/wishes/${encodeURIComponent(id)}` }
        calls.push(input)
        return transport(input)
      },
      getStory: (id: string) => {
        const input = { url: `/stories/${encodeURIComponent(id)}` }
        calls.push(input)
        return transport(input)
      },
      getPublicProfile: (id: string) => {
        const input = { url: `/users/${encodeURIComponent(id)}/public-profile` }
        calls.push(input)
        return transport(input)
      },
      uni: {
        navigateBack: ({ fail }: { fail: () => void }) => fail(),
        redirectTo: ({ url }: { url: string }) => navigation.push(url),
        chooseMedia: (options: typeof choose) => {
          choose = options
        },
        getImageInfo: async () => ({ type: imageType, width: imageWidth, height: imageHeight }),
        showModal: (options: {
          content: string
          success: (result: { confirm: boolean }) => void
        }) => {
          prompts.push(options.content)
          modal = () => options.success({ confirm: confirmed })
          if (!delayed) modal()
        },
      },
      onLoad: (fn: () => unknown) => {
        hooks.load = fn
      },
      onShow: (fn: () => unknown) => {
        hooks.show = fn
      },
      onHide: (fn: () => unknown) => {
        hooks.hide = fn
      },
      onUnload: (fn: () => unknown) => {
        hooks.unload = fn
      },
    },
  )
  hooks.load?.(query)
  hooks.show()
  await settle()
  return {
    runtime,
    user,
    hooks,
    calls,
    prompts,
    navigation,
    matchmakingReads,
    failMatchmaking: () => {
      failMatchmaking = true
    },
    config,
    workspace,
    chooseImage: (image: PickedImage, type = 'png', width = 256, height = 256) => {
      imageWidth = width
      imageHeight = height
      imageType = type
      choose?.success({ tempFiles: [image] })
    },
    cancelImage: () => choose?.fail({ errMsg: 'chooseMedia:fail cancel' }),
    transport: (fn: typeof transport) => {
      transport = fn
    },
    epoch: () => {
      epoch++
    },
    noToken: () => {
      token = ''
    },
    cancel: () => {
      confirmed = false
    },
    delay: () => {
      delayed = true
    },
    confirm: () => modal!(),
  }
}
function setupBlacklist(query: Record<string, string> = {}, useRealSession = false) {
  return setup(query, useRealSession, blacklistPage)
}

test('REQ-002/014：资料按本人版本提交，显式发送 false，成功采用服务端回执', async () => {
  const s = await setup()
  const r = s.runtime
  assert.equal(r.allowed('putMeProfile'), true) // 普通资料不额外要求学生认证。
  s.user.refresh = async () => {
    s.user.user = { ...actor, version: 20, nickname: '新昵称', hide_identity_tags: false }
  }
  r.nickname.value = '新昵称'
  r.hidden.value = false
  await r.act()
  const input = s.calls.find((x) => x.method === 'PUT')!
  assert.deepEqual(input.data, {
    nickname: '新昵称',
    identity_tags: { campus: 'any', gender: 'undisclosed' },
    hide_identity_tags: false,
    mbti: 'INFP',
    expected_version: 19,
  })
  assert.ok(input.header?.['Idempotency-Key'])
  assert.equal(r.nickname.value, '新昵称')
  assert.equal(r.currentMe.value.version, 20)
  assert.equal(r.hidden.value, false)
  assert.equal(s.user.user?.version, 20)
  assert.deepEqual(s.prompts, [])
})
test('REQ-014/018：隐藏字段缺省不擅自填充，空白昵称拒绝，无本地持久化', async () => {
  const s = await setup()
  const r = s.runtime
  s.user.refresh = async () => {
    s.user.user = { ...actor, hide_identity_tags: undefined } as unknown as typeof actor
  }
  await r.load()
  assert.equal(r.hidden.value, null)
  await r.act()
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  r.hidden.value = true
  r.nickname.value = ' \n '
  await r.act()
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  const source = readFileSync(new URL('../src/pages/settings/index.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setStorage|localStorage|student_number|asset_id/)
})
test('REQ-014：解除使用本人黑名单条目版本，204 后重读，旧申请消息不会自动恢复', async () => {
  const s = await setupBlacklist()
  const r = s.runtime
  const entry = r.rows.value[0]
  await r.act('unblock', entry)
  const input = s.calls.find((x) => x.method === 'DELETE')!
  assert.equal(input.url, '/me/interaction-blocks/6c500000-0000-4000-8000-000000000002')
  assert.deepEqual(input.data, { expected_version: 3 })
  assert.match(s.prompts[0]!, /不会恢复旧申请、旧消息/)
  assert.equal(s.calls.filter((x) => x.url.startsWith('/me/interaction-blocks?')).length, 2)
  assert.equal(s.calls.filter((x) => x.method && x.method !== 'GET').length, 1)
})
test('REQ-014：拉黑只取已重验公开主页的目标，不接受路由昵称，禁止拉黑自己', async () => {
  const s = await setupBlacklist({
    targetId: '6c500000-0000-4000-8000-000000000002',
    nickname: '伪造昵称',
  })
  const r = s.runtime
  assert.equal(r.targetName.value, '合成对方')
  await r.act('block')
  assert.deepEqual(s.calls.find((x) => x.method === 'POST')?.data, {
    source: { kind: 'public_profile', id: '6c500000-0000-4000-8000-000000000002' },
  })
  assert.match(s.prompts[0]!, /合成对方/)
  assert.match(s.prompts[0]!, /现有匹配需另行退出/)
  const own = await setupBlacklist({ targetId: actor.id })
  await own.runtime.act('block')
  assert.equal(
    own.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
})
test('REQ-014：公开主页失效或错目标时拒绝拉黑', async () => {
  const s = await setupBlacklist({ targetId: 'synthetic-missing' })
  const r = s.runtime
  assert.equal(r.targetName.value, '')
  await r.act('block')
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  s.transport(async () => {
    throw new RequestError('合成缺失', 404, 'NOT_FOUND', '', 404)
  })
  await r.load()
  assert.equal(r.targetName.value, '')
  await r.act('block')
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
})
test('REQ-014：分页游标编码、按目标去重更新版本、循环或读取失败清空旧黑名单', async () => {
  const s = await setupBlacklist()
  const r = s.runtime
  let page = 0
  s.transport(async () =>
    ++page === 1
      ? {
          items: [
            {
              block_id: '6c500000-0000-4000-8000-000000000002',
              version: 4,
              label: '已屏蔽对象',
              allowed_actions: ['interactionBlockDelete'],
            },
          ],
          next_cursor: 'a/b+?',
        }
      : {
          items: [
            {
              block_id: '6c500000-0000-4000-8000-000000000002',
              version: 5,
              label: '已屏蔽对象',
              allowed_actions: ['interactionBlockDelete'],
            },
            {
              block_id: '6c500000-0000-4000-8000-000000000003',
              version: 2,
              label: '已屏蔽对象',
              allowed_actions: ['interactionBlockDelete'],
            },
          ],
          next_cursor: null,
        },
  )
  await r.load()
  await r.load(true)
  assert.match(s.calls.at(-1)!.url, /cursor=a%2Fb%2B%3F/)
  assert.equal(r.rows.value.length, 2)
  assert.equal(r.rows.value[0].version, 5)
  s.transport(async () => ({ items: [], next_cursor: 'same' }))
  await r.load()
  await r.load(true)
  assert.equal(r.blocksReady.value, false)
  assert.deepEqual(r.rows.value, [])
  assert.equal(r.currentMe.value.id, actor.id) // 列表失败不阻止独立的资料设置。
})
test('REQ-014/018：未校验时拒绝写入，解除只依赖当前条目动作，不使用旧Me动作', async () => {
  const s = await setupBlacklist()
  const r = s.runtime
  s.user.validated = false
  await r.act('unblock', r.rows.value[0])
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  s.user.validated = true
  s.user.user!.allowed_actions = []
  r.rows.value[0].allowed_actions = []
  await r.act('unblock', r.rows.value[0])
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  s.user.user!.allowed_actions = []
  await r.load()
  await r.act('unblock', r.rows.value[0])
  assert.equal(s.calls.filter((x) => x.method && x.method !== 'GET').length, 1)
})
test('个人资料连续编辑自动合并，手动保存仅提交通用资料', async () => {
  const s = await setup()
  const r = s.runtime
  r.nickname.value = '第一次编辑'
  r.queueSave()
  r.nickname.value = '第二次编辑'
  r.queueSave()
  assert.equal(s.calls.length, 0)
  await new Promise((resolve) => setTimeout(resolve, 650))
  assert.equal(s.calls.length, 1)
  assert.equal(s.calls[0]?.data?.nickname, '第二次编辑')
  r.hidden.value = false
  s.transport(async (input) => ({ ...actor, ...input.data, version: 21 }))
  assert.equal(await r.act(), true)
  assert.deepEqual(
    s.calls.slice(1).map((call) => call.url),
    ['/me/profile'],
  )
  assert.equal(s.calls[1]?.data?.expected_version, 20)
  assert.deepEqual(s.prompts, [])
})
test('保存期间再次编辑昵称，旧回执保留新输入并用新版本保存', async () => {
  const s = await setup()
  const r = s.runtime
  let finish!: (result: UserInfo) => void
  s.transport(async (input) => {
    if (input.data?.expected_version === 19)
      return new Promise((resolve) => {
        finish = resolve
      })
    return { ...actor, ...input.data, version: 21 }
  })
  r.nickname.value = '第一次编辑'
  const saving = r.act()
  r.nickname.value = '第二次编辑'
  r.queueSave()
  assert.equal(await r.act(), false)
  finish({ ...actor, version: 20, nickname: '第一次编辑' })
  await saving
  assert.equal(r.nickname.value, '第二次编辑')
  assert.equal(await r.act(), true)
  assert.equal(s.calls.length, 2)
  assert.equal(s.calls[1]?.data?.expected_version, 20)
  assert.equal(s.calls[1]?.data?.nickname, '第二次编辑')
})
test('学籍按账号版本保存，手动年级调整独立于年份与层级', async () => {
  const s = await setup()
  const r = s.runtime
  r.enrollmentYear.value = 2025
  r.educationLevel.value = 'undergraduate'
  r.gradeOverride.value = 'undergraduate_3'
  assert.equal(await r.act(), true)
  assert.equal(s.calls[0]?.data?.enrollment_year, 2025)
  assert.equal(s.calls[0]?.data?.education_level, 'undergraduate')
  assert.equal(s.calls[0]?.data?.grade_override, 'undergraduate_3')
  r.restoreAutomaticGrade()
  s.transport(async (input) => ({ ...actor, ...input.data, version: 21 }))
  assert.equal(await r.act(), true)
  assert.equal(s.calls[1]?.data?.grade_override, '')
  assert.equal(s.calls[1]?.data?.enrollment_year, 2025)
  assert.equal(s.calls[1]?.data?.education_level, 'undergraduate')
})
test('学籍未完整填写时保留草稿，不提交不完整账号更新', async () => {
  const s = await setup()
  s.runtime.enrollmentYear.value = 2025
  assert.equal(await s.runtime.act(), false)
  assert.equal(s.calls.length, 0)
  assert.match(s.runtime.error.value, /同时选择/)
})
test('资料超时保留原请求，自动保存不重发，手动保存原样重试', async () => {
  const s = await setup()
  const r = s.runtime
  r.nickname.value = '新的昵称'
  s.transport(async () => {
    throw new Error('合成网络超时')
  })
  assert.equal(await r.act(), false)
  assert.match(r.error.value, /结果尚未确认/)
  assert.equal(await r.act(false), false)
  assert.equal(s.calls.length, 1)
  s.transport(async (input) => ({ ...actor, ...input.data, version: 20 }))
  assert.equal(await r.act(), true)
  assert.deepEqual(s.calls[0], s.calls[1])
})
test('REQ-018：账号变化及晚到响应清理旧昵称与写权限', async () => {
  const s = await setup()
  const r = s.runtime
  let resolve: (value: unknown) => void = () => {}
  s.transport(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  r.nickname.value = '未完成的编辑'
  const pending = r.act()
  await settle()
  s.user.user = { ...actor, id: 'synthetic-new' }
  resolve(actor)
  await pending
  assert.equal(r.currentMe.value, null)
  assert.equal(r.nickname.value, '')
  assert.equal(r.allowed('putMeProfile'), false)
  s.epoch()
  await r.act()
  assert.equal(s.calls.filter((x) => x.method && x.method !== 'GET').length, 1)
})
test('REQ-018：未登录、Mock、本人读取失败均不保留设置或发送写入', async () => {
  const s = await setup()
  const r = s.runtime
  s.noToken()
  await r.load()
  assert.equal(r.currentMe.value, null)
  s.config.useMock = true
  await r.load()
  await r.act()
  assert.equal(
    s.calls.some((x) => x.method && x.method !== 'GET'),
    false,
  )
  const failed = await setup()
  failed.user.refresh = async () => {
    throw new RequestError('合成拒绝', 403, 'FORBIDDEN', '', 403)
  }
  await failed.runtime.load()
  assert.equal(failed.runtime.currentMe.value, null)
  assert.equal(failed.runtime.nickname.value, '')
})
test('REQ-014/018：公开心愿和故事可独立确认拉黑对象，隐私屏障或作者变化禁止沿用旧目标', async () => {
  for (const kind of ['wish', 'story']) {
    const s = await setupBlacklist({
      targetId: '6c500000-0000-4000-8000-000000000002',
      sourceId: 'synthetic-content',
      sourceKind: kind,
    })
    const r = s.runtime
    s.transport(async (input) => {
      if (input.url.startsWith('/me/interaction-blocks?')) return { items: [], next_cursor: null }
      if (input.method && input.method !== 'GET') return { accepted: true }
      const content = {
        id: 'synthetic-content',
        author: { id: '6c500000-0000-4000-8000-000000000002', nickname: '合成公开作者' },
      }
      return kind === 'wish'
        ? { id: content.id, current_state: 'published', public: content }
        : content
    })
    await r.load()
    assert.equal(r.targetName.value, '合成公开作者')
    await r.act('block')
    assert.equal(s.calls.filter((input) => input.method && input.method !== 'GET').length, 1)
    assert.equal(
      s.calls.some((input) => input.url.startsWith('/users/')),
      false,
    )
    s.transport(async (input) =>
      input.url.startsWith('/me/interaction-blocks?')
        ? { items: [], next_cursor: null }
        : {
            id: 'synthetic-content',
            current_state: 'published',
            privacy_review_required: true,
            public: {
              author: { id: '6c500000-0000-4000-8000-000000000002', nickname: '已隐藏作者' },
            },
            author: { id: 'synthetic-new-author', nickname: '新作者' },
          },
    )
    await r.load()
    assert.equal(r.targetName.value, '')
    await r.act('block')
    assert.equal(s.calls.filter((input) => input.method && input.method !== 'GET').length, 1)
  }
})

test('REQ-018：同账号令牌更换后已缓存的本人投影立即失效', async () => {
  const s = await setup({}, true)
  assert.equal(s.runtime.currentMe.value.id, actor.id)
  realSession.setToken('synthetic-replaced-token')
  assert.equal(s.runtime.currentMe.value, null)
  realSession.clear()
})

test('REQ-014：旧动作不启用新拉黑，条目不再提供账号主页或来源映射', async () => {
  const s = await setupBlacklist({ targetId: '6c500000-0000-4000-8000-000000000002' })
  s.workspace.allowed_actions = []
  s.user.user!.allowed_actions = ['putMeProfile', 'postMeBlocks', 'deleteMeBlocks']
  await s.runtime.load()
  await s.runtime.act('block')
  assert.equal(s.calls.filter((x) => x.method === 'POST').length, 0)
  assert.equal(s.runtime.targetName.value, '')
  const source = readFileSync(blacklistPage, 'utf8')
  assert.doesNotMatch(
    source,
    /entry\.target_user_id|entry\.block_id.*public-profile|postMeBlocks|deleteMeBlocks/,
  )
  assert.ok(s.calls.every((x) => !x.url.startsWith('/me/blocks')))
})
test('REQ-014/018：升级响应与账号字段泄漏均清掉黑名单，不回退旧接口', async () => {
  const s = await setupBlacklist()
  s.transport(async () => {
    throw new RequestError('需升级', 409, 'CLIENT_UPGRADE_REQUIRED', '', 409)
  })
  await s.runtime.load()
  assert.match(s.runtime.error.value, /更新/)
  assert.deepEqual(s.runtime.rows.value, [])
  assert.equal(s.runtime.workspace.value, null)
  s.transport(async () => ({
    items: [
      {
        block_id: '6c500000-0000-4000-8000-000000000002',
        version: 1,
        label: '已屏蔽对象',
        allowed_actions: ['interactionBlockDelete'],
        target_user_id: 'synthetic-leak',
      },
    ],
    next_cursor: null,
  }))
  await s.runtime.load()
  assert.deepEqual(s.runtime.rows.value, [])
  assert.equal(s.runtime.blocksReady.value, false)
  assert.ok(s.calls.every((x) => !x.url.startsWith('/me/blocks')))
})
test('REQ-014/018：解除超时禁止新写，原键原体重试，离页清掉待确认操作', async () => {
  const s = await setupBlacklist()
  let unknown = true
  s.transport(async (input) => {
    if (input.method === 'DELETE') {
      if (unknown) throw new RequestError('合成超时', -1)
      return undefined
    }
    return { items: [], next_cursor: null }
  })
  await s.runtime.act('unblock', s.runtime.rows.value[0])
  assert.equal(s.runtime.retryReady.value, true)
  await s.runtime.act('unblock', s.runtime.rows.value[0])
  assert.equal(s.calls.filter((x) => x.method === 'DELETE').length, 1)
  unknown = false
  await s.runtime.retryWrite()
  const writes = s.calls.filter((x) => x.method === 'DELETE')
  assert.deepEqual(writes[0], writes[1])
  assert.equal(s.runtime.retryReady.value, false)
  s.hooks.hide()
  await s.runtime.retryWrite()
  assert.equal(s.calls.filter((x) => x.method === 'DELETE').length, 2)
})

test('头像原生选图返回自动保存，采用服务器回执且重新读取后仍生效', async () => {
  const s = await setup()
  const r = s.runtime
  r.nickname.value = '未保存昵称'
  const persisted = {
    ...actor,
    version: 20,
    avatar_id: 'synthetic-id',
    avatar_url: 'https://synthetic.invalid/avatar',
  }
  s.transport(async (input) => (input.url === '/me/avatar' ? persisted : undefined))
  const picking = r.chooseAvatar()
  s.hooks.hide!()
  s.chooseImage({ tempFilePath: 'synthetic-avatar-local', size: 256 })
  await settle()
  assert.equal(s.calls.filter((call) => call.url === '/me/avatar').length, 0)
  s.hooks.show!()
  await picking
  const sent = s.calls.find((call) => call.url === '/me/avatar')!
  assert.equal(sent.method, 'POST')
  assert.equal(sent.filePath, 'synthetic-avatar-local')
  assert.deepEqual(sent.uploadFormData, { expected_version: '19' })
  assert.ok(sent.header?.['Idempotency-Key'])
  assert.equal(r.avatarDraft.value, '')
  assert.equal(r.currentMe.value.version, 20)
  assert.equal(s.user.user?.avatar_id, 'synthetic-id')
  assert.equal(r.nickname.value, '未保存昵称')
  assert.equal(r.notice.value, '头像已更新。')
  assert.equal(s.calls.filter((call) => call.url === '/me/avatar').length, 1)
  s.user.refresh = async () => {
    s.user.user = { ...persisted }
  }
  s.hooks.hide!()
  s.hooks.show!()
  await settle()
  assert.equal(r.currentMe.value.avatar_url, persisted.avatar_url)
})

test('头像失败用原文件、版本与请求标识重试，恢复默认使用当前版本', async () => {
  const s = await setup()
  const r = s.runtime
  let attempt = 0
  s.transport(async (input) => {
    if (input.url !== '/me/avatar') return
    if (input.method === 'DELETE') return { ...actor, version: 21 }
    if (++attempt === 1) throw new RequestError('合成超时', -1, 'UPLOAD_TIMEOUT')
    if (attempt === 2) throw new RequestError('合成状态冲突', 409, 'STATE_CONFLICT', '', 409)
    return {
      ...actor,
      version: 20,
      avatar_id: 'synthetic-id',
      avatar_url: 'https://synthetic.invalid/avatar',
    }
  })
  const pick = r.chooseAvatar()
  s.chooseImage({ tempFilePath: 'synthetic-avatar-local', size: 256 })
  await pick
  assert.match(r.avatarError.value, /超时.*原请求重试/)
  await r.changeAvatar()
  assert.match(r.avatarError.value, /仍在处理/)
  await r.changeAvatar()
  const uploads = s.calls.filter((call) => call.url === '/me/avatar' && call.method === 'POST')
  assert.equal(uploads.length, 3)
  assert.deepEqual(uploads[0], uploads[1])
  assert.deepEqual(uploads[1], uploads[2])
  await r.changeAvatar(true)
  assert.deepEqual(s.calls.find((call) => call.method === 'DELETE')?.data, { expected_version: 20 })
  assert.equal(r.currentMe.value.avatar_id, undefined)
  assert.equal(s.user.user?.avatar_url, undefined)
})

test('头像拒绝超限及非 JPG/PNG，取消保留预览，换号和离页丢弃迟到结果', async () => {
  const s = await setup()
  const r = s.runtime
  let pick = r.chooseAvatar()
  s.chooseImage({ tempFilePath: 'synthetic-avatar-too-large', size: 2 * 1024 * 1024 + 1 })
  await pick
  assert.match(r.avatarError.value, /2 MiB/)
  assert.equal(r.avatarDraft.value, '')
  pick = r.chooseAvatar()
  s.chooseImage({ tempFilePath: 'synthetic-avatar-gif', size: 50 }, 'gif')
  await pick
  assert.match(r.avatarError.value, /JPG 或 PNG/)
  s.transport(async () => {
    throw new RequestError('合成超时', -1)
  })
  pick = r.chooseAvatar()
  s.chooseImage({ tempFilePath: 'synthetic-avatar-ok', size: 50 })
  await pick
  pick = r.chooseAvatar()
  s.cancelImage()
  await pick
  assert.equal(r.avatarDraft.value, 'synthetic-avatar-ok')
  assert.equal(r.avatarError.value, '')
  let finish!: (result: UserInfo) => void
  s.transport(
    async () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const save = r.changeAvatar()
  await settle()
  s.user.user = { ...actor, id: 'synthetic-other' }
  finish({
    ...actor,
    version: 20,
    avatar_id: 'synthetic-id',
    avatar_url: 'https://synthetic.invalid/avatar',
  })
  await save
  assert.equal(r.avatarDraft.value, '')
  assert.equal(r.avatarPending.value, null)
  assert.equal(s.user.user.id, 'synthetic-other')
  assert.equal(s.user.user.avatar_url, undefined)
  s.hooks.show!()
  // 本人资料刷新需要完成才能再次调用选图。
  s.hooks.unload!()
  assert.equal(r.currentMe.value, null)
})

test('头像重试接受后续变更的最新本人投影，签名缺省时保存成功并显示默认图', async () => {
  const s = await setup()
  const r = s.runtime
  let attempt = 0
  s.transport(async () => {
    if (++attempt === 1) throw new RequestError('合成超时', -1)
    return { ...actor, version: 21 }
  })
  let pick = r.chooseAvatar()
  s.chooseImage({ tempFilePath: 'synthetic-avatar-local', size: 256 })
  await pick
  await r.changeAvatar()
  assert.equal(r.currentMe.value.version, 21)
  assert.equal(r.avatarPending.value, null)
  assert.match(r.notice.value, /同步当前头像/)
  s.transport(async () => ({ ...actor, version: 22, avatar_id: 'synthetic-avatar-id' }))
  pick = r.chooseAvatar()
  s.chooseImage({ tempFilePath: 'synthetic-avatar-local-2', size: 256 })
  await pick
  assert.equal(r.avatarPending.value, null)
  assert.equal(r.currentMe.value.avatar_id, 'synthetic-avatar-id')
  assert.match(r.notice.value, /图片暂不可读取/)
})

test('黑名单从个人中心独立进入，资料页不读取黑名单接口', async () => {
  const s = await setup()
  assert.deepEqual(s.calls, [])
  const profile = readFileSync(new URL('../src/pages/profile/index.vue', import.meta.url), 'utf8')
  assert.match(profile, /label: '黑名单'[^\n]*url: '\/pages\/blacklist\/index'/)
  assert.doesNotMatch(readFileSync(settingsPage, 'utf8'), /黑名单|listBlocks|interactionBlock/)
})

test('黑名单在更换会话时丢弃旧名单和目标', async () => {
  const s = await setupBlacklist({ targetId: '6c500000-0000-4000-8000-000000000002' }, true)
  try {
    assert.equal(s.runtime.rows.value.length, 1)
    assert.equal(s.runtime.targetName.value, '合成对方')
    realSession.setToken('synthetic-replaced-token')
    assert.deepEqual(s.runtime.rows.value, [])
    assert.equal(s.runtime.targetName.value, '')
  } finally {
    realSession.clear()
  }
})

test('头像对审核不支持的小尺寸和超过像素预算的素材提前提示，不发上传', async () => {
  const s = await setup()
  const r = s.runtime
  for (const [width, height, message] of [
    [16, 16, /20像素/],
    [20, 256, /20像素/],
    [4096, 4096, /像素过大/],
  ] as const) {
    const picking = r.chooseAvatar()
    s.chooseImage({ tempFilePath: 'synthetic-image', size: 256 }, 'png', width, height)
    await picking
    assert.match(r.avatarError.value, message)
    assert.equal(r.avatarDraft.value, '')
  }
  assert.equal(s.calls.filter((call) => call.url === '/me/avatar').length, 0)
})

test('通用资料页不读取包分配资料，活动参数只接受有效活动并支持返回', async () => {
  const activity = '10000000-0000-4000-8000-000000000001'
  const fromActivity = await setup({ activity })
  assert.equal(fromActivity.runtime.activity.value, activity)
  assert.equal(fromActivity.runtime.currentMe.value.nickname, actor.nickname)
  assert.equal(fromActivity.matchmakingReads, 0)
  await fromActivity.runtime.returnToActivity()
  assert.deepEqual(fromActivity.navigation, [`/pages/matchmaking/detail?id=${activity}`])

  const fromCenter = await setup({ activity: '../../other' })
  assert.equal(fromCenter.runtime.activity.value, '')
  assert.equal(fromCenter.matchmakingReads, 0)
  await fromCenter.runtime.returnToActivity()
  assert.deepEqual(fromCenter.navigation, [])
})

test('资料保存结果未知后离页重入，保留原键并合并较新学籍草稿', async () => {
  const s = await setup()
  const r = s.runtime
  r.enrollmentYear.value = 2025
  r.educationLevel.value = 'undergraduate'
  s.transport(async () => {
    throw new Error('合成超时')
  })
  await r.act()
  r.gradeOverride.value = 'undergraduate_3'
  s.hooks.hide!()
  s.hooks.show!()
  await settle()
  assert.equal(r.gradeOverride.value, 'undergraduate_3')
  await r.act(false)
  assert.equal(s.calls.length, 1)
  s.transport(async (input) => ({
    ...actor,
    ...input.data,
    version: Number(input.data?.expected_version) + 1,
  }))
  assert.equal(await r.act(), true)
  assert.deepEqual(s.calls[1], s.calls[0])
  assert.equal(s.calls[2]?.data?.grade_override, 'undergraduate_3')
  assert.equal(s.calls[2]?.data?.expected_version, 20)
})

test('手动年级超出范围时取消旧自动保存，手动保存也须先修正输入', async () => {
  const s = await setup()
  const r = s.runtime
  r.enrollmentYear.value = 2025
  r.educationLevel.value = 'undergraduate'
  r.adjustGradeNumber({ detail: { value: '12' } })
  r.adjustGradeNumber({ detail: { value: '123' } })
  await new Promise((resolve) => setTimeout(resolve, 650))
  assert.equal(s.calls.length, 0)
  assert.equal(await r.act(), false)
  assert.equal(s.calls.length, 0)
  assert.match(r.error.value, /1–100/)
  r.adjustGradeNumber({ detail: { value: '3' } })
  assert.equal(await r.act(), true)
  assert.equal(s.calls[0]?.data?.grade_override, 'undergraduate_3')
})

test('年级非法输入即使没有其他字段改动，保存也不能清除错误或宣称成功', async () => {
  const s = await setup({ activity: '10000000-0000-4000-8000-000000000001' })
  s.runtime.adjustGradeNumber({ detail: { value: '101' } })
  assert.equal(await s.runtime.act(), false)
  assert.equal(s.calls.length, 0)
  assert.match(s.runtime.error.value, /1–100/)
  await s.runtime.returnToActivity()
  assert.deepEqual(s.navigation, [])
})
