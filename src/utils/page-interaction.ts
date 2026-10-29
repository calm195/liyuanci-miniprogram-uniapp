import type { ComponentPublicInstance } from 'vue'

function pageOwner(vm: ComponentPublicInstance | null): ComponentPublicInstance | null {
  // 小程序页面是独立根，H5页面与组件共用应用根，应沿父链找最近的页面实例。
  while (vm) {
    // script setup 的父级公开实例可能只暴露 defineExpose；从组件实例取得完整代理。
    const current: ComponentPublicInstance = vm.$?.proxy ?? vm
    if ('$mpType' in current && (current as { $mpType?: string }).$mpType === 'page') return current
    vm = vm.$?.parent?.proxy ?? vm.$parent
  }
  return null
}

// 页面被 navigateTo 保留时仍有事件处理器；执行回调前按实例核对前台归属。
export function createPageInteractionMixin(syncNative: () => void) {
  return {
    data() {
      return { pageIsVisible: false }
    },
    computed: {
      isPageVisible(this: ComponentPublicInstance) {
        return pageOwner(this)?.pageIsVisible ?? false
      },
    },
    onShow(this: ComponentPublicInstance) {
      this.pageIsVisible = true
      // 应用启动时还没有页面导航栏，只在页面归属明确后同步原生外观。
      if (pageOwner(this)) syncNative()
    },
    onHide(this: ComponentPublicInstance) {
      this.pageIsVisible = false
    },
    onUnload(this: ComponentPublicInstance) {
      this.pageIsVisible = false
    },
    methods: {
      runPageAction<T>(this: ComponentPublicInstance, action: () => T): T | undefined {
        const owner = pageOwner(this)
        if (!owner?.pageIsVisible) return
        const pages = getCurrentPages()
        const current = pages[pages.length - 1]
        // 微信返回原生页面，H5可能直接返回Vue实例；不能只比较路由，同一路由可多次入栈。
        const currentVm = (current as { $vm?: unknown } | undefined)?.$vm ?? current
        if (currentVm !== owner) return
        return action()
      },
    },
  }
}
