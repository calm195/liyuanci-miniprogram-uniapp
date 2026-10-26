<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useDeletionStore } from '@/stores/deletion'
onShow(() => {
  // 注销在途或结果不明时避免并发资格查询清掉会话，导致已受理回执被当作旧响应丢弃。
  const deletion = useDeletionStore()
  if (deletion.submitting || deletion.uncertain) return
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
