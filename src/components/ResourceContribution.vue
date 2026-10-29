<script setup lang="ts">
import { ref } from 'vue'
import { resourceContributionImage } from '@/config/resources'
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const failed = ref(false)
const attempt = ref(0)
function preview() {
  if (!resourceContributionImage || failed.value) return
  uni.previewImage({
    urls: [resourceContributionImage],
    current: resourceContributionImage,
    fail: () => {
      failed.value = true
    },
  })
}
function retry() {
  failed.value = false
  attempt.value++
}
</script>
<template>
  <view v-if="open" class="contribution-mask" @tap.self="emit('close')">
    <view class="contribution-panel">
      <text class="title">资料投稿</text>
      <text>添加资料负责人微信，备注“资料投稿”</text>
      <text v-if="!resourceContributionImage">投稿二维码暂未配置</text>
      <template v-else>
        <text v-if="failed">二维码加载失败，请重试。</text>
        <image
          v-else
          :key="attempt"
          :src="resourceContributionImage"
          class="contribution-image"
          mode="widthFix"
          @error="failed = true"
        />
        <button v-if="failed" @click="runPageAction(() => retry())">重试加载</button>
        <button v-else @click="runPageAction(() => preview())">查看大图</button>
      </template>
      <button @click="emit('close')">关闭</button>
    </view>
  </view>
</template>
<style scoped>
.contribution-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 55%);
  padding: 32rpx;
}
.contribution-panel {
  width: 100%;
  max-width: 600rpx;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 32rpx;
  border-radius: 24rpx;
  background: var(--theme-surface);
  color: var(--theme-ink);
}
.contribution-image {
  width: 100%;
  height: auto;
  background: #fff;
}
</style>
