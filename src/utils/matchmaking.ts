import type {
  ActivityPhase,
  MatchmakingActivity,
  MatchmakingAccountProfile,
  MatchmakingDetail,
  MatchmakingEnrollment,
  MatchmakingPage,
  MatchmakingPair,
  MatchmakingProfile,
  MatchmakingProfileDraft,
  MatchmakingScore,
  MatchmakingTask,
} from '../types/matchmaking.ts'

export const matchmakingMbtis = [
  'INFP',
  'ENFP',
  'INFJ',
  'ENFJ',
  'INTJ',
  'ENTJ',
  'INTP',
  'ENTP',
  'ISFP',
  'ESFP',
  'ISTP',
  'ESTP',
  'ISFJ',
  'ESFJ',
  'ISTJ',
  'ESTJ',
] as const
export const matchmakingEducations = ['本科生', '研究生', '博士生']
const phases: ActivityPhase[] = [
  'draft',
  'cancelled',
  'upcoming',
  'registration',
  'matching',
  'active',
  'ended',
]
const campusCodes = ['wushan', 'university_town', 'international']

function invalid(): never {
  throw new Error('活动资料格式异常，请刷新后重试。')
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function string(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || [...value].length > max) invalid()
  return value
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    invalid()
  return value
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid()
  return value
}
function option<T extends string>(value: unknown, choices: readonly T[]): T {
  for (const choice of choices) if (choice === value) return choice
  return invalid()
}
export function matchmakingID(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  )
}
function id(value: unknown): string {
  if (!matchmakingID(value)) invalid()
  return value
}
function timestamp(value: unknown): string {
  const text = string(value, 64)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text) ||
    !Number.isFinite(Date.parse(text))
  )
    invalid()
  return text
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid()
  return value
}
function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid()
  return items
}

export function parseMatchmakingActivity(value: unknown): MatchmakingActivity {
  const v = record(value)
  const campuses =
    v.campuses == null ? undefined : array(v.campuses, 3).map((item) => option(item, campusCodes))
  if (campuses && new Set(campuses).size !== campuses.length) invalid()
  const out: MatchmakingActivity = {
    id: id(v.id),
    version: integer(v.version, 1),
    title: string(v.title, 80),
    description: string(v.description),
    ...(campuses === undefined ? {} : { campuses }),
    registration_opens_at: timestamp(v.registration_opens_at),
    registration_closes_at: timestamp(v.registration_closes_at),
    results_at: timestamp(v.results_at),
    starts_at: timestamp(v.starts_at),
    ends_at: timestamp(v.ends_at),
    days: integer(v.days, 1, 30),
    status: option(v.status, ['draft', 'published', 'cancelled']),
    phase: option(v.phase, phases),
  }
  if (
    !out.title.trim() ||
    !out.description.trim() ||
    Date.parse(out.registration_opens_at) >= Date.parse(out.registration_closes_at) ||
    Date.parse(out.registration_closes_at) > Date.parse(out.results_at) ||
    Date.parse(out.results_at) > Date.parse(out.starts_at) ||
    Date.parse(out.starts_at) >= Date.parse(out.ends_at)
  )
    invalid()
  if (
    (out.status === 'draft') !== (out.phase === 'draft') ||
    (out.status === 'cancelled') !== (out.phase === 'cancelled')
  )
    invalid()
  if (v.summary !== undefined) {
    if (out.phase !== 'ended') invalid()
    const summary = record(v.summary)
    out.summary = {
      enrollment_count: integer(summary.enrollment_count),
      successful_pair_count: integer(summary.successful_pair_count),
    }
  }
  return out
}

