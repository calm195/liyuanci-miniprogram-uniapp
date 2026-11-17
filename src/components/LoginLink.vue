<script setup lang="ts">
import { useLogin } from '@/composables/use-login'
import { mainNavigation, openMainPage } from '@/utils/navigation'
const props = defineProps<{ target?: string }>()
const emit = defineEmits<{ success: [] }>()
const { requestLogin } = useLogin()
function open() {
  requestLogin(async () => {
    emit('success')
    if (!props.target) return
    if (mainNavigation.some((item) => item.url === props.target?.split('?')[0])) {
      await openMainPage(props.target)
    } else {
      await new Promise<void>((resolve, reject) =>
        uni.navigateTo({
          url: props.target!,
          success: () => resolve(),
          fail: () => reject(new Error('无法打开目标页面，请重试。')),
        }),
      )
    }
  })
}
</script>
<template>
  <button
    class="login-link"
    :loading="isPageActionPending('login-link-open')"
    @click="runPageAction(open, 'login-link-open')"
  >
    <slot>登录后继续</slot>
  </button>
</template>
<style scoped>
.login-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-height: 64rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--theme-teal);
  font-size: 28rpx;
  line-height: 1.6;
}
</style>
