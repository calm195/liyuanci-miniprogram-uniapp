<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { RequestError } from '@/utils/request'
import { canWhisperAction, createWhisperScope, whisperKey } from '@/utils/whispers'
import type { Workspace } from '@/types/whispers'
import { updateProfile, listBlocks, getBlockWorkspace } from '@/api/settings'
import { getPublicProfile } from '@/api/applications'
import { getWish } from '@/api/wishes'
import { getStory } from '@/api/stories'
import type { UserInfo } from '@/types/api'
import type { BlockEntry } from '@/types/settings'
const user = useUserStore()
const me = ref<UserInfo | null>(null)
const workspace = ref<Workspace | null>(null)
const retryReady = ref(false)
let scope: ReturnType<typeof createWhisperScope> | null = null
const nickname = ref('')
// 字段缺省时保持未知，禁止把省略擅自解释成公开或隐藏。
const hidden = ref<boolean | null>(null)
const blocks = ref<BlockEntry[]>([])
const cursor = ref<string | null>(null)
const blocksReady = ref(false)
const targetId = ref('')
const sourceId = ref('')
const sourceKind = ref('')
const targetName = ref('')
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const notice = ref('')
const readEpoch = ref(-1)
let visible = false
let generation = 0
const seen = new Set<string>()
const currentMe = computed(() =>
  user.validated && readEpoch.value === session.getEpoch() && me.value?.id === user.user?.id
    ? me.value
    : null,
)
const rows = computed(() => (currentMe.value && blocksReady.value ? blocks.value : []))
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
function blockAllowed() {
  return (
    !!currentMe.value && canWhisperAction('Workspace', workspace.value, 'interactionBlockCreate')
  )
}
function unblockAllowed(entry: BlockEntry) {
  return !!currentMe.value && canWhisperAction('BlockEntry', entry, 'interactionBlockDelete')
}
function clear() {
  workspace.value = null
  me.value = null
  nickname.value = ''
  hidden.value = null
  blocks.value = []
  cursor.value = null
  blocksReady.value = false
  targetName.value = ''
  readEpoch.value = -1
  seen.clear()
}
async function load(more = false) {
  if (busy.value || writing.value || (more && (!currentMe.value || !cursor.value))) return
  const current = ++generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const active = () =>
    visible && current === generation && epoch === session.getEpoch() && owner === user.user?.id
  const next = more ? cursor.value! : undefined
  if (!more) clear()
  error.value = ''
  if (config.useMock || !session.getToken() || !owner) {
    error.value = config.useMock ? '个人设置需连接真实服务。' : '请登录后管理个人资料。'
    return
  }
  if (!scope) scope = createWhisperScope()
  busy.value = true
  try {
    if (!more) {
      await user.refresh(false)
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
      hidden.value =
        typeof result.hide_identity_tags === 'boolean' ? result.hide_identity_tags : null
      readEpoch.value = epoch
    }
    {
      try {
        if (!more) {
          const result = await getBlockWorkspace()
          if (!active()) return
          workspace.value = result
        }
        const page = await listBlocks(next)
        if (!active()) return
        if (
          !Array.isArray(page.items) ||
          page.items.some(
            (item) => !item.block_id || !Number.isInteger(item.version) || item.version < 1,
          ) ||
          !(
            page.next_cursor === null ||
            (typeof page.next_cursor === 'string' && page.next_cursor.length > 0)
          ) ||
          (page.next_cursor && (page.next_cursor === next || seen.has(page.next_cursor)))
        )
          throw new Error('黑名单列表无效')
        if (next) seen.add(next)
        const merged = new Map((more ? blocks.value : []).map((item) => [item.block_id, item]))
        for (const item of page.items) merged.set(item.block_id, item)
        blocks.value = [...merged.values()]
        cursor.value = page.next_cursor
        blocksReady.value = true
      } catch (failure) {
        if (!active()) return
        workspace.value = null
        blocks.value = []
        cursor.value = null
        blocksReady.value = false
        error.value =
          failure instanceof RequestError && failure.error_code === 'CLIENT_UPGRADE_REQUIRED'
            ? '当前客户端需要更新，请升级后管理黑名单。'
            : '黑名单暂不可读取，请刷新后重试。'
      }
    }
    if (!more && targetId.value && targetId.value !== owner && blockAllowed()) {
      try {
        let profile
        // 从当前公开投影核对作者，禁止用路由昵称或历史正文确认拉黑对象。
        if (sourceId.value && sourceKind.value === 'wish') {
          const result = await getWish(sourceId.value)
          if (
            result.id === sourceId.value &&
            result.current_state === 'published' &&
            !result.privacy_review_required
          )
            profile = result.public?.author
        } else if (sourceId.value && sourceKind.value === 'story') {
          const result = await getStory(sourceId.value)
          if (result.id === sourceId.value) profile = result.author
        } else {
          profile = (await getPublicProfile(targetId.value)).profile
        }
        if (active() && profile?.id === targetId.value) targetName.value = profile.nickname
      } catch {
        if (active()) error.value = '目标主页暂不可读取，不能确认拉黑对象。'
      }
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
async function act(action: 'profile' | 'block' | 'unblock', entry?: BlockEntry) {
  if (busy.value || writing.value || retryReady.value || !currentMe.value) return
  const permitted = () =>
    action === 'profile'
      ? allowed('putMeProfile')
      : action === 'block'
        ? blockAllowed() && !!targetName.value && targetId.value !== currentMe.value?.id
        : unblockAllowed(entry!) && !!entry && rows.value.includes(entry)
  if (!permitted()) return
  if (action === 'profile' && (!nickname.value.trim() || typeof hidden.value !== 'boolean')) {
    error.value = '请填写非空白昵称，并明确选择身份标签是否隐藏。'
    return
  }
  const snapshot = currentMe.value
  const input = {
    nickname: nickname.value,
    hide_identity_tags: hidden.value as boolean,
    expected_version: snapshot.version,
  }
  const target = targetId.value
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
    const content =
      action === 'profile'
        ? '将保存昵称与身份标签显示设置。是否继续？'
        : action === 'block'
          ? `拉黑“${targetName.value}”后，双方不能新增申请、私聊、暖评或抱抱，旧的未匹配申请和待审消息会失效；现有匹配需另行退出。是否继续？`
          : '解除后不会恢复旧申请、旧消息或已解除的匹配。是否继续？'
    if (
      !(await confirm(
        action === 'profile' ? '保存资料' : action === 'block' ? '确认拉黑' : '解除拉黑',
        content,
      )) ||
      !active() ||
      !permitted() ||
      currentMe.value !== snapshot
    )
      return
    refresh = true
    const key = whisperKey()
    if (action === 'profile') {
      const result = await updateProfile(input, key)
      if (result.id !== snapshot.id) throw new Error('资料目标不匹配')
    } else if (action === 'block') {
      await scope!.send('interactionBlockCreate', {
        data: { source: { kind: 'public_profile', id: target } },
        key,
      })
    } else
      await scope!.send('interactionBlockDelete', {
        path: { block_id: entry!.block_id },
        data: { expected_version: entry!.version },
        key,
      })
    if (active()) notice.value = '操作已受理，已重新读取当前设置。'
  } catch (failure) {
    if (active()) {
      retryReady.value = !!scope?.pending.value
      refresh = !retryReady.value
      notice.value =
        failure instanceof RequestError && failure.error_code === 'CLIENT_UPGRADE_REQUIRED'
          ? '当前客户端需要更新，请升级后管理黑名单。'
          : failure instanceof RequestError && failure.statusCode === 409
            ? '版本或状态已变化，已重新读取；请核对后手动操作。'
            : retryReady.value
              ? '操作结果尚未确认，可使用原请求重试；离开页面将清理待确认请求。'
              : '操作结果尚未确认，请核对重新读取的设置；不会自动重发。'
    }
  } finally {
    if (active()) {
      writing.value = false
      if (refresh) await load()
    }
  }
}
async function retryWrite() {
  if (!retryReady.value || writing.value || !scope || !currentMe.value) return
  const current = generation
  const epoch = session.getEpoch()
  writing.value = true
  try {
    await scope.retry()
    if (visible && current === generation && epoch === session.getEpoch()) {
      retryReady.value = false
      notice.value = '操作已受理，已重新读取当前设置。'
    }
  } catch (failure) {
    if (visible && current === generation && epoch === session.getEpoch()) {
      retryReady.value = !!scope.pending.value
      notice.value =
        failure instanceof RequestError && failure.error_code === 'CLIENT_UPGRADE_REQUIRED'
          ? '当前客户端需要更新，请升级后管理黑名单。'
          : retryReady.value
            ? '操作结果仍未确认，可继续原请求重试。'
            : '状态已变化，请刷新核对后重新操作。'
    }
  } finally {
    if (visible && current === generation && epoch === session.getEpoch()) {
      writing.value = false
      if (!retryReady.value) await load()
    }
  }
}
function closeScope() {
  scope?.close()
  scope = null
  retryReady.value = false
}
function leave() {
  closeScope()
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
    closeScope()
    generation++
    clear()
    busy.value = false
    writing.value = false
  },
  { flush: 'sync' },
)
onLoad((query) => {
  targetId.value = typeof query?.targetId === 'string' ? query.targetId : ''
  sourceId.value = typeof query?.sourceId === 'string' ? query.sourceId : ''
  sourceKind.value = typeof query?.sourceKind === 'string' ? query.sourceKind : ''
})
onShow(() => {
  closeScope()
  scope = createWhisperScope()
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <AppPage>
    <ThemeSwitcher />
    <navigator url="/pages/deletion/index">账号注销与删除进度</navigator>
    <text class="title">个人资料与隐私</text>
    <button :disabled="busy || writing" @click="runPageAction(() => load())">
      刷新设置（清空未保存修改）
    </button>
    <text v-if="busy">加载中…</text>
    <view v-if="currentMe" class="card">
      <text>昵称</text>
      <input
        v-model="nickname"
        placeholder-class="field-placeholder"
        :maxlength="-1"
        :disabled="busy || writing || !allowed('putMeProfile')"
        placeholder="填写昵称"
      />
      <text>身份标签显示</text>
      <text>隐藏后，公开内容与公开主页不展示身份标签；学生认证信息不在这里编辑。</text>
      <text v-if="hidden === null">当前设置未返回，请明确选择后保存。</text>
      <button
        :disabled="busy || writing || !allowed('putMeProfile')"
        @click="runPageAction(() => (hidden = true))"
      >
        {{ hidden === true ? '已选择：隐藏身份标签' : '隐藏身份标签' }}
      </button>
      <button
        :disabled="busy || writing || !allowed('putMeProfile')"
        @click="runPageAction(() => (hidden = false))"
      >
        {{ hidden === false ? '已选择：显示身份标签' : '显示身份标签' }}
      </button>
      <button
        v-if="allowed('putMeProfile')"
        :disabled="busy || writing"
        @click="runPageAction(() => act('profile'))"
      >
        保存资料与隐私设置
      </button>
      <text v-else>当前账号没有修改资料的权限。</text>
    </view>
    <view v-if="currentMe" class="card">
      <text>黑名单</text>
      <text
        >可从他人公开主页进入拉黑。列表不展示账号或内容来源。解除拉黑不会恢复旧申请、旧消息或已取消暖评。</text
      >
      <view v-if="targetName && blockAllowed()">
        <text>当前选择：{{ targetName }}</text>
        <button
          :disabled="busy || writing || retryReady"
          @click="runPageAction(() => act('block'))"
        >
          拉黑此用户
        </button>
      </view>
      <view v-for="(entry, index) in rows" :key="entry.block_id" class="mt-3">
        <text>{{ entry.label }} {{ index + 1 }}</text>
        <button
          v-if="unblockAllowed(entry)"
          :disabled="busy || writing"
          @click="runPageAction(() => act('unblock', entry))"
        >
          解除拉黑
        </button>
      </view>
      <text v-if="blocksReady && !rows.length">暂无拉黑记录</text>
      <button
        v-if="cursor && blocksReady"
        :disabled="busy || writing"
        @click="runPageAction(() => load(true))"
      >
        加载下一页
      </button>
    </view>
    <button v-if="retryReady" :disabled="busy || writing" @click="runPageAction(retryWrite)">
      使用原请求重试
    </button>
    <text v-if="notice" class="notice">{{ notice }}</text>
    <text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
