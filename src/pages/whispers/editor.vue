<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
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
</script>
<template>
  <AppPage><WhisperPostEditor :editor="editor" /></AppPage>
</template>
