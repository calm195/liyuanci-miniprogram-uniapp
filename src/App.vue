<script setup lang="ts">
import { refreshDictionaries } from '@/features/dictionaries/load'
import { onAppShow, onAppHide, onThemeChange } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useEntryStore } from '@/stores/entry'
import { useDeletionStore } from '@/stores/deletion'
import { useThemeStore } from '@/stores/theme'
import { useUnreadStore } from '@/stores/unread'
import { isShareBrowseOnly } from '@/utils/shared-wish-navigation'
import type { SharePageVisit } from '@/utils/weixin-page-share'
const theme = useThemeStore()
const unread = useUnreadStore()
let foreground: 'background' | 'waiting' | 'preview' | 'normal' = 'background'
onAppHide(() => {
  foreground = 'background'
  unread.stop()
})
onThemeChange(({ theme: systemMode }) => theme.updateSystemMode(systemMode))
function refreshPublicDictionaries() {
  if (!config.useMock)
    void refreshDictionaries().catch(() => {
      /* 保留已验证快照，首次失败显示安全占位。 */
    })
}
function resumeSession() {
  unread.start()
  // 注销在途或结果不明时避免并发资格查询清掉会话，导致已受理回执被当作旧响应丢弃。
  const deletion = useDeletionStore()
  if (deletion.submitting || deletion.uncertain) return
  void useUserStore()
    .refresh(false, true)
    .catch(() => {
      /* 请求层已展示安全错误提示，资格校验失败保持关闭。 */
    })
}
onAppShow(() => {
  theme.updateSystemMode()
  // 微信热启动的入口参数不一定对应当前页面，等实际显示的页面通知后再恢复会话。
  foreground = 'waiting'
  // #ifndef MP-WEIXIN
  refreshPublicDictionaries()
  resumeSession()
  // #endif
})
// #ifdef MP-WEIXIN
uni.$on('app:share-page-visible', ({ brandPreview, shareHome, firstShow }: SharePageVisit) => {
  if (foreground === 'background') return
  if (brandPreview || isShareBrowseOnly()) {
    if (foreground !== 'preview') {
      unread.stop()
      if (!brandPreview) refreshPublicDictionaries()
    }
    foreground = 'preview'
    return
  }
  // 仅新进好友首页时关闭前一页面遗留的提示。后台恢复时保留访客主动选择的登录状态。
  if (firstShow && shareHome && !config.useMock && !session.getToken())
    useEntryStore().cancelLogin()
  if (foreground === 'normal') return
  foreground = 'normal'
  refreshPublicDictionaries()
  resumeSession()
})
// #endif
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
