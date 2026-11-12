<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ src?: string; size?: number }>(), {
  src: '',
  size: 126,
})
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
    :style="{ width: `${size}rpx`, height: `${size}rpx` }"
    :src="(!failed && src) || defaultAvatar"
    mode="aspectFill"
    lazy-load
    @error="failed = true"
  />
</template>

<style scoped>
.avatar-image {
  display: block;
  flex: none;
  border-radius: 50%;
}
</style>
