<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import { beijingTime, capsuleStatus } from '@/utils/capsules'
import type { Capsule, CapsuleSummary } from '@/types/whispers'
const id = ref('')
const record = ref<Capsule | CapsuleSummary | null>(null)
const page = useWhisperPage(() => {
  record.value = null
})
const { busy, writing, retryReady, notice, error } = page
const locked = computed(() => busy.value || writing.value || retryReady.value)
function allowed(action: string) {
  return (
    canWhisperAction('Capsule', record.value, action) ||
    canWhisperAction('CapsuleSummary', record.value, action)
  )
}
async function load() {
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后读取本人胶囊。')
    const result = await callWhisper('whisperCapsuleGet', { path: { capsule_id: id.value } })
    if (!active()) return
    if (result.id !== id.value) throw new Error('胶囊目标不匹配，请刷新。')
    record.value = result
  })
}
async function command(operation: 'whisperCapsuleCancel' | 'whisperCapsuleDelete') {
  const current = record.value
  if (locked.value || !current || !allowed(operation)) return
  await page.write(
    operation,
    {
      path: { capsule_id: current.id },
      data: { expected_version: current.version },
      key: whisperKey(),
    },
    (result) => {
      // 命令返回元数据，立即丢弃此前已解锁正文。
      record.value = null
      if (result.id !== id.value) throw new Error('胶囊回执目标不匹配，请刷新。')
      record.value = result
      notice.value = '请求已受理，当前状态：' + capsuleStatus(result)
    },
    load,
  )
}
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
})
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">本人胶囊详情</text>
    <navigator url="/pages/capsules/index">我的胶囊</navigator>
    <navigator url="/pages/whispers/help">解忧与公共援助</navigator>
    <navigator url="/pages/care/index">本人关怀与援助</navigator>
    <navigator url="/pages/safety/index">警告与申诉</navigator>
    <button :disabled="locked" @click="runPageAction(load)">刷新当前状态</button>
    <view v-if="record" class="card">
      <text>{{ capsuleStatus(record) }}</text>
      <text>预约时间（北京时间）：{{ beijingTime(record.unlock_at) }}</text>
      <text>服务端时间（北京时间）：{{ beijingTime(record.server_now) }}</text>
      <text
        v-if="record.status === 'unlocked' && record.body !== null"
        class="whitespace-pre-wrap"
        >{{ record.body }}</text
      >
      <text v-else>当前未返回可读正文；到期后请刷新，以服务端当前状态为准。</text>
      <view v-if="record.review_result?.decision === 'rejected'">
        <text>{{ record.review_result.reason }}</text
        ><text>{{ record.review_result.revision_suggestion }}</text>
        <navigator url="/pages/capsules/create">另写一个新胶囊</navigator>
      </view>
      <text>取消或删除会清除普通副本并停止相关待办，独立安全证据按既有规则处理。</text>
      <button
        v-if="allowed('whisperCapsuleCancel')"
        :disabled="locked"
        @click="runPageAction(() => command('whisperCapsuleCancel'))"
      >
        取消此胶囊并清除普通副本
      </button>
      <button
        v-if="allowed('whisperCapsuleDelete')"
        :disabled="locked"
        @click="runPageAction(() => command('whisperCapsuleDelete'))"
      >
        删除此胶囊普通副本
      </button>
    </view>
    <button v-if="retryReady" :disabled="writing" @click="runPageAction(page.retry)">
      使用原请求重试
    </button>
    <text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
