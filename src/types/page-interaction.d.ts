import 'vue'

declare module 'vue' {
  interface ComponentCustomProperties {
    pageIsVisible: boolean
    isPageVisible: boolean
    runPageAction<T>(action: () => T): T | undefined
  }
}
