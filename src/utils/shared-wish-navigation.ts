import { mainNavigation } from './navigation.ts'
import { nativeShareQuery, sharePage } from './share.ts'

declare const wx: { getApiCategory?: () => string }

const home = mainNavigation[0].url
let routing = false

export function isShareBrowseOnly() {
  const nativeCategory = typeof wx === 'undefined' ? undefined : wx.getApiCategory?.()
  if (nativeCategory) return nativeCategory === 'browseOnly'
  const entry = uni.getEnterOptionsSync?.() as
    (ReturnType<typeof uni.getEnterOptionsSync> & { apiCategory?: string }) | undefined
  return entry?.apiCategory === 'browseOnly' || entry?.scene === 1154
}

export async function prepareSharedWishBackStack(reference: string | undefined, id: string) {
  if (isShareBrowseOnly()) return false
  const pages = getCurrentPages()
  if (pages[pages.length - 2]?.route === home.slice(1)) return false
  // 无效引用也保留分享来源，详情显示不可查看后仍能返回首页。
  const query =
    reference === undefined
      ? nativeShareQuery(id)
      : `ref=${encodeURIComponent(reference || 'invalid')}`
  if (routing) return true
  const detail = `${sharePage('wish')}?${query}`
  routing = true
  // 微信侧滑直接弹出原生页面栈。首页可能复用已有实例，从重建页面栈的回调继续跳转。
  return new Promise<boolean>((resolve) =>
    uni.reLaunch({
      url: home,
      success: () => {
        setTimeout(() => {
          uni.navigateTo({
            url: detail,
            fail: () =>
              uni.$emit('app:notice', { message: '分享的心愿打开失败，请重试。', kind: 'error' }),
            complete: () => {
              routing = false
            },
          })
        }, 0)
        resolve(true)
      },
      fail: () => {
        routing = false
        resolve(false)
      },
    }),
  )
}
