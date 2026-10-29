<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { beijingTime } from '@/utils/capsules'
import AppPage from '@/components/AppPage.vue'
import { getResource, getResourceDownload, putResourceFeedback } from '@/api/resources'
import { useResourcePage } from '@/composables/use-resource-page'
import { RequestError } from '@/utils/request'
import { resourceCommandKey, resourceFeedbackChoices } from '@/utils/resources'
import type { ResourceDetail, ResourceFeedbackInput, ResourceFeedbackKind } from '@/types/resource'
const id = ref('')
const detail = ref<ResourceDetail | null>(null)
const choice = ref<ResourceFeedbackKind | ''>('')
const writing = ref(false)
const pending = ref<{ id: string; input: ResourceFeedbackInput; key: string } | null>(null)
function clear() {
  detail.value = null
  choice.value = ''
  writing.value = false
  pending.value = null
}
const page = useResourcePage(clear)
const { ready, busy, error, notice, gate, user } = page
const visible = computed(() => ready.value && user.validated && detail.value !== null)
const canFeedback = computed(
  () => visible.value && !!detail.value?.allowed_actions.includes('submit_feedback'),
)
async function load() {
  await page.enter(async (active) => {
    const result = await getResource(id.value)
    if (active()) {
      detail.value = result
      choice.value = result.my_feedback?.kind ?? ''
    }
  })
}
async function conflict() {
  const loading = load()
  const active = page.ticket()
  await loading
  if (active()) notice.value = '资料或反馈已变化，请核对最新内容后再次操作。'
}
async function copy(linkOnly: boolean) {
  const resource = detail.value
  if (
    !visible.value ||
    !resource ||
    busy.value ||
    writing.value ||
    pending.value ||
    !resource.allowed_actions.includes('copy_download')
  )
    return
  const active = page.ticket()
  writing.value = true
  error.value = ''
  notice.value = ''
  let changed = false
  try {
    const download = await getResourceDownload(resource.id, resource.version)
    if (!active() || detail.value?.id !== resource.id || detail.value.version !== resource.version)
      return
    // 每次点击都从当前授权响应取值，不从详情缓存兜底。
    await new Promise<void>((resolve, reject) =>
      uni.setClipboardData({
        data: linkOnly ? download.download_url : download.copy_text,
        showToast: false,
        success: () => resolve(),
        fail: () => reject(new Error('复制失败，请重试。')),
      }),
    )
    if (active()) notice.value = '已复制'
  } catch (failure) {
    if (active()) {
      changed = failure instanceof RequestError && failure.statusCode === 409
      page.fail(failure)
    }
  } finally {
    if (active()) {
      writing.value = false
      if (changed) await conflict()
    }
  }
}
function select(kind: ResourceFeedbackKind) {
  if (canFeedback.value && !writing.value && !pending.value) choice.value = kind
}
async function submit(retry = false) {
  const resource = detail.value
  if (!canFeedback.value || !resource || busy.value || writing.value || (!retry && pending.value))
    return
  if (!retry) {
    if (!choice.value) return
    pending.value = {
      id: resource.id,
      key: resourceCommandKey(),
      input: {
        kind: choice.value,
        expected_content_version: resource.content_version,
        expected_feedback_version: resource.my_feedback?.version ?? 0,
      },
    }
  }
  const command = pending.value
  if (!command) return
  const active = page.ticket()
  writing.value = true
  error.value = ''
  notice.value = ''
  let changed = false
  try {
    const result = await putResourceFeedback(command.id, command.input, command.key)
    if (
      !active() ||
      detail.value?.id !== result.resource_id ||
      detail.value.content_version !== result.content_version
    )
      return
    detail.value = { ...detail.value, my_feedback: result }
    choice.value = result.kind
    pending.value = null
    notice.value = '反馈已记录'
  } catch (failure) {
    if (active()) {
      changed = failure instanceof RequestError && failure.statusCode === 409
      if (
        failure instanceof RequestError &&
        failure.statusCode >= 400 &&
        failure.statusCode < 500 &&
        failure.statusCode !== 429
      )
        pending.value = null
      page.fail(failure)
    }
  } finally {
    if (active()) {
      writing.value = false
      if (changed) await conflict()
    }
  }
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
    <text class="title">资料详情</text>
    <view v-if="gate" class="card">
      <text>{{ gate }}</text>
      <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
      <navigator v-else url="/pages/verification/index">查看学生认证</navigator>
    </view>
    <view v-if="error" class="card"
      ><text>{{ error }}</text
      ><navigator url="/pages/safety/index">警告与申诉</navigator></view
    >
    <text v-if="busy">正在加载资料…</text><text v-if="notice">{{ notice }}</text>
    <button v-if="!pending" :disabled="busy || writing" @click="runPageAction(() => load())">
      刷新资料
    </button>
    <template v-if="visible && detail">
      <view class="card">
        <text class="title">{{ detail.title }}</text
        ><text>{{ detail.category.name }}</text>
        <text class="resource-text">{{ detail.description || '暂无简介' }}</text>
        <text>更新时间：{{ beijingTime(detail.updated_at) }}（北京时间）</text>
        <text class="resource-text">下载链接：{{ detail.download_url }}</text>
        <text>提取码：{{ detail.extraction_code ?? '无提取码' }}</text>
        <button :disabled="writing || !!pending || busy" @click="runPageAction(() => copy(false))">
          复制下载信息
        </button>
        <button :disabled="writing || !!pending || busy" @click="runPageAction(() => copy(true))">
          仅复制链接
        </button>
      </view>
      <view class="card">
        <text>资料反馈</text>
        <text v-if="!canFeedback">当前允许查看资料，暂不可提交或修改反馈。</text>
        <button
          v-for="option in resourceFeedbackChoices"
          :key="option.kind"
          :disabled="!canFeedback || writing || !!pending"
          :class="{ chosen: choice === option.kind }"
          @click="runPageAction(() => select(option.kind))"
        >
          {{ choice === option.kind ? '已选择：' : '' }}{{ option.label }}
        </button>
        <text v-if="detail.my_feedback"
          >已保存：{{
            resourceFeedbackChoices.find((option) => option.kind === detail?.my_feedback?.kind)
              ?.label
          }}</text
        >
        <button
          v-if="!pending"
          :disabled="!canFeedback || !choice || writing || busy"
          @click="runPageAction(() => submit())"
        >
          提交反馈
        </button>
        <template v-else
          ><text>反馈结果尚未确认，重试将核实同一次提交。</text
          ><button :disabled="writing || busy" @click="runPageAction(() => submit(true))">
            重试本次反馈
          </button></template
        >
      </view>
    </template>
  </AppPage>
</template>
<style scoped>
.resource-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chosen {
  font-weight: 700;
  border: 2rpx solid currentcolor;
}
</style>
