<script setup lang="ts">
import { useLoginRefresh } from '@/composables/use-login'
import AppPage from '@/components/AppPage.vue'
import PageHeading from '@/components/PageHeading.vue'
import WhisperPostEditor from '@/components/WhisperPostEditor.vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useWhisperPostEditor } from '@/composables/use-whisper-post-editor'
const editor = useWhisperPostEditor()
const { id, page, load } = editor
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
})
page.onRefresh(() => load(true))
onShow(() => {
  void load()
})
useLoginRefresh(() => load())
</script>
<template>
  <AppPage responsive-padding
    ><PageHeading
      title="说说心事"
      description="先选择你希望展示的身份，再写下想说的话。" /><WhisperPostEditor :editor="editor"
  /></AppPage>
</template>

<style scoped>
.ui-section.ce-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  min-width: 0;
}
</style>
