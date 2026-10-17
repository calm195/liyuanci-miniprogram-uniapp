export const config = {
  title: '鲤源池',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  // 只有显式开启才启用隔离合成状态，生产构建不能开启。
  useMock: import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true',
}
