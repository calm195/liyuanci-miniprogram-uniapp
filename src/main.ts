import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import AppNotice from '@/components/AppNotice.vue'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useThemeStore } from '@/stores/theme'
import { createPageInteractionMixin } from '@/utils/page-interaction'

export function createApp() {
  if (!config.useMock) session.restore(config.apiBaseUrl)
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.component('AppNotice', AppNotice)
  app.mixin(createPageInteractionMixin(() => useThemeStore(pinia).syncNative()))
  return { app }
}
