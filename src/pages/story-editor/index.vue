<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { getWish } from '@/api/wishes'
import { writeStory, withdrawStory } from '@/api/stories'
import { canStoryAction } from '@/utils/story'
import type { StoryAction } from '@/utils/story'
import type { WishResult } from '@/types/wish'
import { wishStateLabels } from '@/utils/wish'
const user = useUserStore()
const id = ref('')
const wish = ref<WishResult | null>(null)
const body = ref('')
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const notice = ref('')
const readEpoch = ref(-1)
const readOwner = ref('')
let visible = false
let generation = 0
const currentWish = computed(() =>
  readEpoch.value === session.getEpoch() && readOwner.value === user.user?.id && user.validated
    ? wish.value
    : null,
)
function allowed(action: StoryAction) {
  return (
    readEpoch.value === session.getEpoch() &&
    !config.useMock &&
    config.wishWritesReady &&
    canStoryAction(user.user, user.validated, currentWish.value, id.value, action)
  )
}
function clear() {
  wish.value = null
  body.value = ''
  readEpoch.value = -1
  readOwner.value = ''
}
async function load() {
  if (writing.value || busy.value) return
  const current = ++generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const active = () =>
    visible && current === generation && epoch === session.getEpoch() && owner === user.user?.id
  clear()
  error.value = ''
  if (config.useMock || !session.getToken() || !id.value) {
    error.value = config.useMock ? '故事管理需连接真实服务。' : '请登录后从我的心愿进入故事管理。'
    return
  }
  busy.value = true
  try {
    await user.refresh(false)
    if (!active()) return
    const result = await getWish(id.value)
    if (!active()) return
    if (result.id !== id.value || !result.own_content || result.privacy_review_required)
      throw new Error('当前不可管理故事')
    wish.value = result
    readEpoch.value = epoch
    readOwner.value = owner || ''
  } catch {
    if (!active()) return
    clear()
    error.value = '故事状态暂不可读取，请检查登录资格或稍后刷新。'
  } finally {
    if (current === generation) busy.value = false
  }
}
function confirm(action: StoryAction): Promise<boolean> {
  return new Promise((resolve) =>
    uni.showModal({
      title: action === 'withdraw' ? '撤回故事' : '提交还愿故事',
      content:
        action === 'withdraw'
          ? '故事将停止公开，心愿仍为已还愿。是否继续？'
          : action === 'submit'
            ? '提交成功后心愿即为已还愿，故事需审核通过后公开。是否继续？'
            : '将以新正文替换故事并重新审核，旧版停止公开，心愿仍为已还愿。是否继续？',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  )
}
async function act(action: StoryAction) {
  if (busy.value || writing.value || !allowed(action)) return
  if (action !== 'withdraw' && !body.value.trim()) {
    error.value = '请填写非空白的故事正文。'
    return
  }
  const selected = currentWish.value!
  const draft = body.value
  const current = generation
  const epoch = session.getEpoch()
  const owner = user.user?.id
  const active = () =>
    visible && current === generation && epoch === session.getEpoch() && owner === user.user?.id
  writing.value = true
  error.value = ''
  notice.value = ''
  let refresh = false
  try {
    if (!(await confirm(action)) || !active() || currentWish.value !== selected || !allowed(action))
      return
    refresh = true
    const key = `story-${Date.now()}-${Math.random().toString(36).slice(2)}`
    if (action === 'withdraw') await withdrawStory(selected, key)
    else {
      const result = await writeStory(selected, draft, action === 'update', key)
      if (
        result.id !== id.value ||
        result.status !== 'pending_review' ||
        result.wish_state !== 'fulfilled'
      )
        throw new Error('故事回执无效')
    }
    if (active())
      notice.value =
        action === 'withdraw' ? '撤回已受理，心愿仍为已还愿。' : '故事已受理，审核通过后才会公开。'
  } catch (failure) {
    if (!active()) return
    notice.value =
      failure instanceof RequestError && failure.statusCode === 409
        ? '状态或版本已变化，已重新读取；请确认后手动操作。'
        : '操作结果尚未确认，请以重新读取的状态为准；不会自动重发。'
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
  () => user.user?.id,
  () => {
    generation++
    clear()
    busy.value = false
    writing.value = false
  },
  { flush: 'sync' },
)
onLoad((query) => {
  id.value = typeof query?.wishId === 'string' ? query.wishId : ''
})
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <AppPage>
    <text class="title">我的还愿故事</text>
    <button :disabled="busy || writing" @click="runPageAction(() => load())">
      刷新状态（清空输入）
    </button>
    <text v-if="busy">加载中…</text>
    <view v-if="currentWish" class="card">
      <text>心愿状态：{{ wishStateLabels[currentWish.current_state] }}</text>
      <template v-if="currentWish.story_review_result">
        <text
          >故事审核：{{
            { pending: '审核中', approved: '已通过', rejected: '未通过' }[
              currentWish.story_review_result.decision
            ]
          }}</text
        >
        <text v-if="currentWish.story_review_result.reason">{{
          currentWish.story_review_result.reason
        }}</text>
        <text v-if="currentWish.story_review_result.revision_suggestion">{{
          currentWish.story_review_result.revision_suggestion
        }}</text>
      </template>
      <text>审核通过与当前公开状态可能不同，请以公开故事入口为准。</text>
      <navigator
        v-if="currentWish.current_state === 'fulfilled'"
        :url="`/pages/stories/index?id=${encodeURIComponent(id)}`"
        >查看当前公开故事</navigator
      >
      <template v-if="allowed('submit') || allowed('update')">
        <text>请填写完整故事正文；已提交的非公开原文不会在此恢复。修改会替换全文并重新审核。</text>
        <textarea
          v-model="body"
          placeholder-class="field-placeholder"
          :maxlength="-1"
          :disabled="busy || writing"
          placeholder="写下你的还愿故事"
        />
        <button
          v-if="allowed('submit')"
          :disabled="busy || writing"
          @click="runPageAction(() => act('submit'))"
        >
          提交还愿故事
        </button>
        <button
          v-if="allowed('update')"
          :disabled="busy || writing"
          @click="runPageAction(() => act('update'))"
        >
          提交故事新版本
        </button>
      </template>
      <button
        v-if="allowed('withdraw')"
        :disabled="busy || writing"
        @click="runPageAction(() => act('withdraw'))"
      >
        撤回故事
      </button>
    </view>
    <text v-if="notice" class="notice">{{ notice }}</text>
    <text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
