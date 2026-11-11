<script setup lang="ts">
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import { matchmakingID, matchmakingMbtis } from '@/utils/matchmaking'
import ProfileAvatar from '@/components/ProfileAvatar.vue'
import { deleteAvatar, maxAvatarBytes, uploadAvatar } from '@/api/avatar'
import { computed, ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { useProfileDraftStore } from '@/stores/profile-drafts'
import { RequestError } from '@/utils/request'
import { whisperKey } from '@/utils/whispers'
import { updateProfile } from '@/api/settings'
import type { ProfileUpdate } from '@/types/settings'
import type { UserInfo } from '@/types/api'
import { campuses, genders } from '@/types/wish'
import type { IdentityTags } from '@/types/wish'
const user = useUserStore()
const drafts = useProfileDraftStore()
const activity = ref('')
onLoad((query) => {
  if (matchmakingID(query?.activity)) activity.value = query.activity
})
async function returnToActivity() {
  if (!activity.value) return
  if ((hasUnsavedChanges.value || gradeNumberError.value) && !(await act())) return
  uni.navigateBack({
    fail: () => uni.redirectTo({ url: `/pages/matchmaking/detail?id=${activity.value}` }),
  })
}
const me = ref<UserInfo | null>(null)
const nickname = ref('')
const mbti = ref('')
const personalityTypes = ['', ...matchmakingMbtis]
const personalityLabels = ['未设置', ...matchmakingMbtis]
const assessmentURL = 'https://www.16personalities.com/ch/人格测试'

function selectPersonality(event: { detail: { value: string | number } }) {
  const value = personalityTypes[Number(event.detail.value)]
  if (!busy.value && allowed('putMeProfile') && value !== undefined) {
    mbti.value = value
    queueSave()
  }
}

function copyAssessment() {
  const current = generation
  const epoch = session.getEpoch()
  const active = () => visible && current === generation && epoch === session.getEpoch()
  uni.setClipboardData({
    data: assessmentURL,
    showToast: false,
    success: () => {
      if (active()) notice.value = '链接已复制，可在浏览器中打开。'
    },
    fail: () => {
      if (active()) error.value = '复制失败，可长按选中网址。'
    },
  })
}
const avatarDraft = ref('')
const selectingAvatar = ref(false)
let avatarPickerHid = false
let finishAvatarPicker: (() => void) | undefined
const avatarError = ref('')
const avatarPending = ref<{ path: string; version: number; key: string } | null>(null)
const identityCampus = ref<IdentityTags['campus']>('any')
const identityGrade = ref('')
const enrollmentYear = ref(0)
const educationLevel = ref<NonNullable<ProfileUpdate['education_level']>>('')
const gradeOverride = ref('')
const gradeNumberError = ref('')
const educationOptions = [
  { code: '', label: '未填写' },
  { code: 'undergraduate', label: '本科' },
  { code: 'master', label: '硕士研究生' },
  { code: 'doctor', label: '博士研究生' },
] as const
function currentAcademicYear() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return date.getUTCFullYear() - (date.getUTCMonth() < 8 ? 1 : 0)
}
const academicYear = ref(currentAcademicYear())
const enrollmentYears = computed(() =>
  Array.from({ length: academicYear.value - 1949 }, (_, index) => academicYear.value - index),
)
function selectYear(event: { detail: { value: string | number } }) {
  enrollmentYear.value = enrollmentYears.value[Number(event.detail.value)] ?? 0
  queueSave()
}
function selectEducation(event: { detail: { value: string | number } }) {
  const selected = educationOptions[Number(event.detail.value)]?.code
  if (!selected) return
  educationLevel.value = selected
  gradeOverride.value = ''
  gradeNumberError.value = ''
  queueSave()
}
function adjustGradeNumber(event: unknown) {
  if (busy.value || writing.value || !allowed('putMeProfile')) return
  const raw = (event as { detail?: { value?: unknown } }).detail?.value
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) {
    restoreAutomaticGrade()
    return
  }
  const year = Number(value)
  if (!Number.isSafeInteger(year) || year < 1 || year > 100) {
    cancelSave()
    gradeNumberError.value = '手动年级须为1–100之间的整数。'
    error.value = gradeNumberError.value
    return
  }
  const prefix = educationLevel.value === 'doctor' ? 'doctoral' : educationLevel.value
  if (!prefix) return
  gradeOverride.value = `${prefix}_${year}`
  gradeNumberError.value = ''
  queueSave()
}
function restoreAutomaticGrade() {
  gradeOverride.value = ''
  gradeNumberError.value = ''
  queueSave()
}

