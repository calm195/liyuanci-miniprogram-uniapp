<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onUnmounted, ref, watch } from 'vue'
import type { useWhisperCommentEditor } from '@/composables/use-whisper-comment-editor'
import { whisperIdentityPreview, whisperStates, whisperTagsDraft } from '@/utils/whisper-content'
import CommentComposer from '@/components/CommentComposer.vue'
import WhisperIdentity from '@/components/WhisperIdentity.vue'
import WhisperIdentityPreview from '@/components/WhisperIdentityPreview.vue'
import { useUserStore } from '@/stores/user'
import type { IdentityInput } from '@/types/whispers'
const props = defineProps<{ editor: ReturnType<typeof useWhisperCommentEditor> }>()
const user = useUserStore()
const {
  module,
  id,
  postId,
  rootId,
  replyId,
  record,
  post,
  body,
  mode,
  tags,
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
const modeNames = { anonymous: '完全匿名', semi: '半匿名', named: '树洞昵称' }
const preview = computed(() => {
  const original = record.value?.identity_input
  const unavailable =
    original?.mode === 'named' &&
    original.nickname_version !== nickname.value?.active?.nickname_version
  return whisperIdentityPreview(
    mode.value,
    tags.value,
    module.config,
    unavailable ? undefined : nickname.value?.active?.label,
    user.user?.hide_identity_tags,
    user.user?.nickname,
  )
})
const adjusting = ref(false)
const draftMode = ref<IdentityInput['mode']>('anonymous')
const draftTags = ref(whisperTagsDraft())
function adjustIdentity() {
  if (id.value || !canSubmit.value || locked.value) return
  draftMode.value = mode.value
  draftTags.value = { ...tags.value }
  focusComposer.value = false
  uni.hideKeyboard()
  adjusting.value = true
}
function saveIdentity() {
  if (props.editor.saveIdentity(draftMode.value, draftTags.value)) adjusting.value = false
}
watch([expanded, id, postId, rootId, replyId], () => {
  adjusting.value = false
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
      :submit-disabled="locked || adjusting"
      :loading="isPageActionPending('pages-whispers-comment-editor-button-2')"
      :submit-label="id ? '保存修改' : '发送暖评'"
      :maxlength="-1"
      :focus="focusComposer"
      @close="editor.close"
      @submit="runPageAction(submit, 'pages-whispers-comment-editor-button-2')"
    >
      <template v-if="canSubmit" #identity>
        <text class="comment-identity-caption">本条暖评身份 · {{ modeNames[mode] }}</text>
        <WhisperIdentityPreview v-if="!adjusting" :value="preview" />
        <view v-else class="comment-identity-settings">
          <WhisperIdentity
            v-model:mode="draftMode"
            v-model:tags="draftTags"
            v-model:nickname="nickname"
            :config="module.config"
            :disabled="locked"
            profile-defaults
            comment
          />
          <text class="comment-identity-caption">保存后用于本条及此设备上的新暖评。</text>
          <view class="comment-identity-actions">
            <button class="ui-button" @click="adjusting = false">取消</button>
            <button class="ui-button ui-button-primary" :disabled="locked" @click="saveIdentity">
              保存评论身份
            </button>
          </view>
        </view>
      </template>
      <template v-if="canSubmit && !id && !adjusting" #actions>
        <button
          class="ui-button comment-adjust-identity"
          :disabled="locked"
          @click="adjustIdentity"
        >
          调整身份
        </button>
      </template>
      <template v-if="record || (post && !post.comments_open)" #context>
        <text v-if="record" class="ui-copy">{{ whisperStates[record.status] }}</text>
        <text v-if="record?.review_result?.decision === 'rejected'" class="ui-copy"
          >你发布的内容含有违规信息</text
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
<style scoped>
.comment-identity-caption {
  margin: 0;
  color: var(--theme-muted);
  font-size: 24rpx;
  line-height: 1.5;
}
.comment-identity-settings {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  min-width: 0;
}
.comment-identity-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.comment-identity-actions button,
button.comment-adjust-identity {
  width: auto;
  min-height: 44px;
  margin: 0;
}
</style>
