<script setup lang="ts">
import { refreshDictionaries } from '@/features/dictionaries/load'
import { onShow, onHide, onThemeChange } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useEntryStore } from '@/stores/entry'
import { useDeletionStore } from '@/stores/deletion'
import { useThemeStore } from '@/stores/theme'
import { useUnreadStore } from '@/stores/unread'
const theme = useThemeStore()
const unread = useUnreadStore()
onHide(unread.stop)
onThemeChange(({ theme: systemMode }) => theme.updateSystemMode(systemMode))
onShow(() => {
  theme.updateSystemMode()
  unread.start()
  if (!config.useMock)
    void refreshDictionaries().catch(() => {
      /* 保留已验证快照，首次失败显示安全占位。 */
    })
  // 注销在途或结果不明时避免并发资格查询清掉会话，导致已受理回执被当作旧响应丢弃。
  const deletion = useDeletionStore()
  if (deletion.submitting || deletion.uncertain) return
  if (!config.useMock && !session.getToken()) useEntryStore().openLogin()
  void useUserStore()
    .refresh(false, true)
    .catch(() => {
      /* 请求层已展示安全错误提示，资格校验失败保持关闭。 */
    })
})
</script>
<style>
@import './styles/tailwind.css';
/* #ifdef H5 */
/* H5 的原生栏不支持 custom，保留应用自己的导航与未读角标。 */
uni-tabbar {
  display: none !important;
}
/* #endif */
</style>
<style lang="scss">
@use './styles/index.scss';
</style>
