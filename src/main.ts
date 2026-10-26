import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useThemeStore } from '@/stores/theme'
import { createPageInteractionMixin } from '@/utils/page-interaction'

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.mixin(createPageInteractionMixin(() => useThemeStore(pinia).syncNative()))
  return { app }
}
