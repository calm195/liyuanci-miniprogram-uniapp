import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createPinia, defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import * as contract from '../src/utils/matchmaking.ts'
import { notificationDestination } from '../src/utils/chat.ts'
import { campuses } from '../src/types/wish.ts'
import type {
  MatchmakingAccountProfile,
  MatchmakingDetail,
  MatchmakingProfile,
} from '../src/types/matchmaking.ts'
import { beijingTime } from '../src/utils/capsules.ts'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'

const activityId = '10000000-0000-4000-8000-000000000001'
const enrollmentId = '10000000-0000-4000-8000-000000000002'
const pairId = '10000000-0000-4000-8000-000000000003'
const taskId = '10000000-0000-4000-8000-000000000004'
const secondId = '10000000-0000-4000-8000-000000000005'
const profile: MatchmakingProfile = {
  name: '合成同学',
  gender: 'female',
  grade: 'first',
  campus: 'wushan',
  mbti: 'INFP',
  age: 20,
  age_min: 18,
  age_max: 25,
  height: 165,
  height_min: 150,
  height_max: 190,
  weight: 110,
  weight_min: 80,
  weight_max: 180,
  wechat: 'synthetic-wechat',
  introduction: '合成自我介绍',
  personal_traits: [],
  consent: true,
}
function sample(): MatchmakingDetail {
  return {
    activity: {
      id: activityId,
      version: 3,
      title: '合成活动',
      description: '合成活动说明',
      campuses: ['wushan'],
      registration_opens_at: '2030-01-01T00:00:00Z',
      registration_closes_at: '2030-01-03T00:00:00Z',
      results_at: '2030-01-03T01:00:00Z',
      starts_at: '2030-01-03T02:00:00Z',
      ends_at: '2030-01-06T00:00:00Z',
      days: 3,
      status: 'published',
      phase: 'registration',
    },
    enrollment: {
      id: enrollmentId,
      version: 8,
      status: 'approved',
      reason: '',
      profile: { ...profile },
      eligible: true,
    },
    tasks: [],
  }
}
test('结束活动解析人数和组数，保留零值并拒绝进行中的统计', () => {
  const activity = sample().activity
  const summary = { enrollment_count: 0, successful_pair_count: 0 }
  assert.deepEqual(
    contract.parseMatchmakingActivity({ ...activity, phase: 'ended', summary }).summary,
    summary,
  )
  assert.throws(() => contract.parseMatchmakingActivity({ ...activity, summary }))
  assert.throws(() =>
    contract.parseMatchmakingActivity({
      ...activity,
      phase: 'ended',
      summary: { ...summary, successful_pair_count: -1 },
    }),
  )
})

