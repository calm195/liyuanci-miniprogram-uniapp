export const mainNavigation = [
  { key: 'home', label: '首页', icon: 'home', url: '/pages/index/index' },
  { key: 'pond', label: '心愿池', icon: 'fish', url: '/pages/wishes/index' },
  { key: 'whispers', label: '悄悄话', icon: 'chat', url: '/pages/whispers/index' },
  { key: 'resources', label: '资料', icon: 'book', url: '/pages/resources/index' },
  { key: 'mine', label: '我的', icon: 'user', url: '/pages/profile/index' },
] as const
export type MainTab = (typeof mainNavigation)[number]['key']

export function switchMainTab(target: MainTab, current: MainTab) {
  if (target === current) return
  const entry = mainNavigation.find((item) => item.key === target)
  if (!entry) return
  // 原生 tab 页面保持实例，避免重建根页面造成主题及底栏闪烁。
  return openMainPage(entry.url)
}

// switchTab 不支持查询参数，以一次性内存意图传递筛选和编辑入口。
let pendingQuery: Record<string, string> | null = null
export function takeMainQuery() {
  const query = pendingQuery
  pendingQuery = null
  return query
}
export function openMainPage(url: string): Promise<void> {
  const [path, query] = url.split('?')
  const entry = mainNavigation.find((item) => item.url === path)
  if (!entry) return Promise.reject(new Error('导航目标无效'))
  pendingQuery =
    entry.key === 'pond'
      ? Object.fromEntries(
          (query ? query.split('&') : []).map((part) => {
            const [key, value = ''] = part.split('=')
            return [decodeURIComponent(key ?? ''), decodeURIComponent(value)]
          }),
        )
      : null
  return new Promise((resolve, reject) =>
    uni.switchTab({
      url: entry.url,
      success: () => resolve(),
      fail: () => {
        pendingQuery = null
        reject(new Error('页面切换失败，请重试'))
      },
    }),
  )
}
