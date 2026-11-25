import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { brandFriendShare, brandTimelineShare } from './share'

// 微信目标的 script setup 页面返回编译后的渲染函数，每次渲染产出 WXML 使用的数据。
type PageRender = (...args: unknown[]) => Record<string, unknown>
type WeixinPage = { setup: (props: unknown, context: unknown) => PageRender }

export interface SharePageVisit {
  brandPreview: boolean
  shareHome: boolean
  firstShow: boolean
}

export function withPageShare(page: WeixinPage) {
  return {
    ...page,
    // 声明原生页面方法，也覆盖尚未加载业务数据的瞬间。
    onShareAppMessage: brandFriendShare,
    onShareTimeline: brandTimelineShare,
    setup(props: unknown, context: unknown) {
      const view = ref<'brand' | 'page'>()
      let renderPage: PageRender | undefined
      let firstShow = true
      let shareHome = false
      onLoad((query) => {
        if (query?.brandShare === '1') {
          view.value = 'brand'
          return
        }
        if (query?.fromShare === '1') {
          const pages = getCurrentPages()
          shareHome = pages[pages.length - 1]?.route === 'pages/index/index'
        }
        // 此时 uni-app 仍绑定本页面实例。原页面注册的 onLoad 随同当前事件执行。
        renderPage = page.setup(props, context)
        view.value = 'page'
      })
      onShow(() => {
        if (view.value) {
          uni.$emit('app:share-page-visible', {
            brandPreview: view.value === 'brand',
            shareHome,
            firstShow,
          })
          firstShow = false
        }
        uni.showShareMenu?.({ menus: ['shareAppMessage', 'shareTimeline'] })
      })
      return (...renderArgs: unknown[]) => ({
        ...renderPage?.(...renderArgs),
        shareView: view.value,
      })
    },
  }
}
