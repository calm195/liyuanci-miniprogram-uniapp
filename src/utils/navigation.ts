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
  // 主导航重建根页面，避免反复切栏堆积页面栈；详情页仍保留正常返回路径。
  uni.reLaunch({ url: entry.url })
}