const gradeOptions = computed(() => [
  { code: '', label: '未填写' },
  ...(currentMe.value?.grade_options ?? []).filter(
    (item) =>
      !educationLevel.value ||
      item.code.startsWith(
        educationLevel.value === 'doctor' ? 'doctoral_' : `${educationLevel.value}_`,
      ),
  ),
])
const automaticGradePreview = computed(() => {
  if (!enrollmentYear.value || !educationLevel.value) return ''
  const label = educationOptions.find((item) => item.code === educationLevel.value)?.label
  return `${label}第${academicYear.value - enrollmentYear.value + 1}学年`
})
const identityGender = ref<IdentityTags['gender']>('undisclosed')
// 字段缺省时保持未知，禁止把省略擅自解释成公开或隐藏。
const hidden = ref<boolean | null>(null)
const busy = ref(false)
const writing = ref(false)
const saving = ref(false)
const profilePending = ref<{ input: ProfileUpdate; key: string } | null>(null)
let saveTimer: ReturnType<typeof globalThis.setTimeout> | undefined
let saveQueued = false
const error = ref('')
const notice = ref('')
const readEpoch = ref(-1)
let visible = false
let generation = 0
const currentMe = computed(() =>
  user.validated && readEpoch.value === session.getEpoch() && me.value?.id === user.user?.id
    ? me.value
    : null,
)
function allowed(action: string) {
  return !!(
    !config.useMock &&
    currentMe.value &&
    Number.isInteger(currentMe.value.version) &&
    currentMe.value.version > 0 &&
    currentMe.value.allowed_actions.includes(action) &&
    user.user?.allowed_actions.includes(action) &&
    readEpoch.value === session.getEpoch()
  )
}
function selectTag(
  kind: 'campus' | 'gender' | 'grade',
  event: { detail: { value: string | number } },
) {
  if (busy.value || !allowed('putMeProfile')) return
  const index = Number(event.detail.value)
  if (kind === 'campus') identityCampus.value = campuses[index]?.value || 'any'
  else if (kind === 'grade') {
    gradeOverride.value = gradeOptions.value[index]?.code ?? gradeOverride.value
    gradeNumberError.value = ''
  } else identityGender.value = genders[index]?.value || 'undisclosed'
  queueSave()
}
function clear() {
  cancelSave()
  profilePending.value = null
  me.value = null
  nickname.value = ''
  mbti.value = ''
  avatarDraft.value = ''
  selectingAvatar.value = false
  avatarPickerHid = false
  finishAvatarPicker?.()
  finishAvatarPicker = undefined
  avatarError.value = ''
  avatarPending.value = null
  identityCampus.value = 'any'
  identityGrade.value = ''
  enrollmentYear.value = 0
  educationLevel.value = ''
  gradeOverride.value = ''
  gradeNumberError.value = ''
  identityGender.value = 'undisclosed'
  hidden.value = null
  readEpoch.value = -1
}
async function load() {
  if (busy.value || writing.value || selectingAvatar.value) return
  const current = ++generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const active = () =>
    visible && current === generation && epoch === session.getEpoch() && owner === user.user?.id
  error.value = ''
  if (config.useMock || !session.getToken() || !owner) {
    clear()
    error.value = config.useMock ? '个人设置需连接真实服务。' : '请登录后管理个人资料。'
    return
  }
  busy.value = true
  try {
    await user.refresh(false, true)
    if (!active()) return
    const result = user.user
    if (
      !user.validated ||
      !result ||
      result.id !== owner ||
      !Number.isInteger(result.version) ||
      result.version < 1
    )
      throw new Error('本人资料无效')
    me.value = { ...result, allowed_actions: [...result.allowed_actions] }
    nickname.value = result.nickname ?? ''
    mbti.value = result.mbti ?? ''
    identityCampus.value = result.identity_tags?.campus || 'any'
    identityGrade.value = result.identity_tags?.grade ?? ''
    enrollmentYear.value = result.enrollment_year ?? 0
    educationLevel.value = result.education_level ?? ''
    gradeOverride.value = result.grade_override ?? ''
    gradeNumberError.value = ''
    identityGender.value = result.identity_tags?.gender || 'undisclosed'
    hidden.value = typeof result.hide_identity_tags === 'boolean' ? result.hide_identity_tags : null
    readEpoch.value = epoch
    const draft = drafts.readCommon()
    if (draft) {
      const values = draft.values
      nickname.value = values.nickname ?? nickname.value
      mbti.value = values.mbti ?? mbti.value
      hidden.value = values.hide_identity_tags ?? hidden.value
      identityCampus.value = values.identity_tags?.campus ?? identityCampus.value
      identityGender.value = values.identity_tags?.gender ?? identityGender.value
      enrollmentYear.value = values.enrollment_year ?? enrollmentYear.value
      educationLevel.value = values.education_level ?? educationLevel.value
      gradeOverride.value = values.grade_override ?? gradeOverride.value
      profilePending.value = draft.pending
      drafts.saveCommon(null)
    }
  } catch {
    if (active()) {
      clear()
      error.value = '个人资料暂不可读取，请重新登录或刷新。'
    }
  } finally {
    if (current === generation) busy.value = false
  }
}
function confirm(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) =>
    uni.showModal({
      title,
      content,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  )
}
async function chooseAvatar() {
  if (busy.value || writing.value || selectingAvatar.value || !allowed('putMeProfile')) return
  const current = generation
  const epoch = session.getEpoch()
  const active = () => visible && current === generation && epoch === session.getEpoch()
  selectingAvatar.value = true
  avatarError.value = ''
  try {
    const image = await new Promise<{ tempFilePath: string; size: number } | undefined>(
      (resolve, reject) => {
        const afterShow = (finish: () => void) => {
          // 原生选图回调可能早于页面恢复，等页面可见再校验、保存和展示结果。
          if (active() && avatarPickerHid) finishAvatarPicker = finish
          else finish()
        }
        uni.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: (result) => afterShow(() => resolve(result.tempFiles[0])),
          fail: (failure) =>
            afterShow(() => {
              if (failure.errMsg?.includes('cancel')) resolve(undefined)
              else reject(new Error('无法打开相册或相机，请检查权限后重试。'))
            }),
        })
      },
    )
    if (!active() || !image?.tempFilePath) return
    if (!Number.isSafeInteger(image.size) || image.size < 1 || image.size > maxAvatarBytes)
      throw new Error('请选择不超过 2 MiB 的图片。')
    const result = await uni.getImageInfo({ src: image.tempFilePath })
    if (!active()) return
    if (!['jpeg', 'jpg', 'png'].includes((result.type || '').toLowerCase()))
      throw new Error('请选择 JPG 或 PNG 格式的头像。')
    if (
      !Number.isSafeInteger(result.width) ||
      !Number.isSafeInteger(result.height) ||
      result.width <= 20 ||
      result.height <= 20
    )
      throw new Error('头像宽高须大于20像素，建议选择256像素以上的清晰图片。')
    if (result.width * result.height > 4 * 1024 * 1024)
      throw new Error('头像像素过大，请裁剪或降低分辨率后重试。')
    avatarDraft.value = image.tempFilePath
    avatarPending.value = null
  } catch (failure) {
    if (active())
      avatarError.value = failure instanceof Error ? failure.message : '图片无法读取，请重新选择。'
    return
  } finally {
    if (active()) selectingAvatar.value = false
  }
  if (active()) await changeAvatar()
}
async function changeAvatar(remove = false) {
  const snapshot = currentMe.value
  if (!snapshot || busy.value || writing.value || selectingAvatar.value || !allowed('putMeProfile'))
    return
  const path = remove ? '' : avatarDraft.value
  if (remove ? !snapshot.avatar_id && !snapshot.avatar_url : !path) return
  const current = generation
  const epoch = session.getEpoch()
  const active = () =>
    visible &&
    current === generation &&
    epoch === session.getEpoch() &&
    snapshot.id === user.user?.id
  const pending = avatarPending.value?.path === path ? avatarPending.value : null
  writing.value = true
  avatarError.value = ''
  notice.value = ''
  let reload = false
  try {
    if (remove && !pending && !(await confirm('恢复默认头像', '确定使用默认头像？'))) return
    if (!active() || !allowed('putMeProfile')) return
    const command = pending ?? { path, version: snapshot.version, key: whisperKey() }
    avatarPending.value = command
    const result = path
      ? await uploadAvatar(path, command.version, command.key)
      : await deleteAvatar(command.version, command.key)
    if (!active()) return
    const expectedReceiptVersion = command.version + 1
    if (
      result?.id !== snapshot.id ||
      !Number.isSafeInteger(result.version) ||
      result.version < expectedReceiptVersion ||
      !Array.isArray(result.allowed_actions) ||
      (result.version === expectedReceiptVersion &&
        (path ? !result.avatar_id : !!(result.avatar_id || result.avatar_url)))
    )
      throw new Error('头像操作结果尚未确认，请使用原请求重试。')
    const updated = user.acceptAvatarProfile(result, epoch)
    if (!updated) return
    me.value = { ...updated, allowed_actions: [...updated.allowed_actions] }
    avatarPending.value = null
    avatarDraft.value = ''
    if (updated.version > expectedReceiptVersion) notice.value = '已同步当前头像。'
    else if (path && !updated.avatar_url)
      notice.value = '头像已更新，图片暂不可读取，可下拉重试加载。'
    else notice.value = path ? '头像已更新。' : '已恢复默认头像。'
  } catch (failure) {
    if (!active()) return
    if (failure instanceof RequestError && failure.error_code === 'UPLOAD_DOMAIN_NOT_ALLOWED') {
      avatarError.value = '微信未授权此头像上传地址，请联系管理员核对上传域名。'
    } else if (failure instanceof RequestError && failure.error_code === 'UPLOAD_FILE_UNREADABLE') {
      avatarPending.value = null
      avatarDraft.value = ''
      avatarError.value = '微信无法读取所选图片，请重新选择头像。'
    } else if (failure instanceof RequestError && failure.error_code === 'UPLOAD_TIMEOUT') {
      avatarError.value = '等待头像保存结果超时，请使用原请求重试确认。'
    } else if (failure instanceof RequestError && failure.error_code === 'VERSION_CONFLICT') {
      avatarPending.value = null
      avatarError.value = '个人资料已变化，刷新后可以重新提交头像。'
      reload = true
    } else if (failure instanceof RequestError && failure.error_code === 'STATE_CONFLICT') {
      avatarError.value = '头像操作仍在处理，请稍后使用原请求重试。'
    } else if (failure instanceof RequestError && failure.statusCode === 429) {
      avatarError.value = '头像操作过于频繁，请稍后使用原请求重试。'
    } else if (
      failure instanceof RequestError &&
      failure.statusCode >= 400 &&
      failure.statusCode < 500 &&
      failure.statusCode !== 429
    ) {
      avatarPending.value = null
      avatarError.value =
        failure.statusCode === 413
          ? '请选择不超过 2 MiB 的图片。'
          : '头像未保存，请检查图片格式、尺寸和当前账号权限后重试。'
    } else {
      avatarError.value =
        failure instanceof Error && !(failure instanceof RequestError)
          ? failure.message
          : failure instanceof RequestError && failure.statusCode >= 500
            ? '头像保存服务暂不可用，请稍后使用原请求重试确认。'
            : '未收到头像保存回执，请使用原请求重试确认。'
    }
  } finally {
    if (active()) {
      writing.value = false
      if (reload) await refreshProfileDraft()
      if (saveQueued) queueSave()
    }
  }
}
const profileDirty = computed(() => {
  const snapshot = currentMe.value
  return (
    !!snapshot &&
    (nickname.value !== (snapshot.nickname ?? '') ||
      mbti.value !== (snapshot.mbti ?? '') ||
      identityCampus.value !== (snapshot.identity_tags?.campus || 'any') ||
      enrollmentYear.value !== (snapshot.enrollment_year ?? 0) ||
      educationLevel.value !== (snapshot.education_level ?? '') ||
      gradeOverride.value !== (snapshot.grade_override ?? '') ||
      identityGender.value !== (snapshot.identity_tags?.gender || 'undisclosed') ||
      hidden.value !== (snapshot.hide_identity_tags ?? null))
  )
})
function cancelSave() {
  globalThis.clearTimeout(saveTimer)
  saveQueued = false
}
function queueSave() {
  globalThis.clearTimeout(saveTimer)
  saveQueued = true
  saveTimer = globalThis.setTimeout(() => {
    if (!writing.value && !selectingAvatar.value) void act(false)
  }, 600)
}
function editVisibility(value: boolean) {
  hidden.value = value
  queueSave()
}

