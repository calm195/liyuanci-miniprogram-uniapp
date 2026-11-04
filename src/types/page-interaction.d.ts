import 'vue'

declare module 'vue' {
  interface ComponentCustomProperties {
    pageIsVisible: boolean
    pageInteractionMounted: boolean
    isPageVisible: boolean
    pageActionKey: string
    pageActionEpoch: number
    isPageActionPending(key: string): boolean
    runPageAction<T>(action: () => T, key?: string): T | undefined
  }
}