function paired(): MatchmakingDetail {
  const data = sample()
  data.activity.phase = 'active'
  data.pair = {
    id: pairId,
    version: 2,
    status: 'published',
    score: 55,
    score_details: {
      mbti: 18,
      age: 12,
      campus: 12.5,
      height: 7.5,
      weight: 5,
      traits: 0,
      personal_to_ideal: [],
      ideal_to_personal: [],
    },
    algorithm: 'legacy-fixed-v1',
    accessible: true,
    peer: { ...profile, name: '合成对方' },
  }
  data.tasks = [
    {
      id: taskId,
      day_index: 1,
      unlocks_at: data.activity.starts_at,
      can_open: true,
      kind: 'online',
      body: '合成今日任务',
    },
    { id: secondId, day_index: 2, unlocks_at: '2030-01-04T00:00:00+08:00', can_open: false },
  ]
  return data
}
class RequestError extends Error {
  statusCode: number
  error_code: string
  constructor(statusCode: number, error_code = '') {
    super('合成请求失败')
    this.statusCode = statusCode
    this.error_code = error_code
  }
}
type Call = {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
  silent?: boolean
}
type Modal = { success: (value: { confirm: boolean }) => void }
const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
async function setup() {
  const epoch = ref(1)
  let token = 'synthetic-token'
  const session = { getEpoch: () => epoch.value, getToken: () => token }
  const user = reactive({
    user: {
      id: 'synthetic-owner',
      verification: 'verified',
      grade_options: [{ code: 'first', label: '合成年级' }],
      identity_tags: { grade: 'first', gender: 'female' },
      penalty_notice: '',
    },
    validated: true,
    isLoggedIn: true,
    refresh: async () => {},
  })
  const config = { useMock: false }
  let data = sample()
  let accountData: MatchmakingAccountProfile = {
    version: 5,
    account_version: 17,
    profile: { ...profile, consent: false },
  }
  const calls: Call[] = []
  let modal = (options: Modal) => options.success({ confirm: true })
  let transport = async (call: Call): Promise<unknown> =>
    call.method === 'GET' ? structuredClone(data) : { id: enrollmentId }
  const api = await loadRuntime(source('api/matchmaking.ts'), {
    ...contract,
    RequestError,
    session,
    request: (call: Call) => {
      calls.push(JSON.parse(JSON.stringify(call)))
      if (call.method === 'GET' && call.url === '/matchmaking/profile')
        return Promise.resolve(structuredClone(accountData))
      return transport(call)
    },
  })
  const pinia = createPinia()
  const stores = await loadRuntime(source('stores/matchmaking.ts'), {
    defineStore,
    session,
    useUserStore: () => user,
  })
  const useMatchmakingStore = () => stores.useMatchmakingStore(pinia)
  async function page(name = 'detail') {
    const hooks: Record<'show' | 'hide' | 'unload', (() => void)[]> = {
      show: [],
      hide: [],
      unload: [],
    }
    const lifecycle = {
      onShow: (fn: () => void) => hooks.show.push(fn),
      onHide: (fn: () => void) => hooks.hide.push(fn),
      onUnload: (fn: () => void) => hooks.unload.push(fn),
      onLoad: (fn: (query: { id: string }) => void) => fn({ id: activityId }),
    }
    const composable = await loadRuntime(source('composables/use-matchmaking-page.ts'), {
      ...lifecycle,
      session,
      config,
      RequestError,
      useUserStore: () => user,
      useMatchmakingStore,
      writeMatchmaking: api.writeMatchmaking,
    })
    const exports =
      name === 'detail'
        ? 'detail, account, consent, profileProblem, editing, editVersion, locked, canEdit, canExit, exitReason, expandedTask, beginEdit, submit, withdraw, openTask, retry'
        : 'activities, total, currentPage, more'
    const runtime = await loadRuntime(
      pageScript(new URL(`../src/pages/matchmaking/${name}.vue`, import.meta.url)) +
        `\nexport { page, load, ${exports} }`,
      {
        ...lifecycle,
        ...contract,
        ...api,
        ...composable,
        campuses,
        beijingTime,
        uni: {
          stopPullDownRefresh() {},
          showModal: (options: Modal) => modal(options),
        },
      },
    )
    hooks.show.forEach((fn) => fn())
    await settle()
    return {
      runtime,
      hide: () => hooks.hide.forEach((fn) => fn()),
      unload: () => hooks.unload.forEach((fn) => fn()),
      show: async () => {
        hooks.show.forEach((fn) => fn())
        await settle()
      },
    }
  }
  return {
    user,
    api,
    config,
    calls,
    page,
    store: useMatchmakingStore(),
    setAccount: (value: MatchmakingAccountProfile) => {
      accountData = value
    },
    setData: (value: MatchmakingDetail) => {
      data = value
    },
    transport: (fn: typeof transport) => {
      transport = fn
    },
    modal: (fn: typeof modal) => {
      modal = fn
    },
    clearSession: () => {
      token = ''
      epoch.value++
    },
    changeOwner: () => {
      user.user.id = 'synthetic-other'
      epoch.value++
    },
  }
}