async function saveProfile(snapshot: UserInfo, active: () => boolean, epoch: number) {
  if (!profilePending.value && gradeNumberError.value) {
    error.value = gradeNumberError.value
    return
  }
  if (!profilePending.value && !!enrollmentYear.value !== !!educationLevel.value) {
    error.value = '请同时选择入学年份与学历层级。'
    return
  }
  const hiddenValue = hidden.value
  if (
    !profilePending.value &&
    (!nickname.value.trim() || [...nickname.value].length > 40 || typeof hiddenValue !== 'boolean')
  ) {
    error.value = '请填写 1–40 字的昵称，并选择是否公开展示校区、性别和年级。'
    return
  }
  const command = profilePending.value ?? {
    input: {
      nickname: nickname.value,
      mbti: mbti.value,
      ...(enrollmentYear.value ? { enrollment_year: enrollmentYear.value } : {}),
      ...(educationLevel.value ? { education_level: educationLevel.value } : {}),
      ...(gradeOverride.value !== (snapshot.grade_override ?? '')
        ? { grade_override: gradeOverride.value }
        : {}),
      identity_tags: {
        campus: identityCampus.value,
        gender: identityGender.value,
      },
      hide_identity_tags: hiddenValue as boolean,
      expected_version: snapshot.version,
    },
    key: whisperKey(),
  }
  profilePending.value = command
  try {
    const result = await updateProfile(command.input, command.key)
    if (!active()) return
    if (
      result?.id !== snapshot.id ||
      !Number.isSafeInteger(result.version) ||
      result.version <= command.input.expected_version ||
      !Array.isArray(result.allowed_actions)
    )
      throw new Error('资料回执无效')
    const updated = user.acceptAvatarProfile(result, epoch)
    if (!updated) return
    me.value = { ...updated, allowed_actions: [...updated.allowed_actions] }
    profilePending.value = null
    drafts.saveCommon(null)
    // 只用服务端值同步仍等于提交值的字段，保留请求期间的新编辑。
    if (nickname.value === command.input.nickname) nickname.value = updated.nickname ?? ''
    if (mbti.value === command.input.mbti) mbti.value = updated.mbti ?? ''
    if (hidden.value === command.input.hide_identity_tags)
      hidden.value = updated.hide_identity_tags ?? null
    if (identityCampus.value === command.input.identity_tags?.campus)
      identityCampus.value = updated.identity_tags?.campus || 'any'
    if (identityGender.value === command.input.identity_tags?.gender)
      identityGender.value = updated.identity_tags?.gender || 'undisclosed'
    identityGrade.value = updated.identity_tags?.grade ?? ''
    if (enrollmentYear.value === command.input.enrollment_year)
      enrollmentYear.value = updated.enrollment_year ?? 0
    if (educationLevel.value === command.input.education_level)
      educationLevel.value = updated.education_level ?? ''
    if (gradeOverride.value === command.input.grade_override)
      gradeOverride.value = updated.grade_override ?? ''
  } catch (failure) {
    if (!active()) return
    if (
      failure instanceof RequestError &&
      failure.statusCode === 409 &&
      failure.error_code === 'VERSION_CONFLICT'
    ) {
      profilePending.value = null
      error.value = '个人资料版本已变化，请下拉刷新后核对，再点保存。'
    } else if (
      failure instanceof RequestError &&
      failure.statusCode >= 400 &&
      failure.statusCode < 500 &&
      ![408, 409, 429].includes(failure.statusCode)
    ) {
      profilePending.value = null
      error.value = '个人资料保存失败，请检查填写内容和账号权限后重试。'
    } else {
      error.value = '个人资料保存结果尚未确认，请点保存重试。'
    }
  }
}

