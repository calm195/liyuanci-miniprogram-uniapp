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
  <AppPage responsive-padding>
    <PageHeading :title="id ? '编辑心事' : '写心事'" />
    <WhisperPostEditor :editor="editor" />
  </AppPage>
</template>
