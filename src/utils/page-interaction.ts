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

function scopedActionKey(vm: ComponentPublicInstance, key: string): string {
  return `${vm.$?.uid ?? 0}:${key}`
}

function currentPageOwner(): ComponentPublicInstance | null {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  // 微信可能返回 script setup 的公开代理，和子组件一样统一为所属页面的完整代理。
  const vm = (current as { $vm?: ComponentPublicInstance } | undefined)?.$vm ?? current
  return pageOwner((vm as ComponentPublicInstance | undefined) ?? null)
}

// 页面被 navigateTo 保留时仍有事件处理器；执行回调前按实例核对前台归属。
export function createPageInteractionMixin(syncNative: () => void) {
  return {
    data() {
      return {
        pageIsVisible: false,
        pageInteractionMounted: false,
        pageActionKey: '',
        pageLastActionKey: '',
        pageActionEpoch: 0,
      }
    },
    computed: {
      pageActionIdentity(this: ComponentPublicInstance) {
        return pageOwner(this)?.pageLastActionKey ?? ''
      },
      pageActionGeneration(this: ComponentPublicInstance) {
        return pageOwner(this)?.pageActionEpoch ?? 0
      },
      isPageVisible(this: ComponentPublicInstance) {
        // 子组件首次渲染时父子桥接可能尚未完成，ready 标识确保归属会重新计算。
        if (!this.pageInteractionMounted) return false
        return pageOwner(this)?.pageIsVisible ?? false
      },
    },
    mounted(this: ComponentPublicInstance) {
      this.pageInteractionMounted = true
      const owner = pageOwner(this)
      // 冷启动时原生 onShow 可能早于 Vue 页面绑定；ready 时仅恢复原生栈顶页面。
      // 不以组件自身 mounted 恢复旧页面，避免后台组件延迟就绪时重新覆盖前台。
      if (owner !== (this.$?.proxy ?? this) || owner !== currentPageOwner()) return
      if (!this.pageIsVisible) {
        this.pageIsVisible = true
        syncNative()
      }
    },
    onShow(this: ComponentPublicInstance) {
      this.pageIsVisible = true
      // 应用启动时还没有页面导航栏，只在页面归属明确后同步原生外观。
      if (pageOwner(this)) syncNative()
    },
    onHide(this: ComponentPublicInstance) {
      this.pageIsVisible = false
      this.pageActionEpoch++
      this.pageActionKey = ''
    },
    onUnload(this: ComponentPublicInstance) {
      this.pageIsVisible = false
      this.pageActionEpoch++
      this.pageActionKey = ''
    },
    methods: {
      isPageActionPending(this: ComponentPublicInstance, key: string): boolean {
        const owner = pageOwner(this)
        return !!owner?.pageIsVisible && owner.pageActionKey === scopedActionKey(this, key)
      },
      runPageAction<T>(
        this: ComponentPublicInstance,
        action: () => T,
        key = 'page-action',
      ): T | undefined {
        const owner = pageOwner(this)
        if (!owner?.pageIsVisible || owner.pageActionKey) return
        if (currentPageOwner() !== owner) return
        // 页面和组件共享同一个动作归属；循环按钮的 key 包含目标，进度只显示在本次按钮。
        owner.pageLastActionKey = scopedActionKey(this, key)
        const epoch = ++owner.pageActionEpoch
        owner.pageActionKey = scopedActionKey(this, key)
        const finish = () => {
          // 离页和后续动作均会推进代次，旧请求完成不能清掉新动作的进度。
          if (owner.pageActionEpoch === epoch) owner.pageActionKey = ''
        }
        try {
          const result = action()
          if (result && typeof (result as unknown as PromiseLike<unknown>).then === 'function') {
            // 分别观察成功与失败；仍返回原 Promise，交由原调用链处理结果和错误。
            void Promise.resolve(result).then(finish, finish)
          } else finish()
          return result
        } catch (failure) {
          finish()
          throw failure
        }
      },
    },
  }
}
