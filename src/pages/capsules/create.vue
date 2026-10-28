<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
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
    date.value = local.slice(0, 10)
    time.value = local.slice(11, 16)
    second.value = local.slice(17, 19)
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
onShow(() => {
  void load()
})
</script>
<template>
  <AppPage>
    <text class="title">写给未来的自己</text>
    <navigator url="/pages/whispers/help">解忧与公共援助（离开会清空未封存正文）</navigator>
    <navigator url="/pages/capsules/index">我的胶囊</navigator>
    <text
      >仅本人日常读取，系统安全扫描；命中后限授权人员处理。封存后不可编辑；未解锁不回显正文。</text
    >
    <view v-if="!receipt" class="card">
      <textarea
        v-model="body"
        :maxlength="-1"
        :disabled="locked"
        placeholder="最多500个Unicode码点"
      />
      <text>{{ Array.from(body).length }}/500</text>
      <text>预约时间（北京时间，精确到秒）</text>
      <picker mode="date" :value="date" :disabled="locked" @change="date = $event.detail.value"
        ><view>{{ date || '选择日期' }}</view></picker
      >
      <picker mode="time" :value="time" :disabled="locked" @change="time = $event.detail.value"
        ><view>{{ time || '选择时分' }}</view></picker
      >
      <input
        v-model="second"
        type="number"
        :maxlength="2"
        :disabled="locked"
        placeholder="秒（00至59）"
      />
      <text
        >默认服务端次日同刻。可预约60秒至365天；最多20个活动胶囊，额度与时间由服务端最终核验。</text
      >
      <switch :checked="accepted" :disabled="locked" @change="acceptSafety" /><text
        >我已阅读并确认安全告知</text
      >
      <button :disabled="locked || !canCreate" @click="runPageAction(submit)">
        确认封存并开始安全处理
      </button>
      <button :disabled="locked" @click="runPageAction(load)">刷新资格与时间（清空输入）</button>
    </view>
    <view v-if="receipt" class="card">
      <text>{{ capsuleStatus(receipt) }}</text>
      <navigator :url="`/pages/capsules/detail?id=${encodeURIComponent(receipt.id)}`"
        >重新读取详情</navigator
      >
    </view>
    <button v-if="retryReady" :disabled="writing" @click="runPageAction(page.retry)">
      使用原请求重试
    </button>
    <text v-if="notice" class="notice">{{ notice }}</text
    ><text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
