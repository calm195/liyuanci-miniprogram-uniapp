<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onUnmounted, ref, watch } from 'vue'
import type { useWhisperCommentEditor } from '@/composables/use-whisper-comment-editor'
import { whisperStates } from '@/utils/whisper-content'
import CommentComposer from '@/components/CommentComposer.vue'
const props = defineProps<{ editor: ReturnType<typeof useWhisperCommentEditor> }>()
const {
  id,
  rootId,
  record,
  post,
  body,
  mode,
  nickname,
  identityNotice,
  expanded,
  page,
  writing,
  error,
  notice,
  retryReady,
  locked,
  canSubmit,
  submit,
} = props.editor
const identityLabel = computed(() => {
  if (mode.value !== 'named') return mode.value === 'semi' ? '半匿名' : '完全匿名'
  const original = record.value?.identity_input
  if (
    original?.mode === 'named' &&
    original.nickname_version !== nickname.value?.active?.nickname_version
  )
    return '原昵称已不可用'
  return nickname.value?.active?.label || '树洞昵称'
})
const instance = getCurrentInstance()
const focusComposer = ref(false)
let focusGeneration = 0
onUnmounted(() => {
  focusGeneration++
})
watch(
  () => [expanded.value, canSubmit.value],
  async ([opened, allowed]) => {
    const current = ++focusGeneration
    focusComposer.value = false
    if (!opened || !allowed) return
    await nextTick()
    if (current !== focusGeneration || !instance?.proxy) return
    // 楼内回复仍留在原帖，把已展开的编辑框带回视口，长帖也能直接继续输入。
    focusComposer.value = true
    const query = uni.createSelectorQuery().in(instance.proxy)
    query.select('.inline-comment-editor').boundingClientRect()
    query.selectViewport().scrollOffset(() => {})
    query.exec((result) => {
      if (current !== focusGeneration) return
      const bounds = result[0] as { top?: number } | null
      const viewport = result[1] as { scrollTop?: number } | null
      if (typeof bounds?.top === 'number' && typeof viewport?.scrollTop === 'number')
        uni.pageScrollTo({
          scrollTop: Math.max(0, viewport.scrollTop + bounds.top - 24),
          duration: 180,
        })
    })
  },
  { immediate: true },
)
</script>
<template>
  <view v-show="expanded" class="inline-comment-editor">
    <CommentComposer
      v-model="body"
      :expanded="expanded"
      :title="rootId ? '回复这条暖评' : id ? '编辑我的暖评' : '写一条暖评'"
      :editable="canSubmit"
      :disabled="locked"
      :loading="isPageActionPending('pages-whispers-comment-editor-button-2')"
      :submit-label="id ? '保存修改' : '发送'"
      :identity-label="identityLabel"
      :maxlength="-1"
      :focus="focusComposer"
      @close="editor.close"
      @submit="runPageAction(submit, 'pages-whispers-comment-editor-button-2')"
    >
      <template v-if="record || (post && !post.comments_open)" #context>
        <text v-if="record" class="ui-copy">{{ whisperStates[record.status] }}</text>
        <text v-if="record?.review_result?.reason" class="ui-copy"
          >原因：{{ record.review_result.reason }}</text
        >
        <text v-if="record?.review_result?.revision_suggestion" class="ui-copy"
          >建议：{{ record.review_result.revision_suggestion }}</text
        >
        <text
          v-if="record && post && record.parent_content_version !== post.content_version"
          class="ui-copy"
          >原帖已更新，请核对后再发送。</text
        >
        <view v-if="record && !record.post_id">
          <text class="ui-copy">原帖已不可用，不能修改旧暖评或恢复旧串。</text>
          <view v-if="record.recovery_body"
            ><text class="ui-copy">受控脱敏后的安全候选：</text
            ><text class="ui-copy whitespace-pre-wrap">{{ record.recovery_body }}</text></view
          >
          <navigator class="ui-link" url="/pages/whispers/index" open-type="switchTab"
            >另选当前公开帖子，重新填写新暖评</navigator
          >
        </view>
        <text v-else-if="post && !post.comments_open" class="ui-copy">评论已关闭。</text>
      </template>
      <template v-if="identityNotice || error || retryReady || notice" #feedback>
        <text v-if="identityNotice" class="ui-copy">{{ identityNotice }}</text>
        <button
          v-if="error && !retryReady"
          class="ui-button"
          :disabled="locked"
          :loading="isPageActionPending('whisper-comment-reload')"
          @click="runPageAction(() => editor.load(true), 'whisper-comment-reload')"
        >
          重新读取
        </button>
        <button
          v-if="retryReady"
          class="ui-button ui-button-primary"
          :disabled="writing"
          :loading="isPageActionPending('pages-whispers-comment-editor-button-3')"
          @click="runPageAction(page.retry, 'pages-whispers-comment-editor-button-3')"
        >
          使用原请求重试
        </button>
        <AppNotice :message="notice" kind="info" /><AppNotice :message="error" kind="error" />
      </template>
    </CommentComposer>
  </view>
</template>
