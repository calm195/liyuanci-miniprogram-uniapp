<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import WhisperContent from '@/components/WhisperContent.vue'
import { useWhisperFeed } from '@/composables/use-whisper-feed'
const { items, cursor, ready, busy, error, load } = useWhisperFeed()
</script>
<template>
  <AppPage>
    <navigator url="/pages/capsules/index">我的时光胶囊</navigator>
    <navigator url="/pages/whispers/notifications">悄悄鲤通知</navigator>
    <text class="title">悄悄鲤 · 文字树洞</text>
    <text>在这里表达，也给彼此留一点温柔。</text>
    <navigator url="/pages/whispers/editor">写一篇树洞</navigator>
    <navigator url="/pages/whispers/mine">我的记录</navigator>
    <navigator url="/pages/whispers/help">解忧与公共援助</navigator>
    <button :disabled="busy" @click="runPageAction(() => load())">刷新</button>
    <text v-if="busy">加载中…</text>
    <view v-for="item in items" :key="item.id" class="card">
      <WhisperContent :content="item" />
      <text>暖评 {{ item.comment_count }} · 抱抱 {{ item.hug_count }}</text>
      <navigator :url="`/pages/whispers/detail?id=${encodeURIComponent(item.id)}`"
        >阅读全文</navigator
      >
    </view>
    <text v-if="ready && !items.length && !busy">当前页暂无公开帖子。</text>
    <button v-if="cursor" :disabled="busy" @click="runPageAction(() => load(true))">
      加载下一页
    </button>
    <text v-if="error" class="error">{{ error }}</text>
  </AppPage>
</template>