test('包分配资料解析保留单位和受控枚举，拒绝倒置区间、无效日期和泄漏正文', () => {
  assert.deepEqual(contract.parseMatchmakingDetail(paired()), paired())
  const chat = paired()
  chat.pair!.conversation_id = secondId
  assert.equal(contract.parseMatchmakingDetail(chat).pair?.conversation_id, secondId)
  chat.pair!.status = 'draft'
  assert.throws(() => contract.parseMatchmakingDetail(chat))
  for (const changes of [
    { age: 17 },
    { age_min: 30, age_max: 25 },
    { height: 251 },
    { weight: 49 },
    { weight_min: 501 },
    { gender: 'undisclosed' },
    { mbti: 'UNKNOWN' },
  ])
    assert.throws(() => contract.parseMatchmakingProfile({ ...profile, ...changes }))
  const raw = paired()
  assert.equal(
    'openid' in contract.parseMatchmakingProfile({ ...profile, openid: 'synthetic-secret' }),
    false,
  )
  for (const mutate of [
    (v: MatchmakingDetail) => {
      v.pair!.accessible = false
    },
    (v: MatchmakingDetail) => {
      v.pair!.status = 'ended'
    },
    (v: MatchmakingDetail) => {
      v.activity.status = 'cancelled'
      v.activity.phase = 'cancelled'
    },
    (v: MatchmakingDetail) => {
      v.activity.phase = 'matching'
    },
    (v: MatchmakingDetail) => {
      v.tasks[1]!.can_open = true
    },
    (v: MatchmakingDetail) => {
      v.tasks[1]!.body = '未来泄漏'
    },
    (v: MatchmakingDetail) => {
      v.tasks[1]!.day_index = 1
    },
    (v: MatchmakingDetail) => {
      v.activity.registration_closes_at = '无时区'
    },
  ]) {
    const value = structuredClone(raw)
    mutate(value)
    assert.throws(() => contract.parseMatchmakingDetail(value))
  }
  const ended = paired()
  ended.activity.phase = 'ended'
  ended.tasks[0]!.can_open = false
  assert.equal(contract.parseMatchmakingDetail(ended).tasks[0]!.body, '合成今日任务')
  assert.match(contract.matchmakingProfileProblem({ ...profile, consent: false }), /勾选/)
  assert.match(
    contract.matchmakingProfileProblem({ ...profile, height_min: 200, height_max: 150 }),
    /最低值/,
  )
})

test('API使用活动范围、原始版本与幂等键，目标错配或损坏回执不能算成功', async () => {
  const s = await setup()
  await s.api.writeMatchmaking({
    kind: 'enroll',
    activityId,
    key: 'synthetic-enroll',
    input: { expected_version: 8, profile_version: 5, account_version: 17, consent: true },
  })
  assert.deepEqual(s.calls[0], {
    url: `/matchmaking/activities/${activityId}/enrollment`,
    method: 'PUT',
    data: { expected_version: 8, profile_version: 5, account_version: 17, consent: true },
    silent: true,
    header: { 'Idempotency-Key': 'synthetic-enroll' },
  })
  s.transport(async () => ({ ...sample(), activity: { ...sample().activity, id: secondId } }))
  await assert.rejects(s.api.getMatchmaking(activityId), /目标不匹配/)
  s.transport(async () => ({ id: 'not-a-uuid' }))
  await assert.rejects(
    s.api.writeMatchmaking({ kind: 'open', activityId, taskId, key: 'synthetic-open', input: {} }),
    /格式异常/,
  )
  assert.deepEqual(s.calls.at(-1)?.data, {})
  await assert.rejects(s.api.getMatchmaking('../../other'), /无效/)
  await assert.rejects(s.api.listMatchmaking(1.5), /无效/)
  s.clearSession()
  await assert.rejects(s.api.getMatchmaking(activityId))
})

test('报名预览账号快照，允许跨校区，提交只带版本和展示确认', async () => {
  const s = await setup()
  s.setAccount({
    version: 5,
    account_version: 17,
    profile: { ...profile, campus: 'international', mbti: '', wechat: '', consent: false },
  })
  const p = await s.page()
  p.runtime.beginEdit()
  assert.equal(p.runtime.consent.value, false)
  assert.equal(p.runtime.editVersion.value, 8)
  await p.runtime.submit()
  assert.match(p.runtime.page.error.value, /勾选/)
  assert.equal(s.calls.filter((call) => call.method === 'PUT').length, 0)
  p.runtime.consent.value = true
  const next = sample()
  next.enrollment!.version = 9
  s.setData(next)
  await p.runtime.load()
  await p.runtime.submit()
  assert.deepEqual(s.calls.find((call) => call.method === 'PUT')?.data, {
    expected_version: 8,
    profile_version: 5,
    account_version: 17,
    consent: true,
  })
  assert.equal(p.runtime.editing.value, false)
  assert.match(p.runtime.page.notice.value, /已提交/)
})

