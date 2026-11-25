import type { ShareKind, ShareLink, ShareTarget } from '../types/story.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const shareCover = '/static/share-cover.png'
const brandTitle = '鲤愿池 · 心愿与还愿故事'

export function brandFriendShare() {
  return { title: brandTitle, imageUrl: shareCover, path: '/pages/index/index?fromShare=1' }
}

export function brandTimelineShare() {
  // 朋友圈固定打开当前页，仅用这个标记进入公开品牌预览。
  return { title: brandTitle, imageUrl: shareCover, query: 'brandShare=1' }
}

export function sharePage(kind: ShareKind) {
  return kind === 'wish' ? '/pages/wish-detail/index' : '/pages/stories/index'
}

export function nativeShareQuery(id: string) {
  return `id=${encodeURIComponent(id)}&shared=1`
}

export function sharePath(kind: ShareKind, link: ShareLink) {
  if (!link || !uuid.test(link.ref)) throw new Error('分享引用无效。')
  const path = `${sharePage(kind)}?ref=${link.ref}`
  if (link.miniapp_route !== path) throw new Error('分享路由无效。')
  return path
}

// 微信小程序码的 scene 最多 32 个字符。收到后还原 UUID，再由服务端复核公开资格。
export function shareReference(query?: Record<string, unknown>) {
  if (query?.scene !== undefined) {
    const scene = query.scene
    if (typeof scene !== 'string' || !/^[0-9a-f]{32}$/.test(scene)) return ''
    return scene.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
  }
  if (query?.ref !== undefined)
    return typeof query.ref === 'string' && uuid.test(query.ref) ? query.ref : ''
  return undefined
}

export function shareTitle(kind: ShareKind, target: ShareTarget['target']) {
  return target.title?.trim() || (kind === 'story' ? '还愿故事' : '公开心愿')
}
