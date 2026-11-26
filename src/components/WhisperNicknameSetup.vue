<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { callWhisper } from '@/api/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import type { NicknameState } from '@/types/whispers'
import { whisperText } from '@/utils/whisper-content'
import { canWhisperAction, whisperKey } from '@/utils/whispers'

const props = defineProps<{ initialState: NicknameState | null; disabled?: boolean }>()
const emit = defineEmits<{ 'update:state': [value: NicknameState]; close: [] }>()
const label = ref('')
const state = ref<NicknameState | null>(null)
const page = useWhisperPage(
  () => {
    state.value = null
    label.value = ''
  },
  undefined,
  { embedded: true },
)
const { busy, writing, retryReady, notice, error } = page
const locked = computed(() => props.disabled || busy.value || writing.value || retryReady.value)
const candidate = computed(() =>
  state.value ? state.value.candidate : props.initialState?.candidate,
)
const reviewing = computed(
  () => candidate.value?.status === 'scanning' || candidate.value?.status === 'review_pending',
)
const canSave = computed(
  () =>
    !state.value?.active &&
    !reviewing.value &&
    canWhisperAction('NicknameState', state.value, 'whisperNicknameSet'),
)
const statusLabels = {
  scanning: '安全扫描中',
  review_pending: '等待人工审核',
  approved: '已通过审核',
  rejected: '未通过审核',
  restricted: '已限制',
  isolated: '安全隔离中',
}

function accept(result: NicknameState) {
  state.value = result
  emit('update:state', result)
}

async function load() {
  await page.read(async (active) => {
    const result = await callWhisper('whisperNicknameGet', {})
    if (active()) accept(result)
  })
}

async function save() {
  if (locked.value || !canSave.value || !state.value) return
  try {
    const name = whisperText(label.value, 2, 20)
    await page.write(
      'whisperNicknameSet',
      { data: { label: name, expected_version: state.value.version }, key: whisperKey() },
      (result) => {
        accept(result)
        label.value = ''
        notice.value = '昵称已保存并提交审核。'
      },
      async () => {
        await load()
        if (state.value && !error.value) label.value = name
      },
    )
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请核对树洞昵称。'
  }
}

onMounted(load)
onShow(load)
</script>
<template>
  <view class="nickname-setup">
    <text class="nickname-setup-title">配置树洞昵称</text>
    <text v-if="state?.active" class="nickname-setup-caption">
      「{{ state.active.label }}」已通过审核，可选择树洞昵称。
    </text>
    <template v-else>
      <text v-if="candidate" class="nickname-setup-caption">
        {{ candidate.label }} · {{ statusLabels[candidate.status] }}
      </text>
      <text v-if="candidate?.review_result?.decision === 'rejected'" class="ui-copy"
        >你发布的内容含有违规信息</text
      >
      <template v-if="canSave">
        <input
          v-model="label"
          class="ui-input"
          :disabled="locked"
          :maxlength="-1"
          aria-label="树洞昵称"
          placeholder="填写2至20个字"
          placeholder-class="field-placeholder"
        />
        <text class="nickname-setup-caption">昵称通过审核后可用于发帖和暖评。</text>
      </template>
      <text v-else-if="busy" class="nickname-setup-caption">正在读取昵称状态…</text>
      <text v-else-if="state && !reviewing" class="nickname-setup-caption">
        当前账号暂不能配置昵称。
      </text>
    </template>
    <view class="nickname-setup-actions">
      <button class="ui-button" :disabled="locked" @click="emit('close')">关闭</button>
      <button
        v-if="canSave && !retryReady"
        class="ui-button ui-button-primary"
        :disabled="locked || !label.trim()"
        :loading="isPageActionPending('whisper-nickname-inline-save')"
        @click="runPageAction(save, 'whisper-nickname-inline-save')"
      >
        保存昵称
      </button>
      <button
        v-if="!retryReady && (reviewing || error || (!state && !busy))"
        class="ui-button"
        :disabled="locked"
        :loading="isPageActionPending('whisper-nickname-inline-refresh')"
        @click="runPageAction(load, 'whisper-nickname-inline-refresh')"
      >
        刷新昵称状态
      </button>
      <button
        v-if="retryReady"
        class="ui-button ui-button-primary"
        :disabled="writing"
        :loading="isPageActionPending('whisper-nickname-inline-retry')"
        @click="runPageAction(page.retry, 'whisper-nickname-inline-retry')"
      >
        使用原请求重试
      </button>
    </view>
    <AppNotice :message="notice" kind="info" />
    <AppNotice :message="error" kind="error" />
  </view>
</template>
<style scoped>
.nickname-setup {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  min-width: 0;
  padding: 20rpx;
  border: 1px solid var(--theme-line);
  border-radius: 20rpx;
  background: var(--theme-canvas);
}
.nickname-setup-title,
.nickname-setup-caption,
.nickname-setup input {
  margin: 0;
}
.nickname-setup-title {
  color: var(--theme-ink);
  font-size: 28rpx;
  font-weight: 680;
}
.nickname-setup-caption {
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.5;
}
.nickname-setup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.nickname-setup-actions button {
  width: auto;
  min-height: 44px;
  margin: 0;
}
</style>
