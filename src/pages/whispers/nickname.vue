<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import { whisperText } from '@/utils/whisper-content'
import type { NicknameState } from '@/types/whispers'
const module = useWhispersStore()
const state = ref<NicknameState | null>(null)
const label = ref('')
const page = useWhisperPage(() => {
  state.value = null
  label.value = ''
})
const { busy, writing, error, notice, retryReady } = page
const canSave = computed(
  () =>
    !!module.config?.enabled &&
    canWhisperAction('NicknameState', state.value, 'whisperNicknameSet'),
)
const candidateLabels = {
  scanning: '安全扫描中',
  review_pending: '等待人工审核',
  approved: '审核已通过',
  rejected: '审核未通过',
  restricted: '已限制',
  isolated: '安全隔离中',
}
async function load() {
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后管理树洞昵称。')
    await module.refresh()
    if (!active()) return
    if (!module.config?.enabled) throw new Error('树洞尚未开放或当前不可用。')
    const result = await callWhisper('whisperNicknameGet', {})
    if (active()) state.value = result
  })
}
async function save() {
  if (!canSave.value || !state.value) return
  try {
    const data = { label: whisperText(label.value, 2, 20), expected_version: state.value.version }
    await page.write(
      'whisperNicknameSet',
      { data, key: whisperKey() },
      (result) => {
        state.value = result
        label.value = ''
        notice.value = '昵称候选已受理；仅当前已审昵称可用于新内容。'
      },
      load,
    )
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请核对昵称。'
  }
}
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">树洞昵称</text>
    <text>这是独立的树洞昵称，可重名，不关联公开主页。新昵称先审后用，旧内容保留原身份快照。</text>
    <button :disabled="busy || writing || retryReady" @click="runPageAction(load)">
      刷新昵称审核状态
    </button>
    <view v-if="state" class="card">
      <text>当前已审昵称：{{ state.active?.label || '暂无' }}</text>
      <view v-if="state.candidate"
        ><text>新候选：{{ state.candidate.label }}</text
        ><text>{{ candidateLabels[state.candidate.status] }}</text
        ><text v-if="state.candidate.review_result?.reason"
          >原因：{{ state.candidate.review_result.reason }}</text
        ><text v-if="state.candidate.review_result?.revision_suggestion"
          >修改建议：{{ state.candidate.review_result.revision_suggestion }}</text
        ></view
      >
      <text
        >候选审核期间，旧已审昵称仍可用于新内容；违规版本撤销后，关联内容须更换合法展示方式重审。</text
      >
      <input
        v-if="canSave"
        v-model="label"
        :maxlength="-1"
        :disabled="busy || writing || retryReady"
        placeholder="2–20个Unicode码点"
        placeholder-class="field-placeholder"
      />
      <button v-if="canSave" :disabled="busy || writing || retryReady" @click="runPageAction(save)">
        提交昵称候选
      </button>
    </view>
    <button v-if="retryReady" :disabled="writing" @click="runPageAction(page.retry)">
      使用原请求重试
    </button>
    <text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