test('通用资料缺失时阻止报名，专用资料可独立保存', async () => {
  const s = await setup()
  const partial = { ...profile, grade: '', age: 0, consent: false, mbti: 'INFJ' }
  s.setAccount({ version: 5, account_version: 17, profile: partial })
  const p = await s.page()
  p.runtime.beginEdit()
  p.runtime.consent.value = true
  await p.runtime.submit()
  assert.match(p.runtime.page.error.value, /年级/)
  assert.equal(s.calls.filter((call) => call.method === 'PUT').length, 0)
  await s.api.writeMatchmaking({
    kind: 'profile',
    activityId: 'account-profile',
    key: 'synthetic-profile',
    input: { expected_version: 5, profile: contract.parseMatchmakingPreferences(partial) },
  })
  assert.equal(s.calls.at(-1)?.url, '/matchmaking/profile')
  assert.deepEqual(s.calls.at(-1)?.data, {
    expected_version: 5,
    profile: contract.parseMatchmakingPreferences(partial),
  })
})

test('账号资料版本更新后要求重新确认展示说明', async () => {
  const s = await setup()
  const p = await s.page()
  p.runtime.beginEdit()
  p.runtime.consent.value = true
  s.setAccount({ version: 5, account_version: 18, profile: { ...profile, consent: false } })
  await p.runtime.load()
  assert.equal(p.runtime.consent.value, false)
})

test('未知报名结果离开重入仍按原键和版本重试', async () => {
  const s = await setup(),
    p = await s.page()
  s.transport(async (call) => {
    if (call.method === 'PUT') throw new RequestError(0)
    return sample()
  })
  p.runtime.beginEdit()
  p.runtime.consent.value = true
  await p.runtime.submit()
  assert.ok(p.runtime.page.pending.value)
  const original = s.calls.find((call) => call.method === 'PUT')!
  s.setAccount({ version: 5, account_version: 18, profile: { ...profile, consent: false } })
  p.unload()
  assert.equal(p.runtime.detail.value, null)
  const reentered = await s.page()
  assert.equal(reentered.runtime.locked.value, true)
  s.transport(async (call) => (call.method === 'PUT' ? { id: enrollmentId } : sample()))
  await reentered.runtime.retry()
  assert.deepEqual(
    s.calls.filter((call) => call.method === 'PUT'),
    [original, original],
  )
  assert.equal(reentered.runtime.page.pending.value, null)
  assert.equal(reentered.runtime.editing.value, false)
})

test('限流和服务异常保留原命令，明确版本冲突允许刷新后重新编辑', async () => {
  for (const status of [429, 500, 408, 409]) {
    const s = await setup(),
      p = await s.page()
    s.transport(async (call) => {
      if (call.method === 'PUT') throw new RequestError(status)
      return sample()
    })
    p.runtime.beginEdit()
    p.runtime.consent.value = true
    await p.runtime.submit()
    assert.equal(!!p.runtime.page.pending.value, status !== 409)
    if (status === 409) assert.match(p.runtime.page.error.value, /状态已变化/)
  }
})

