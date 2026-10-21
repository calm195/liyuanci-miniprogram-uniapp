export const config = {
  title: '鲤源池',
  // 真实业务服务及资源准入尚未完成；只在联调证据具备后修改。
  verificationWritesReady: false,
  wishWritesReady: false,
  isDev: import.meta.env.DEV,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  // 只有显式开启才启用隔离合成状态，生产构建不能开启。
  useMock: import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true',
}
