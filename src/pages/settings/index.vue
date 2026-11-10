<script setup lang="ts">
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import MatchmakingForm from '@/components/MatchmakingForm.vue'
import { useMatchmakingProfile } from '@/composables/use-matchmaking-profile'
import { matchmakingID } from '@/utils/matchmaking'
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
import type { UserInfo } from '@/types/api'
import { campuses, genders } from '@/types/wish'
import type { IdentityTags } from '@/types/wish'
const user = useUserStore()
const activity = ref('')
onLoad((query) => {
  if (matchmakingID(query?.activity)) activity.value = query.activity
})
function returnToActivity() {
  if (!activity.value) return
  uni.navigateBack({
    fail: () => uni.redirectTo({ url: `/pages/matchmaking/detail?id=${activity.value}` }),
  })
}
const me = ref<UserInfo | null>(null)
const nickname = ref('')
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
  if (busy.value || writing.value || !allowed('putMeProfile')) return
  const index = Number(event.detail.value)
  if (kind === 'campus') identityCampus.value = campuses[index]?.value || 'any'
  else if (kind === 'grade')
    identityGrade.value = gradeOptions.value[index]?.code ?? identityGrade.value
  else identityGender.value = genders[index]?.value || 'undisclosed'
}
function clear() {
  me.value = null
  nickname.value = ''
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
    }
  }
}
async function act() {
  const snapshot = currentMe.value
  if (!snapshot || busy.value || writing.value || selectingAvatar.value || !allowed('putMeProfile'))
    return
  if (!nickname.value.trim() || typeof hidden.value !== 'boolean') {
    error.value = '请填写非空白昵称，并明确选择身份标签是否隐藏。'
    return
  }
  const input = {
    nickname: nickname.value,
    identity_tags: {
      campus: identityCampus.value,
      gender: identityGender.value,
      ...(identityGrade.value !== (snapshot.identity_tags?.grade ?? '')
        ? { grade: identityGrade.value }
        : {}),
    },
    hide_identity_tags: hidden.value as boolean,
    expected_version: snapshot.version,
  }
  const current = generation
  const epoch = session.getEpoch()
  const active = () =>
    visible &&
    current === generation &&
    epoch === session.getEpoch() &&
    snapshot.id === user.user?.id
  writing.value = true
  error.value = ''
  notice.value = ''
  let refresh = false
  try {
    if (
      !(await confirm('保存资料', '将保存昵称与身份标签显示设置。是否继续？')) ||
      !active() ||
      !allowed('putMeProfile') ||
      currentMe.value !== snapshot
    )
      return
    refresh = true
    const result = await updateProfile(input, whisperKey())
    if (result.id !== snapshot.id) throw new Error('资料目标不匹配')
    if (active()) notice.value = '操作已受理，已重新读取当前设置。'
  } catch (failure) {
    if (active()) {
      notice.value =
        failure instanceof RequestError && failure.statusCode === 409
          ? '版本或状态已变化，已重新读取；请核对后手动操作。'
          : '操作结果尚未确认，请核对重新读取的设置；不会自动重发。'
    }
  } finally {
    if (active()) {
      writing.value = false
      if (refresh) await load()
    }
  }
}
function leave() {
  visible = false
  generation++
  clear()
  busy.value = false
  writing.value = false
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
  else leave()
})
onUnload(leave)
const {
  page: matchmakingPage,
  form: matchmakingForm,
  grades,
  locked: matchmakingLocked,
  types,
  typeLabels,
  assessmentURL,
  selectPersonality,
  copyAssessment,
  save: saveMatchmaking,
  load: loadMatchmaking,
} = useMatchmakingProfile()
const {
  busy: matchmakingBusy,
  writing: matchmakingWriting,
  pending: matchmakingPending,
  gate: matchmakingGate,
  error: matchmakingError,
  notice: matchmakingNotice,
} = matchmakingPage
async function refreshProfileDraft() {
  if (selectingAvatar.value) return
  const draft = {
    nickname: nickname.value,
    hidden: hidden.value,
    campus: identityCampus.value,
    gender: identityGender.value,
    grade: identityGrade.value,
  }
  const epoch = session.getEpoch()
  await load()
  if (epoch === session.getEpoch() && currentMe.value) {
    nickname.value = draft.nickname
    hidden.value = draft.hidden
    identityCampus.value = draft.campus
    identityGender.value = draft.gender
    identityGrade.value = draft.grade
  }
}
onPullDownRefresh(async () => {
  try {
    await refreshProfileDraft()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage>
    <text class="title">个人资料与隐私</text>
    <button v-if="activity" :disabled="matchmakingWriting || writing" @click="returnToActivity">
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
            重试保存头像
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
        :disabled="busy || writing || !allowed('putMeProfile')"
        placeholder="填写昵称"
      />
      <picker
        :range="campuses.map((item) => item.label)"
        :value="campuses.findIndex((item) => item.value === identityCampus)"
        :disabled="busy || writing"
        @change="runPageAction(() => selectTag('campus', $event))"
        ><view
          >校区标签 {{ campuses.find((item) => item.value === identityCampus)?.label }}</view
        ></picker
      >
      <picker
        :range="genders.map((item) => item.label)"
        :value="genders.findIndex((item) => item.value === identityGender)"
        :disabled="busy || writing"
        @change="runPageAction(() => selectTag('gender', $event))"
        ><view
          >性别标签 {{ genders.find((item) => item.value === identityGender)?.label }}</view
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
        :disabled="busy || writing || !allowed('putMeProfile') || gradeOptions.length < 2"
        @change="runPageAction(() => selectTag('grade', $event))"
      >
        <view
          >年级标签
          {{ gradeOptions.find((item) => item.code === identityGrade)?.label || '暂不可选' }}</view
        >
      </picker>
      <text>身份标签显示</text>
      <text>这里的标签用于公开展示。下方报名资料仅用于包分配。</text>
      <text>隐藏后，公开内容与公开主页不展示身份标签；学生认证信息不在这里编辑。</text>
      <text v-if="hidden === null">当前设置未返回，请明确选择后保存。</text>
      <button
        :disabled="busy || writing || !allowed('putMeProfile')"
        :loading="isPageActionPending('pages-settings-index-button-2')"
        @click="runPageAction(() => (hidden = true), 'pages-settings-index-button-2')"
      >
        {{ hidden === true ? '已选择：隐藏身份标签' : '隐藏身份标签' }}
      </button>
      <button
        :disabled="busy || writing || !allowed('putMeProfile')"
        :loading="isPageActionPending('pages-settings-index-button-3')"
        @click="runPageAction(() => (hidden = false), 'pages-settings-index-button-3')"
      >
        {{ hidden === false ? '已选择：显示身份标签' : '显示身份标签' }}
      </button>
      <button
        v-if="allowed('putMeProfile')"
        :disabled="busy || writing"
        :loading="isPageActionPending('pages-settings-index-button-4')"
        @click="runPageAction(act, 'pages-settings-index-button-4')"
      >
        保存资料与隐私设置
      </button>
      <text v-else>当前账号没有修改资料的权限。</text>
    </view>
    <text v-if="matchmakingBusy" class="notice">正在读取包分配资料…</text>
    <text v-if="user.isLoggedIn && matchmakingGate" class="notice">{{ matchmakingGate }}</text>
    <template v-if="matchmakingForm">
      <view class="card profile-card">
        <text class="section-title">人格标签</text>
        <picker
          :disabled="matchmakingLocked"
          :range="typeLabels"
          :value="Math.max(0, types.indexOf(matchmakingForm.mbti))"
          @change="selectPersonality"
        >
          <view class="personality-picker">{{ matchmakingForm.mbti || '未设置' }} ›</view>
        </picker>
        <text class="muted"
          >人格标签选填，来源为本人填写。参加包分配时，标签可随本次报名资料提交。</text
        >
        <view class="assessment">
          <text class="section-title">16Personalities 官方测评</text>
          <text class="muted">在浏览器完成测评后，可以回来手动选择结果的四字母类型。</text>
          <text class="muted" selectable>{{ assessmentURL }}</text>
          <button @click="copyAssessment">复制官方测评链接</button>
        </view>
      </view>
      <view class="card profile-card">
        <text class="section-title">包分配报名资料</text>
        <text class="muted"
          >保存后可在活动中确认报名。以下资料用于报名审核，并按报名确认的范围展示给配对对象。可以先只保存人格标签。</text
        >
        <MatchmakingForm v-model="matchmakingForm" :grades="grades" :disabled="matchmakingLocked" />
      </view>
      <button
        :disabled="matchmakingLocked"
        class="profile-save"
        :loading="isPageActionPending('matchmaking-account-save')"
        @click="runPageAction(saveMatchmaking, 'matchmaking-account-save')"
      >
        保存包分配资料
      </button>
    </template>
    <view v-if="matchmakingPending" class="card profile-card">
      <text>上次保存结果尚未确认，请原样重试。</text>
      <button
        :disabled="matchmakingBusy || matchmakingWriting"
        :loading="isPageActionPending('matchmaking-account-retry')"
        @click="
          runPageAction(() => matchmakingPage.retry(loadMatchmaking), 'matchmaking-account-retry')
        "
      >
        原样重试上次操作
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
    <AppNotice :message="matchmakingNotice" kind="success" />
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