test('切换账号、隐藏和晚到响应不恢复私人资料或上个账号的未知命令', async () => {
  const s = await setup(),
    p = await s.page()
  let resolve!: (value: unknown) => void
  s.transport(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const read = p.runtime.load()
  await settle()
  p.hide()
  resolve(paired())
  await read
  assert.equal(p.runtime.detail.value, null)
  s.transport(async () => sample())
  await p.show()
  p.runtime.beginEdit()
  p.runtime.consent.value = true
  s.transport(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const write = p.runtime.submit()
  await settle()
  s.changeOwner()
  resolve({ id: enrollmentId })
  await write
  assert.equal(p.runtime.detail.value, null)
  assert.equal(p.runtime.page.pending.value, null)
  assert.equal(p.runtime.page.notice.value, '')
  s.clearSession()
  assert.match(p.runtime.page.gate.value, /登录/)
})

test('资格读取失效后不默默丢弃退出请求，明确提示重新校验', async () => {
  const s = await setup(),
    p = await s.page()
  s.user.validated = false
  p.runtime.exitReason.value = '合成退出原因'
  await p.runtime.withdraw()
  assert.match(p.runtime.page.error.value, /登录资格未能确认/)
  assert.equal(s.calls.filter((call) => call.method === 'POST').length, 0)
})

test('任务写入被明确拒绝后立即清理旧配对资料和正文', async () => {
  for (const status of [403, 404]) {
    const s = await setup()
    s.setData(paired())
    const p = await s.page()
    s.transport(async (call) => {
      if (call.method === 'POST') throw new RequestError(status)
      return paired()
    })
    await p.runtime.openTask(p.runtime.detail.value.tasks[0])
    assert.equal(p.runtime.detail.value, null)
    assert.equal(p.runtime.expandedTask.value, '')
    assert.equal(p.runtime.page.pending.value, null)
    assert.ok(p.runtime.page.error.value)
  }
})

test('同一账号的资格变化立即撤下敏感展示，同时保留未知命令', async () => {
  for (const invalidate of [
    (s: Awaited<ReturnType<typeof setup>>) => {
      s.user.user.verification = 'unverified'
    },
    (s: Awaited<ReturnType<typeof setup>>) => {
      s.user.user.penalty_notice = '当前账号交互权限受限'
    },
    (s: Awaited<ReturnType<typeof setup>>) => {
      s.user.validated = false
    },
  ]) {
    const s = await setup()
    s.setData(paired())
    const p = await s.page()
    s.transport(async () => {
      throw new RequestError(0)
    })
    await p.runtime.openTask(p.runtime.detail.value.tasks[0])
    const command = structuredClone(s.calls.at(-1))
    assert.ok(p.runtime.page.pending.value)
    invalidate(s)
    assert.equal(p.runtime.detail.value, null)
    assert.equal(p.runtime.expandedTask.value, '')
    assert.ok(p.runtime.page.pending.value)
    assert.deepEqual(s.calls.at(-1), command)
    assert.match(p.runtime.page.error.value, /资格.*刷新/)
  }
})

test('退出确认跨隐藏重入后失效，不保存空原因的未知命令', async () => {
  const s = await setup(),
    p = await s.page()
  let confirm: Modal | undefined
  s.modal((options) => {
    confirm = options
  })
  p.runtime.exitReason.value = '原页面退出原因'
  const withdrawing = p.runtime.withdraw()
  p.hide()
  await p.show()
  assert.ok(confirm)
  confirm.success({ confirm: true })
  await withdrawing
  assert.equal(s.calls.filter((call) => call.method === 'POST').length, 0)
  assert.equal(p.runtime.page.pending.value, null)
  assert.equal(p.runtime.page.error.value, '')
})

test('隐藏重入后晚到的旧查看回执不展开当前页面的任务', async () => {
  const s = await setup()
  s.setData(paired())
  const p = await s.page()
  let finish: (value: unknown) => void = () => {
    throw new Error('没有旧请求')
  }
  s.transport((call) =>
    call.method === 'POST'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : Promise.resolve(paired()),
  )
  const opening = p.runtime.openTask(p.runtime.detail.value.tasks[0])
  await settle()
  p.hide()
  s.transport(async (call) => (call.method === 'POST' ? { id: taskId } : paired()))
  await p.show()
  await p.runtime.retry()
  assert.equal(p.runtime.page.pending.value, null)
  finish({ id: taskId })
  await opening
  assert.equal(p.runtime.expandedTask.value, '')
})

test('每日任务只记录本人查看，未来任务不发送，结束后正文只读；受限账号仍能退出', async () => {
  const s = await setup()
  s.setData(paired())
  const p = await s.page()
  await p.runtime.openTask(p.runtime.detail.value.tasks[1])
  assert.equal(s.calls.filter((call) => call.method === 'POST').length, 0)
  await p.runtime.openTask(p.runtime.detail.value.tasks[0])
  assert.equal(s.calls.filter((call) => call.method === 'POST').length, 1)
  assert.equal(p.runtime.expandedTask.value, taskId)
  const ended = paired()
  ended.activity.phase = 'ended'
  ended.tasks[0]!.can_open = false
  s.setData(ended)
  await p.runtime.load()
  await p.runtime.openTask(p.runtime.detail.value.tasks[0])
  assert.equal(s.calls.filter((call) => call.method === 'POST').length, 1)
  s.user.user.verification = 'unverified'
  s.user.user.penalty_notice = '合成限制'
  await p.runtime.load()
  assert.equal(p.runtime.canEdit.value, false)
  assert.equal(p.runtime.canExit.value, true)
  p.runtime.exitReason.value = '合成退出原因'
  await p.runtime.withdraw()
  const last = s.calls.filter((call) => call.method === 'POST').at(-1)!
  assert.equal(last.url, `/matchmaking/activities/${activityId}/withdraw`)
  assert.deepEqual(last.data, { expected_version: 8, reason: '合成退出原因' })
})

test('活动列表处理空态和重复翻页；游客不请求，通知落到活动页，原找搭子入口保留', async () => {
  const s = await setup()
  s.transport(async () => ({ items: [], total: 0 }))
  const p = await s.page('index')
  assert.equal(p.runtime.activities.value.length, 0)
  s.transport(async () => ({ items: [sample().activity], total: 2 }))
  await p.runtime.load()
  await p.runtime.load(true)
  assert.match(p.runtime.page.error.value, /列表已变化/)
  assert.equal(p.runtime.activities.value.length, 0)
  s.clearSession()
  const count = s.calls.length
  const guest = await s.page('index')
  assert.equal(s.calls.length, count)
  assert.match(guest.runtime.page.gate.value, /登录/)
  assert.deepEqual(
    notificationDestination({
      id: 'synthetic-notice',
      version: 1,
      kind: 'matchmaking',
      target_kind: 'matchmaking',
      target_ref: activityId,
      read: false,
    }),
    { url: `/pages/matchmaking/detail?id=${activityId}`, label: '查看包分配活动' },
  )
  assert.match(source('pages/index/index.vue'), /category=team/)
  assert.match(source('pages/index/index.vue'), /pages\/matchmaking\/index/)
  const pages = JSON.parse(source('pages.json')).pages
  assert.equal(pages[0].path, 'pages/index/index')
  assert.ok(pages.some((entry: { path: string }) => entry.path === 'pages/matchmaking/detail'))
  const guide = await loadRuntime(source('api/module-guide.ts'), {})
  assert.equal(
    guide.parseModuleGuide({
      version: 1,
      acknowledged_version: 0,
      modules: [{ module: 'matchmaking', title: '包分配', body: '合成说明' }],
    }).modules[0].module,
    'matchmaking',
  )
})

test('标签双向加分允许总分超过100，旧分数缺少标签明细时兼容为零', () => {
  const data = paired()
  data.pair!.score = 155
  data.pair!.score_details.traits = 100
  data.pair!.score_details.personal_to_ideal = ['真诚']
  data.pair!.score_details.ideal_to_personal = ['开朗']
  assert.equal(contract.parseMatchmakingDetail(data).pair?.score, 155)
  assert.deepEqual(contract.parseMatchmakingDetail(data).pair?.score_details.personal_to_ideal, [
    '真诚',
  ])
  delete data.pair!.score_details.traits
  delete data.pair!.score_details.personal_to_ideal
  delete data.pair!.score_details.ideal_to_personal
  const legacy = contract.parseMatchmakingDetail(data)
  assert.equal(legacy.pair?.score_details.traits, 0)
  assert.deepEqual(legacy.pair?.score_details.ideal_to_personal, [])
  data.pair!.score = 201
  assert.throws(() => contract.parseMatchmakingDetail(data))
})