export function parseMatchmakingProfile(value: unknown): MatchmakingProfile {
  const v = record(value)
  const out: MatchmakingProfile = {
    name: string(v.name, 32),
    gender: option(v.gender, ['male', 'female']),
    education: option(v.education, matchmakingEducations),
    grade: string(v.grade, 32),
    campus: option(v.campus, campusCodes),
    mbti: option(v.mbti, ['', ...matchmakingMbtis]),
    age: integer(v.age, 18, 80),
    age_min: integer(v.age_min, 18, 80),
    age_max: integer(v.age_max, 18, 80),
    height: integer(v.height, 100, 250),
    height_min: integer(v.height_min, 100, 250),
    height_max: integer(v.height_max, 100, 250),
    weight: integer(v.weight, 50, 500),
    weight_min: integer(v.weight_min, 50, 500),
    weight_max: integer(v.weight_max, 50, 500),
    wechat: string(v.wechat, 64),
    introduction: string(v.introduction, 500),
    consent: bool(v.consent),
  }
  if (
    out.age_min > out.age_max ||
    out.height_min > out.height_max ||
    out.weight_min > out.weight_max ||
    !out.name.trim() ||
    !out.education.trim() ||
    !out.grade.trim() ||
    !out.introduction.trim()
  )
    invalid()
  return out
}

export function parseMatchmakingProfileDraft(value: unknown): MatchmakingProfileDraft {
  const v = record(value)
  const numeric = (key: string, min: number, max: number) =>
    v[key] === 0 ? 0 : integer(v[key], min, max)
  const draft: MatchmakingProfileDraft = {
    name: string(v.name, 32),
    gender: option(v.gender, ['', 'male', 'female']),
    education: option(v.education, ['', ...matchmakingEducations]),
    grade: string(v.grade, 32),
    campus: option(v.campus, ['', ...campusCodes]),
    mbti: option(v.mbti, ['', ...matchmakingMbtis]),
    age: numeric('age', 18, 80),
    age_min: numeric('age_min', 18, 80),
    age_max: numeric('age_max', 18, 80),
    height: numeric('height', 100, 250),
    height_min: numeric('height_min', 100, 250),
    height_max: numeric('height_max', 100, 250),
    weight: numeric('weight', 50, 500),
    weight_min: numeric('weight_min', 50, 500),
    weight_max: numeric('weight_max', 50, 500),
    wechat: string(v.wechat, 64),
    introduction: string(v.introduction, 500),
    consent: bool(v.consent),
  }
  for (const field of ['age', 'height', 'weight'] as const) {
    const min = draft[`${field}_min`]
    const max = draft[`${field}_max`]
    if (min && max && min > max) invalid()
  }
  return draft
}

export function parseMatchmakingAccountProfile(value: unknown): MatchmakingAccountProfile {
  const v = record(value)
  const version = integer(v.version)
  if (version === 0 && v.profile == null) return { version }
  if (version === 0 || v.profile == null) invalid()
  const profile = parseMatchmakingProfileDraft(v.profile)
  if (profile.consent) invalid()
  return { version, profile }
}

export function matchmakingProfileProblem(profile: MatchmakingProfileDraft): string {
  for (const [key, label] of [
    ['name', '姓名'],
    ['gender', '性别'],
    ['education', '学历'],
    ['grade', '年级'],
    ['campus', '校区'],
    ['introduction', '自我介绍'],
  ] as const) {
    if (!profile[key].trim()) return `请填写或选择${label}。`
  }
  for (const [key, min, max, label, unit] of [
    ['age', 18, 80, '年龄', '岁'],
    ['height', 100, 250, '身高', 'cm'],
    ['weight', 50, 500, '体重', '斤'],
  ] as const) {
    const low = profile[`${key}_min`],
      high = profile[`${key}_max`]
    if (
      ![profile[key], low, high].every(
        (number) => Number.isSafeInteger(number) && number >= min && number <= max,
      )
    )
      return `${label}及期望范围须为${min}–${max}${unit}之间的整数。`
    if (low > high) return `期望${label}的最低值不能高于最高值。`
  }
  if (!profile.consent) return '请先阅读并勾选资料展示说明。'
  return ''
}

