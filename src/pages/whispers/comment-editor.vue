<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import { callWhisper } from '@/api/whispers'
import { session } from '@/utils/session'
import { useWhisperPage } from '@/composables/use-whisper-page'
import { useLoginRefresh } from '@/composables/use-login'
const query = ref<Record<string, string>>({})
const page = useWhisperPage(() => {})
async function resolveTarget() {
  await page.read(async (active) => {
    if (!session.getToken()) throw new Error('请登录后打开这条暖评。')
    let postId = query.value.postId
    if (query.value.id) {
      const comment = await callWhisper('whisperOwnCommentGet', {
        path: { comment_id: query.value.id },
      })
      if (!active()) return
      if (comment.id !== query.value.id || !comment.post_id)
        throw new Error('原帖已不可用，无法恢复旧回复。请另选当前公开帖子。')
      postId = comment.post_id
    }
    if (!postId) throw new Error('缺少原帖信息，请从当前帖子重新打开。')
    const post = await callWhisper('whisperPostGet', { path: { post_id: postId } })
    if (!active()) return
    if (post.id !== postId) throw new Error('原帖信息不匹配，请重新打开。')
    const params = [
      ['id', postId],
      ['compose', '1'],
      ['commentId', query.value.id ?? ''],
      ['rootId', query.value.rootId ?? ''],
      ['replyId', query.value.replyId ?? ''],
    ]
      .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
      .join('&')
    await new Promise<void>((resolve, reject) =>
      uni.redirectTo({
        url: `/pages/whispers/detail?${params}`,
        success: () => resolve(),
        fail: () => reject(new Error('无法打开原帖，请重试。')),
      }),
    )
  })
}
onLoad((value) => {
  query.value = Object.fromEntries(
    Object.entries(value ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
})
onShow(() => {
  void resolveTarget()
})
useLoginRefresh(resolveTarget)
</script>
<template>
  <AppPage responsive-padding
    ><text v-if="page.busy.value" class="ui-state">正在打开原帖…</text
    ><AppNotice :message="page.error.value" kind="error" /><LoginLink v-if="!session.getToken()"
      >登录后继续</LoginLink
    ><navigator
      v-if="page.error.value"
      url="/pages/whispers/index"
      open-type="switchTab"
      class="ui-link"
      >返回悄悄话</navigator
    ></AppPage
  >
</template>
