<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import {
  downloadResourceFile,
  findSavedResourceFile,
  saveResourceFile,
  shareResourceFile,
} from '@/api/resource-file'
import { beijingTime } from '@/utils/capsules'
import AppPage from '@/components/AppPage.vue'
import { getResource, getResourceDownload, putResourceFeedback } from '@/api/resources'
import { useResourcePage } from '@/composables/use-resource-page'
import { RequestError } from '@/utils/request'
import { resourceCommandKey, resourceFeedbackChoices } from '@/utils/resources'
import type { ResourceDetail, ResourceFeedbackInput, ResourceFeedbackKind } from '@/types/resource'
const id = ref('')
const detail = ref<ResourceDetail | null>(null)
const downloadProgress = ref(0)
const downloaded = ref<{ path: string; name: string } | null>(null)
let cancelDownload: (() => void) | undefined
const choice = ref<ResourceFeedbackKind | ''>('')
const writing = ref(false)
const pending = ref<{ id: string; input: ResourceFeedbackInput; key: string } | null>(null)
function clear() {
  cancelDownload?.()
  cancelDownload = undefined
  downloadProgress.value = 0
  downloaded.value = null
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
    if (!active()) return
    const file = result.allowed_actions.includes('copy_download') ? result.file : null
    const path = file ? await findSavedResourceFile(file) : null
    if (active()) {
      downloaded.value = file && path ? { path, name: file.name } : null
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
    resource.file ||
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
    if (
      !active() ||
      download.file ||
      detail.value?.id !== resource.id ||
      detail.value.version !== resource.version
    )
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
async function downloadFile() {
  const resource = detail.value
  if (
    !visible.value ||
    !resource?.file ||
    busy.value ||
    writing.value ||
    pending.value ||
    !resource.allowed_actions.includes('copy_download')
  )
    return
  const active = page.ticket()
  writing.value = true
  downloadProgress.value = 0
  error.value = ''
  notice.value = ''
  downloaded.value = null
  try {
    const value = await getResourceDownload(resource.id, resource.version)
    if (!active()) return
    if (value.file?.id !== resource.file.id) throw new Error('资料文件已变化，请刷新后重试。')
    const transfer = downloadResourceFile(value, (percent) => {
      if (active()) downloadProgress.value = percent
    })
    cancelDownload = transfer.cancel
    const tempPath = await transfer.promise
    if (!active()) return
    cancelDownload = undefined
    const path = await saveResourceFile(tempPath, value.file)
    if (!active()) return
    downloaded.value = { path, name: value.file.name }
    notice.value = '文件已保存到微信小程序。'
  } catch (failure) {
    if (active()) page.fail(failure)
  } finally {
    if (active()) {
      cancelDownload = undefined
      writing.value = false
    }
  }
}
async function shareDownloaded() {
  const file = downloaded.value
  if (!file) return
  try {
    await shareResourceFile(file.path, file.name)
  } catch (failure) {
    page.fail(failure)
  }
}
onHide(() => cancelDownload?.())
onUnload(() => cancelDownload?.())
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
    const summary = detail.value.feedback_summary
    const previous = detail.value.my_feedback?.kind
    if (summary && previous !== result.kind) {
      const next = { ...summary }
      if (previous) next[previous] = Math.max(0, next[previous] - 1)
      else next.total++
      next[result.kind]++
      detail.value = { ...detail.value, feedback_summary: next }
    }
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
onPullDownRefresh(async () => {
  try {
    if (!writing.value) await load()
  } finally {
    uni.stopPullDownRefresh()
  }
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
    <AppNotice :message="error" kind="error" />
    <text v-if="busy">正在加载资料…</text><AppNotice :message="notice" kind="info" />

    <template v-if="visible && detail">
      <view class="card">
        <text class="title">{{ detail.title }}</text
        ><text>{{ detail.category.name }}</text>
        <text class="resource-text">{{ detail.description || '暂无简介' }}</text>
        <text>更新时间：{{ beijingTime(detail.updated_at) }}（北京时间）</text>
        <template v-if="detail.file">
          <text
            >文件：{{ detail.file.name }}（{{
              (detail.file.size / 1024 / 1024).toFixed(2)
            }}
            MiB）</text
          >
          <button
            v-if="!downloaded && detail.allowed_actions.includes('copy_download')"
            :disabled="writing || !!pending || busy"
            :loading="isPageActionPending('resource-download')"
            @click="runPageAction(() => downloadFile(), 'resource-download')"
          >
            {{
              isPageActionPending('resource-download')
                ? downloadProgress === 100
                  ? '正在保存文件…'
                  : `正在下载 ${downloadProgress}%`
                : '下载并保存资料文件'
            }}
          </button>
          <template v-if="downloaded">
            <text>已保存到微信小程序</text>
            <text class="resource-text" user-select>保存路径：{{ downloaded.path }}</text>
            <text>此路径仅供微信小程序访问，手机文件管理器无法打开。可将文件转发到微信聊天。</text>
            <button
              :loading="isPageActionPending('resource-share')"
              @click="runPageAction(() => shareDownloaded(), 'resource-share')"
            >
              转发文件
            </button>
          </template>
        </template>
        <template v-else>
          <text class="resource-text">下载链接：{{ detail.download_url }}</text>
          <text>提取码：{{ detail.extraction_code ?? '无提取码' }}</text>
          <button
            :disabled="writing || !!pending || busy"
            :loading="isPageActionPending('pages-resources-detail-button-2')"
            @click="runPageAction(() => copy(false), 'pages-resources-detail-button-2')"
          >
            复制下载信息
          </button>
          <button
            :disabled="writing || !!pending || busy"
            :loading="isPageActionPending('pages-resources-detail-button-3')"
            @click="runPageAction(() => copy(true), 'pages-resources-detail-button-3')"
          >
            仅复制链接
          </button>
        </template>
      </view>
      <view class="card">
        <text>资料反馈</text>
        <text v-if="!canFeedback">当前允许查看资料，暂不可提交或修改反馈。</text>
        <button
          v-for="option in resourceFeedbackChoices"
          :key="option.kind"
          :disabled="!canFeedback || writing || !!pending"
          :class="{ chosen: choice === option.kind }"
          :loading="isPageActionPending('pages-resources-detail-button-4' + ':' + option.kind)"
          @click="
            runPageAction(
              () => select(option.kind),
              'pages-resources-detail-button-4' + ':' + option.kind,
            )
          "
        >
          {{ choice === option.kind ? '已选择：' : '' }}{{ option.label }}
          {{ detail.feedback_summary?.[option.kind] ?? '' }}
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
          :loading="isPageActionPending('pages-resources-detail-button-5')"
          @click="runPageAction(() => submit(), 'pages-resources-detail-button-5')"
        >
          提交反馈
        </button>
        <template v-else
          ><text>反馈结果尚未确认，重试将核实同一次提交。</text
          ><button
            :disabled="writing || busy"
            :loading="isPageActionPending('pages-resources-detail-button-6')"
            @click="runPageAction(() => submit(true), 'pages-resources-detail-button-6')"
          >
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
