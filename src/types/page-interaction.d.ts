import 'vue'

declare module 'vue' {
  interface ComponentCustomProperties {
    pageIsVisible: boolean
    pageInteractionMounted: boolean
    isPageVisible: boolean
    pageActionGeneration: number
    pageActionIdentity: string
    pageLastActionKey: string
    pageActionKey: string
    pageActionEpoch: number
    isPageActionPending(key: string): boolean
    runPageAction<T>(action: () => T, key?: string): T | undefined
  }
}

declare module 'vue' {
  interface GlobalComponents {
    AppNotice: (typeof import('../components/AppNotice.vue'))['default']
  }
}
