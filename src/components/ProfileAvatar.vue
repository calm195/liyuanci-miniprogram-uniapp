<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ src?: string }>()
const defaultAvatar = '/static/illustrations/profile-koi.png'
const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  },
  { flush: 'sync' },
)
</script>

<template>
  <image
    class="avatar-image"
    :src="(!failed && src) || defaultAvatar"
    mode="aspectFill"
    @error="failed = true"
  />
</template>

<style scoped>
.avatar-image {
  width: 126rpx;
  height: 126rpx;
  border-radius: 50%;
}
</style>