async function act(manual = true) {
  if (!visible || busy.value || writing.value || selectingAvatar.value) return false
  if (gradeNumberError.value && !profilePending.value) {
    error.value = gradeNumberError.value
    return false
  }
  cancelSave()
  const snapshot = currentMe.value
  const current = generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const active = () =>
    visible && current === generation && epoch === session.getEpoch() && owner === user.user?.id
  writing.value = true
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    // 保存请求保留版本与幂等键，结果未知时原样重试。
    const saveCommon = async () => {
      if (!snapshot || !allowed('putMeProfile')) return
      const retrying = !!profilePending.value
      if (retrying ? !manual : !profileDirty.value) return
      await saveProfile(snapshot, active, epoch)
      if (
        retrying &&
        active() &&
        !error.value &&
        profileDirty.value &&
        currentMe.value &&
        allowed('putMeProfile')
      )
        await saveProfile(currentMe.value, active, epoch)
    }
    await saveCommon()
    if (!active()) return false
    if (gradeNumberError.value && !error.value) error.value = gradeNumberError.value
    const saved = !hasUnsavedChanges.value && !error.value
    if (saved && manual) notice.value = '资料已保存。'
    return saved
  } finally {
    if (active()) {
      writing.value = false
      saving.value = false
      if (saveQueued) queueSave()
    }
  }
}
function preserveDraft() {
  const snapshot = currentMe.value
  if (!snapshot) return
  const values: Partial<ProfileUpdate> = {}
  if (nickname.value !== (snapshot.nickname ?? '')) values.nickname = nickname.value
  if (mbti.value !== (snapshot.mbti ?? '')) values.mbti = mbti.value
  if (hidden.value !== snapshot.hide_identity_tags && hidden.value !== null)
    values.hide_identity_tags = hidden.value
  if (
    identityCampus.value !== (snapshot.identity_tags?.campus || 'any') ||
    identityGender.value !== (snapshot.identity_tags?.gender || 'undisclosed')
  )
    values.identity_tags = { campus: identityCampus.value, gender: identityGender.value }
  if (enrollmentYear.value !== (snapshot.enrollment_year ?? 0))
    values.enrollment_year = enrollmentYear.value
  if (educationLevel.value !== (snapshot.education_level ?? ''))
    values.education_level = educationLevel.value
  if (gradeOverride.value !== (snapshot.grade_override ?? ''))
    values.grade_override = gradeOverride.value
  drafts.saveCommon(
    Object.keys(values).length || profilePending.value
      ? { values, pending: profilePending.value }
      : null,
  )
}
function leave() {
  preserveDraft()
  visible = false
  generation++
  clear()
  busy.value = false
  writing.value = false
  saving.value = false
  error.value = ''
  notice.value = ''
}
watch(
  [() => user.user?.id, () => session.getEpoch()],
  () => {
    generation++
    clear()
    busy.value = false
    writing.value = false
    saving.value = false
  },
  { flush: 'sync' },
)
onShow(() => {
  academicYear.value = currentAcademicYear()
  visible = true
  if (avatarPickerHid || selectingAvatar.value) {
    avatarPickerHid = false
    finishAvatarPicker?.()
    finishAvatarPicker = undefined
    return
  }
  void load()
})
onHide(() => {
  // 微信原生相册或相机临时遮住页面，选图回调仍需在当前会话校验并提交。
  if (selectingAvatar.value) avatarPickerHid = true
  else {
    // 离开前提交已编辑且尚未发出的内容，迟到回执仍按页面代次丢弃。
    if (saveQueued) void act(false)
    leave()
  }
})
onUnload(leave)
const hasUnsavedChanges = computed(() => !!(profileDirty.value || profilePending.value))
async function refreshProfileDraft() {
  if (busy.value || writing.value || selectingAvatar.value) return
  const snapshot = currentMe.value
  function edit<T>(field: { value: T }, saved: T) {
    const value = field.value
    return snapshot && value !== saved
      ? () => {
          field.value = value
        }
      : null
  }
  const edits = [
    edit(nickname, snapshot?.nickname ?? ''),
    edit(mbti, snapshot?.mbti ?? ''),
    edit(hidden, snapshot?.hide_identity_tags ?? null),
    edit(identityCampus, snapshot?.identity_tags?.campus || 'any'),
    edit(identityGender, snapshot?.identity_tags?.gender || 'undisclosed'),
    edit(enrollmentYear, snapshot?.enrollment_year ?? 0),
    edit(educationLevel, snapshot?.education_level ?? ''),
    edit(gradeOverride, snapshot?.grade_override ?? ''),
  ]
  const epoch = session.getEpoch()
  await load()
  if (epoch === session.getEpoch() && currentMe.value) for (const restore of edits) restore?.()
}
onPullDownRefresh(async () => {
  try {
    if (writing.value || selectingAvatar.value) return
    await refreshProfileDraft()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage>
    <text class="title">个人资料与隐私</text>
    <button
      v-if="activity"
      :disabled="writing"
      :loading="isPageActionPending('settings-return-to-activity')"
      @click="runPageAction(returnToActivity, 'settings-return-to-activity')"
    >
      保存并返回上一页
    </button>
    <navigator v-if="!user.isLoggedIn" url="/pages/login/index" class="card small-link">
      微信登录 ›
    </navigator>

    <text v-if="busy">加载中…</text>
    <view v-if="currentMe" class="card">
      <text class="section-title">账号资料与公开设置</text>
      <view class="avatar-settings">
        <ProfileAvatar :src="avatarDraft || currentMe.avatar_url" class="profile-avatar" />
        <view v-if="allowed('putMeProfile')" class="avatar-actions">
          <button
            :disabled="busy || writing || selectingAvatar"
            :loading="isPageActionPending('settings-select-avatar')"
            @click="runPageAction(chooseAvatar, 'settings-select-avatar')"
          >
            {{ avatarDraft ? '重新选图' : '选择头像' }}
          </button>
          <button
            v-if="avatarDraft && (!writing || isPageActionPending('settings-save-avatar'))"
            :disabled="busy || writing || selectingAvatar"
            :loading="isPageActionPending('settings-save-avatar')"
            @click="runPageAction(() => changeAvatar(), 'settings-save-avatar')"
          >
            重试头像上传
          </button>
          <button
            v-else-if="!avatarDraft && (currentMe.avatar_id || currentMe.avatar_url)"
            :disabled="busy || writing || selectingAvatar"
            :loading="isPageActionPending('settings-remove-avatar')"
            @click="runPageAction(() => changeAvatar(true), 'settings-remove-avatar')"
          >
            {{ avatarPending && !writing ? '重试恢复默认头像' : '恢复默认头像' }}
          </button>
        </view>
      </view>
      <text v-if="avatarDraft" class="notice">{{
        writing ? '正在保存头像…' : '当前为头像预览，保存后生效。'
      }}</text>
      <AppNotice :message="avatarError" kind="error" />
      <text>昵称</text>
      <input
        v-model="nickname"
        placeholder-class="field-placeholder"
        :maxlength="-1"
        :disabled="busy || (writing && !saving) || !allowed('putMeProfile')"
        placeholder="填写昵称"
        @input="queueSave"
      />
      <picker
        :range="campuses.map((item) => item.label)"
        :value="campuses.findIndex((item) => item.value === identityCampus)"
        :disabled="busy || (writing && !saving) || !allowed('putMeProfile')"
        @change="runPageAction(() => selectTag('campus', $event))"
        ><view
          >校区 {{ campuses.find((item) => item.value === identityCampus)?.label }}</view
        ></picker
      >
      <picker
        :range="genders.map((item) => item.label)"
        :value="genders.findIndex((item) => item.value === identityGender)"
        :disabled="busy || (writing && !saving) || !allowed('putMeProfile')"
        @change="runPageAction(() => selectTag('gender', $event))"
        ><view
          >性别 {{ genders.find((item) => item.value === identityGender)?.label }}</view
        ></picker
      >
      <text class="section-title">学籍与当前年级</text>
      <picker
        :range="enrollmentYears"
        :value="Math.max(0, enrollmentYears.indexOf(enrollmentYear))"
        :disabled="busy || writing || !allowed('putMeProfile')"
        @change="selectYear"
      >
        <view>入学年份 {{ enrollmentYear || '请选择' }}</view>
      </picker>
      <picker
        :range="educationOptions"
        range-key="label"
        :value="
          Math.max(
            0,
            educationOptions.findIndex((item) => item.code === educationLevel),
          )
        "
        :disabled="busy || writing || !allowed('putMeProfile')"
        @change="selectEducation"
      >
        <view
          >学历层级 {{ educationOptions.find((item) => item.code === educationLevel)?.label }}</view
        >
      </picker>
      <text class="muted">每年9月自动升一个年级。手动调整不会改变入学年份和学历层级。</text>
      <text v-if="automaticGradePreview" class="muted"
        >自动计算预览：{{ automaticGradePreview }}</text
      >
      <text v-if="!enrollmentYear || !educationLevel" class="muted"
        >旧年级已保留，请补全入学年份与学历层级。</text
      >
      <text
        >当前年级：{{
          gradeOptions.find((item) => item.code === identityGrade)?.label ||
          identityGrade ||
          '未填写'
        }}（{{ gradeOverride ? '手动调整' : '自动计算' }}）</text
      >
      <picker
        :range="gradeOptions"
        range-key="label"
        :value="
          Math.max(
            0,
            gradeOptions.findIndex((item) => item.code === gradeOverride),
          )
        "
        :disabled="
          busy || writing || !allowed('putMeProfile') || !enrollmentYear || !educationLevel
        "
        @change="selectTag('grade', $event)"
      >
        <view
          >手动调整年级：{{
            gradeOptions.find((item) => item.code === gradeOverride)?.label || '跟随自动计算'
          }}</view
        >
      </picker>
      <text>按年级序号调整（选填，1–100）</text>
      <input
        type="number"
        :value="gradeOverride ? gradeOverride.split('_').slice(-1)[0] : ''"
        :disabled="
          busy || writing || !allowed('putMeProfile') || !enrollmentYear || !educationLevel
        "
        placeholder="例如输入 2 表示二年级，留空恢复自动"
        @input="adjustGradeNumber"
      />
      <button
        v-if="gradeOverride"
        :disabled="busy || writing || !allowed('putMeProfile')"
        @click="restoreAutomaticGrade"
      >
        恢复自动计算
      </button>
      <text>MBTI（选填）</text>
      <picker
        :disabled="busy || (writing && !saving) || !allowed('putMeProfile')"
        :range="personalityLabels"
        :value="Math.max(0, personalityTypes.indexOf(mbti))"
        @change="selectPersonality"
      >
        <view class="personality-picker">{{ mbti || '未设置' }} ›</view>
      </picker>
      <view class="assessment">
        <text class="section-title">16Personalities 官方测评</text>
        <text class="muted">在浏览器完成测评后，可以回来手动选择四字母类型。</text>
        <text class="muted" selectable>{{ assessmentURL }}</text>
        <button @click="copyAssessment">复制官方测评链接</button>
      </view>
      <text>公开展示设置</text>
      <text>报名使用已保存的昵称、校区、性别、年级和 MBTI。</text>
      <text
        >此设置控制校区、性别和年级在公开内容及主页上的展示。MBTI 仅本人和获授权的活动可见。</text
      >
      <text v-if="hidden === null">当前设置未返回，请明确选择后保存。</text>
      <button
        :disabled="busy || (writing && !saving) || !allowed('putMeProfile')"
        :loading="isPageActionPending('pages-settings-index-button-2')"
        @click="runPageAction(() => editVisibility(true), 'pages-settings-index-button-2')"
      >
        {{ hidden === true ? '已选择：隐藏公开资料' : '隐藏公开资料' }}
      </button>
      <button
        :disabled="busy || (writing && !saving) || !allowed('putMeProfile')"
        :loading="isPageActionPending('pages-settings-index-button-3')"
        @click="runPageAction(() => editVisibility(false), 'pages-settings-index-button-3')"
      >
        {{ hidden === false ? '已选择：显示公开资料' : '显示公开资料' }}
      </button>
      <text v-if="!allowed('putMeProfile')">当前账号没有修改资料的权限。</text>
    </view>
    <text v-if="profilePending && !saving" class="notice"
      >上次保存结果尚未确认，点「保存资料」可原样重试。</text
    >
    <view v-if="allowed('putMeProfile')" class="card">
      <text class="muted">修改后自动保存，也可手动保存。</text>
      <text v-if="saving" class="muted">正在保存资料…</text>
      <text v-else-if="hasUnsavedChanges" class="muted">有改动尚未保存</text>
      <button
        :disabled="busy || writing || selectingAvatar"
        :loading="isPageActionPending('settings-save-profile')"
        @click="runPageAction(() => act(), 'settings-save-profile')"
      >
        保存资料
      </button>
    </view>
    <AppNotice :message="notice" kind="info" />
    <AppNotice :message="error" kind="error" />
    <navigator url="/pages/deletion/index" class="card">账号注销与删除进度</navigator>
  </AppPage>
</template>

<style scoped>
.avatar-settings {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 24rpx;
}
.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.avatar-actions button {
  margin: 0;
  font-size: 24rpx;
}
.profile-card,
.assessment {
  display: grid;
  gap: 20rpx;
  margin-bottom: 24rpx;
}
.assessment {
  border-top: 1rpx solid var(--theme-line);
  padding-top: 20rpx;
  margin-bottom: 0;
}
.personality-picker {
  border: 1rpx solid var(--theme-line);
  border-radius: 18rpx;
  padding: 22rpx;
}
.muted {
  font-size: 24rpx;
  line-height: 1.7;
  opacity: 0.75;
  overflow-wrap: anywhere;
}
</style>
