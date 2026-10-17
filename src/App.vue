<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
onShow(() => {
  void useUserStore()
    .refresh()
    .catch(() => {
      /* 请求层已展示安全错误提示，资格校验失败保持关闭。 */
    })
})
</script>
<style>
@import './styles/tailwind.css';
</style>
<style lang="scss">
@use './styles/index.scss';
</style>
