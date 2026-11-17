<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { session } from '@/utils/session'
import { useWhispersStore } from '@/stores/whispers'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { whisperText } from '@/utils/whisper-content'
import { beijingTime, capsuleUnlockAt, capsuleStatus } from '@/utils/capsules'
import { canWhisperAction, whisperKey } from '@/utils/whispers'
import type { CapsuleSummary } from '@/types/whispers'
const module = useWhispersStore()
const body = ref('')
const date = ref('')
const time = ref('')
const second = ref('')
const accepted = ref(false)
const receipt = ref<CapsuleSummary | null>(null)
const clock = ref(0)
let receivedAt = 0
const page = useWhisperPage(() => {
  body.value = ''
  date.value = time.value = second.value = ''
  accepted.value = false
  receipt.value = null
  clock.value = receivedAt = 0
})
const { busy, writing, retryReady, error, notice } = page
const locked = computed(() => busy.value || writing.value || retryReady.value)
const canCreate = computed(
  () =>
    !receipt.value &&
    !!clock.value &&
    !!module.config?.enabled &&
    canWhisperAction('Workspace', module.workspace, 'whisperCapsuleCreate'),
)
function acceptSafety(event: unknown) {
  accepted.value = (event as { detail?: { value?: boolean } }).detail?.value === true
}
async function load() {
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后写给未来的自己。')
    await module.refresh()
    if (!active()) return
    if (!module.config?.enabled) throw new Error('胶囊暂不可新建，请稍后刷新。')
    clock.value = Date.parse(module.config.server_now)
    receivedAt = Date.now()
    const local = beijingTime(new Date(clock.value + 86400000).toISOString())
    if (!date.value) date.value = local.slice(0, 10)
    if (!time.value) time.value = local.slice(11, 16)
    if (!second.value) second.value = local.slice(17, 19)
  })
}
async function submit() {
  if (locked.value || !canCreate.value) return
  try {
    if (!accepted.value) throw new Error('请阅读并明确确认安全告知。')
    const data = {
      body: whisperText(body.value),
      unlock_at: capsuleUnlockAt(
        `${date.value} ${time.value}:${second.value}`,
        clock.value + Math.max(0, Date.now() - receivedAt),
      ),
      safety_notice_accepted: true as const,
    }
    await page.write(
      'whisperCapsuleCreate',
      { data, key: whisperKey() },
      (result) => {
        // 受理即清除输入，不把封存前的原文当作详情缓存。
        body.value = ''
        accepted.value = false
        date.value = time.value = second.value = ''
        receipt.value = result
        notice.value = '封存请求已受理，安全处理与解锁状态以当前详情为准。'
      },
      load,
    )
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请核对输入。'
  }
}
page.onRefresh(() => load())
onShow(() => {
  void load()
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding>
    <PageHeading title="写给未来的自己" description="把现在的心情，留到约定的那一天。" />
    <template v-if="!receipt">
      <view class="ui-section ce-group">
        <text class="ui-section-title">此刻想说的话</text>
        <textarea
          v-model="body"
          class="ui-textarea"
          :maxlength="-1"
          :disabled="locked"
          placeholder="最多500个字"
        />
        <text class="ui-meta">{{ Array.from(body).length }} / 500</text>
      </view>
      <view class="ui-section ce-group">
        <text class="ui-section-title">约定一个时间</text>
        <text class="ui-meta">北京时间，精确到秒</text>
        <view class="ui-field"
          ><text class="ui-label">日期</text
          ><picker
            mode="date"
            :value="date"
            :disabled="locked"
            class="ui-picker"
            @change="date = $event.detail.value"
            ><text class="ui-copy">{{ date || '选择日期' }}</text></picker
          ></view
        >
        <view class="capsule-time-fields">
          <view class="ui-field"
            ><text class="ui-label">时分</text
            ><picker
              mode="time"
              :value="time"
              :disabled="locked"
              class="ui-picker"
              @change="time = $event.detail.value"
              ><text class="ui-copy">{{ time || '选择时分' }}</text></picker
            ></view
          >
          <view class="ui-field"
            ><text class="ui-label">秒</text
            ><input
              v-model="second"
              type="number"
              :maxlength="2"
              :disabled="locked"
              class="ui-input"
              placeholder="00至59"
          /></view>
        </view>
        <text class="ui-meta"
          >默认服务端次日同刻。可预约60秒至365天；最多20个活动胶囊，额度与时间由服务端最终核验。</text
        >
      </view>
      <view class="ui-section ce-group">
        <text class="ui-section-title">封存前，请确认</text>
        <text class="ui-copy"
          >仅本人日常读取，系统安全扫描；命中后限授权人员处理。封存后不可编辑；未解锁不回显正文。</text
        >
        <view class="capsule-consent"
          ><switch :checked="accepted" :disabled="locked" @change="acceptSafety" /><text
            class="ui-copy"
            >我已阅读并确认安全告知</text
          ></view
        >
        <button
          :disabled="locked || !canCreate"
          class="ui-button ui-button-primary"
          :loading="isPageActionPending('pages-capsules-create-button-1')"
          @click="runPageAction(submit, 'pages-capsules-create-button-1')"
        >
          确认封存并开始安全处理
        </button>
      </view>
    </template>
    <view v-if="receipt" class="ui-section ce-group"
      ><text class="ui-section-title">{{ capsuleStatus(receipt) }}</text
      ><navigator
        class="ui-button ui-button-primary"
        :url="`/pages/capsules/detail?id=${encodeURIComponent(receipt.id)}`"
        >重新读取详情</navigator
      ></view
    >
    <button
      v-if="retryReady"
      :disabled="writing"
      class="ui-button ui-button-primary"
      :loading="isPageActionPending('pages-capsules-create-button-3')"
      @click="runPageAction(page.retry, 'pages-capsules-create-button-3')"
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
.capsule-time-fields {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 20rpx;
}
.capsule-consent {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
</style>
