<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
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
page.onRefresh(() => load())
onShow(() => {
  void load()
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading title="你的来信" />
    <template v-if="record">
      <view class="ui-section ce-group capsule-receipt">
        <image src="/static/illustrations/entry-whisper.png" class="capsule-art" mode="aspectFit" />
        <text class="ui-meta">{{ capsuleStatus(record) }}</text>
        <text class="ui-section-title">{{
          record.status === 'unlocked'
            ? '你好，现在的自己'
            : record.status === 'locked'
              ? '有一份期待，正在路上'
              : '写给自己的一封信'
        }}</text>
        <text class="ui-meta">预约时间 · {{ beijingTime(record.unlock_at) }}（北京时间）</text>
        <button
          class="ui-button"
          :disabled="locked"
          :loading="isPageActionPending('capsule-refresh')"
          @click="runPageAction(load, 'capsule-refresh')"
        >
          刷新当前状态
        </button>
      </view>
      <view
        v-if="record.status === 'unlocked' && record.body !== null"
        class="ui-section ce-group capsule-letter"
        ><text class="ui-section-title">给现在的你</text
        ><text class="ui-copy">{{ record.body }}</text></view
      >
      <text v-else-if="record.status === 'locked'" class="ui-state"
        >到预约时间后，可刷新查看。</text
      >
      <view v-if="record.review_result?.decision === 'rejected'" class="ui-section ce-group"
        ><text class="ui-section-title">审核意见</text
        ><text class="ui-copy">{{ record.review_result.reason }}</text
        ><text class="ui-copy">{{ record.review_result.revision_suggestion }}</text
        ><navigator class="ui-link" url="/pages/capsules/create">另写一个新胶囊</navigator></view
      >
      <view
        v-if="allowed('whisperCapsuleCancel') || allowed('whisperCapsuleDelete')"
        class="ui-section ce-group"
      >
        <text class="ui-section-title">管理这封信</text>
        <text class="ui-meta"
          >取消或删除会清除普通副本并停止相关待办，独立安全证据按既有规则处理。</text
        >
        <button
          v-if="allowed('whisperCapsuleCancel')"
          class="ui-button capsule-danger"
          :disabled="locked"
          :loading="isPageActionPending('pages-capsules-detail-button-2')"
          @click="
            runPageAction(() => command('whisperCapsuleCancel'), 'pages-capsules-detail-button-2')
          "
        >
          取消此胶囊并清除普通副本
        </button>
        <button
          v-if="allowed('whisperCapsuleDelete')"
          class="ui-button capsule-danger"
          :disabled="locked"
          :loading="isPageActionPending('pages-capsules-detail-button-3')"
          @click="
            runPageAction(() => command('whisperCapsuleDelete'), 'pages-capsules-detail-button-3')
          "
        >
          删除此胶囊普通副本
        </button>
      </view>
    </template>
    <button
      v-if="retryReady"
      class="ui-button ui-button-primary"
      :disabled="writing"
      :loading="isPageActionPending('pages-capsules-detail-button-4')"
      @click="runPageAction(page.retry, 'pages-capsules-detail-button-4')"
    >
      使用原请求重试
    </button>
    <AppNotice :message="notice" kind="info" /><AppNotice :message="error" kind="error" />
  </AppPage>
</template>
<style scoped>
.ui-section.ce-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  min-width: 0;
}
.ui-button.capsule-danger {
  color: var(--theme-danger);
}
.capsule-receipt {
  align-items: center;
  text-align: center;
}
.capsule-art {
  width: 144rpx;
  height: 144rpx;
  margin: 8rpx 0;
}
.capsule-letter {
  background: linear-gradient(135deg, var(--theme-peach), var(--theme-surface));
  border: 2rpx solid var(--theme-line);
}
.capsule-letter .ui-copy {
  white-space: pre-wrap;
  line-height: 1.9;
}
</style>
