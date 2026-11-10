<script setup lang="ts">
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import MatchmakingForm from '@/components/MatchmakingForm.vue'
import { useMatchmakingProfile } from '@/composables/use-matchmaking-profile'
import { matchmakingID, matchmakingMbtis } from '@/utils/matchmaking'
import ProfileAvatar from '@/components/ProfileAvatar.vue'
import { deleteAvatar, maxAvatarBytes, uploadAvatar } from '@/api/avatar'
import { computed, ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { RequestError } from '@/utils/request'
import { whisperKey } from '@/utils/whispers'
import { updateProfile } from '@/api/settings'
import type { MatchmakingPreferences } from '@/types/matchmaking'
import type { ProfileUpdate } from '@/types/settings'
import type { UserInfo } from '@/types/api'
import { campuses, genders } from '@/types/wish'
import type { IdentityTags } from '@/types/wish'
const user = useUserStore()
const activity = ref('')
onLoad((query) => {
  if (matchmakingID(query?.activity)) activity.value = query.activity
})
async function returnToActivity() {
  if (!activity.value) return
  if (hasUnsavedChanges.value && !(await act())) return
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
const gradeOptions = computed(() => [
  { code: '', label: '未填写' },
  ...(currentMe.value?.grade_options ?? []),
])
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
  else if (kind === 'grade')
    identityGrade.value = gradeOptions.value[index]?.code ?? identityGrade.value
  else identityGender.value = genders[index]?.value || 'undisclosed'
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
    identityGender.value = result.identity_tags?.gender || 'undisclosed'
    hidden.value = typeof result.hide_identity_tags === 'boolean' ? result.hide_identity_tags : null
    readEpoch.value = epoch
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
      identityGrade.value !== (snapshot.identity_tags?.grade ?? '') ||
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
function editMatchmaking(draft: MatchmakingPreferences) {
  matchmakingForm.value = draft
  queueSave()
}
function editVisibility(value: boolean) {
  hidden.value = value
  queueSave()
}

async function saveProfile(snapshot: UserInfo, active: () => boolean, epoch: number) {
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
      identity_tags: {
        campus: identityCampus.value,
        gender: identityGender.value,
        ...(identityGrade.value !== (snapshot.identity_tags?.grade ?? '')
          ? { grade: identityGrade.value }
          : {}),
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
    // 只用服务端值同步仍等于提交值的字段，保留请求期间的新编辑。
    if (nickname.value === command.input.nickname) nickname.value = updated.nickname ?? ''
    if (mbti.value === command.input.mbti) mbti.value = updated.mbti ?? ''
    if (hidden.value === command.input.hide_identity_tags)
      hidden.value = updated.hide_identity_tags ?? null
    if (identityCampus.value === command.input.identity_tags?.campus)
      identityCampus.value = updated.identity_tags?.campus || 'any'
    if (identityGender.value === command.input.identity_tags?.gender)
      identityGender.value = updated.identity_tags?.gender || 'undisclosed'
    if (
      identityGrade.value ===
      (command.input.identity_tags?.grade ?? snapshot.identity_tags?.grade ?? '')
    )
      identityGrade.value = updated.identity_tags?.grade ?? ''
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
    // 两类资料各自有版本和幂等键。一侧失败时仍提交另一侧可保存的改动。
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
    await Promise.all([saveCommon(), saveMatchmaking(manual)])
    if (!active()) return false
    const saved = !hasUnsavedChanges.value && !error.value && !matchmakingError.value
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
function leave() {
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
  visible = true
  if (avatarPickerHid || selectingAvatar.value) {
    avatarPickerHid = false
    finishAvatarPicker?.()
    finishAvatarPicker = undefined
    void Promise.resolve().then(loadMatchmaking)
    return
  }
  // 先刷新本人会话，再读取同账号的私有报名资料。
  void load().then(loadMatchmaking)
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
const {
  page: matchmakingPage,
  form: matchmakingForm,
  locked: matchmakingLocked,
  dirty: matchmakingDirty,
  save: saveMatchmaking,
  refreshDraft: refreshMatchmakingDraft,
  load: loadMatchmaking,
} = useMatchmakingProfile()
const {
  busy: matchmakingBusy,
  writing: matchmakingWriting,
  pending: matchmakingPending,
  gate: matchmakingGate,
  error: matchmakingError,
} = matchmakingPage
const hasUnsavedChanges = computed(
  () =>
    !!(
      profileDirty.value ||
      profilePending.value ||
      matchmakingDirty.value ||
      matchmakingPending.value
    ),
)
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
    edit(identityGrade, snapshot?.identity_tags?.grade ?? ''),
  ]
  const epoch = session.getEpoch()
  await load()
  if (epoch === session.getEpoch() && currentMe.value) for (const restore of edits) restore?.()
}
onPullDownRefresh(async () => {
  try {
    if (writing.value || selectingAvatar.value) return
    await refreshProfileDraft()
    await refreshMatchmakingDraft()
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
      :disabled="matchmakingWriting || writing"
      :loading="isPageActionPending('settings-return-to-activity')"
      @click="runPageAction(returnToActivity, 'settings-return-to-activity')"
    >
      返回包分配活动
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
      <picker
        :range="gradeOptions"
        range-key="label"
        :value="
          Math.max(
            0,
            gradeOptions.findIndex((item) => item.code === identityGrade),
          )
        "
        :disabled="
          busy || (writing && !saving) || !allowed('putMeProfile') || gradeOptions.length < 2
        "
        @change="runPageAction(() => selectTag('grade', $event))"
      >
        <view
          >年级
          {{ gradeOptions.find((item) => item.code === identityGrade)?.label || '暂不可选' }}</view
        >
      </picker>
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
    <text v-if="matchmakingBusy" class="notice">正在读取包分配资料…</text>
    <text v-if="user.isLoggedIn && matchmakingGate" class="notice">{{ matchmakingGate }}</text>
    <template v-if="matchmakingForm">
      <view class="card profile-card">
        <text class="section-title">包分配报名资料</text>
        <text class="muted"
          >保存后可在活动中确认报名。以下资料用于报名审核，并按报名确认的范围展示给配对对象。</text
        >
        <MatchmakingForm
          :model-value="matchmakingForm"
          :disabled="
            matchmakingBusy ||
            (matchmakingLocked && !saving) ||
            (!!matchmakingPending && !matchmakingWriting)
          "
          @update:model-value="editMatchmaking"
        />
      </view>
    </template>
    <text v-if="!saving && (profilePending || matchmakingPending)" class="notice">
      上次保存结果尚未确认，点「保存资料」可重试。
    </text>
    <view v-if="allowed('putMeProfile') || matchmakingForm || matchmakingPending" class="card">
      <text class="muted">修改后自动保存，也可手动保存两类资料。</text>
      <text v-if="saving" class="muted">正在保存资料…</text>
      <text v-else-if="hasUnsavedChanges" class="muted">有改动尚未保存</text>
      <button
        :disabled="busy || writing || selectingAvatar || matchmakingBusy || matchmakingWriting"
        :loading="isPageActionPending('settings-save-profile')"
        @click="runPageAction(() => act(), 'settings-save-profile')"
      >
        保存资料
      </button>
    </view>
    <button
      v-if="user.isLoggedIn && !matchmakingForm && !matchmakingBusy"
      :loading="isPageActionPending('settings-reload-matchmaking')"
      @click="
        runPageAction(
          () => (currentMe ? loadMatchmaking() : load().then(loadMatchmaking)),
          'settings-reload-matchmaking',
        )
      "
    >
      重新读取包分配资料
    </button>
    <AppNotice :message="matchmakingError" kind="error" />
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