function enrollment(value: unknown): MatchmakingEnrollment {
  const v = record(value)
  return {
    id: id(v.id),
    version: integer(v.version, 1),
    status: option(v.status, ['pending', 'approved', 'rejected', 'withdrawn']),
    reason: string(v.reason, 200),
    eligible: bool(v.eligible),
    ...(v.profile === undefined ? {} : { profile: parseMatchmakingProfile(v.profile) }),
  }
}
function score(value: unknown): MatchmakingScore {
  const v = record(value)
  const points = (key: string, max: number) => {
    const n = v[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) invalid()
    return n
  }
  return {
    mbti: points('mbti', 30),
    age: points('age', 20),
    campus: points('campus', 25),
    height: points('height', 15),
    weight: points('weight', 10),
  }
}
function pair(value: unknown): MatchmakingPair {
  const v = record(value)
  const out: MatchmakingPair = {
    id: id(v.id),
    version: integer(v.version, 1),
    status: option(v.status, ['draft', 'published', 'ended']),
    score: integer(v.score, 0, 100),
    score_details: score(v.score_details),
    algorithm: string(v.algorithm, 80),
    accessible: bool(v.accessible),
    ...(v.peer === undefined ? {} : { peer: parseMatchmakingProfile(v.peer) }),
    ...(v.reason === undefined ? {} : { reason: string(v.reason, 200) }),
    ...(v.conversation_id === undefined ? {} : { conversation_id: id(v.conversation_id) }),
  }
  if (out.conversation_id && out.status !== 'published') invalid()
  if (((out.peer || out.accessible) && out.status !== 'published') || (out.peer && !out.accessible))
    invalid()
  return out
}
function task(value: unknown): MatchmakingTask {
  const v = record(value)
  const out: MatchmakingTask = {
    id: id(v.id),
    day_index: integer(v.day_index, 1, 30),
    unlocks_at: timestamp(v.unlocks_at),
    can_open: bool(v.can_open),
    ...(v.opened_at === undefined ? {} : { opened_at: timestamp(v.opened_at) }),
    ...(v.kind === undefined ? {} : { kind: option(v.kind, ['online', 'offline'] as const) }),
    ...(v.body === undefined ? {} : { body: string(v.body, 1000) }),
  }
  if ((out.kind === undefined) !== (out.body === undefined)) invalid()
  return out
}
export function parseMatchmakingDetail(value: unknown): MatchmakingDetail {
  const v = record(value)
  const out: MatchmakingDetail = {
    activity: parseMatchmakingActivity(v.activity),
    ...(v.enrollment === undefined ? {} : { enrollment: enrollment(v.enrollment) }),
    ...(v.pair === undefined ? {} : { pair: pair(v.pair) }),
    tasks: unique(array(v.tasks, 30).map(task)),
  }
  if (new Set(out.tasks.map((item) => item.day_index)).size !== out.tasks.length) invalid()
  if (out.pair?.accessible && !['active', 'ended'].includes(out.activity.phase)) invalid()
  if (
    out.tasks.some(
      (item) =>
        item.day_index > out.activity.days ||
        (item.can_open && (!item.body || out.activity.phase !== 'active')),
    )
  )
    invalid()
  if (out.tasks.some((item) => item.body !== undefined) && !out.pair?.accessible) invalid()
  // 关闭活动或撤销的关系不能夹带旧的对方卡片和任务正文。
  if (
    out.activity.status !== 'published' &&
    (out.pair?.peer ||
      out.pair?.conversation_id ||
      out.tasks.some((item) => item.body !== undefined))
  )
    invalid()
  return out
}
export function parseMatchmakingPage(value: unknown): MatchmakingPage {
  const v = record(value)
  const out = {
    items: unique(array(v.items, 50).map(parseMatchmakingActivity)),
    total: integer(v.total),
  }
  if (out.items.length > out.total) invalid()
  return out
}
export function parseMatchmakingReceipt(value: unknown): { id: string } {
  return { id: id(record(value).id) }
}

export function matchmakingPhaseLabel(phase: ActivityPhase): string {
  return {
    draft: '准备中',
    cancelled: '活动已取消',
    upcoming: '即将开始报名',
    registration: '正在报名',
    matching: '配对进行中',
    active: '活动进行中',
    ended: '活动已结束',
  }[phase]
}
export function matchmakingEnrollmentLabel(status: MatchmakingEnrollment['status']): string {
  return {
    pending: '报名资料待审核',
    approved: '报名审核已通过',
    rejected: '报名资料需修改',
    withdrawn: '已退出本次活动',
  }[status]
}
export function canEditMatchmaking(detail: MatchmakingDetail): boolean {
  return (
    detail.activity.phase === 'registration' &&
    detail.activity.status === 'published' &&
    (!detail.pair || detail.pair.status === 'ended')
  )
}
export function matchmakingKey(): string {
  return `matchmaking-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
