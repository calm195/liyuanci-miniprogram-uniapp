export const config = {
  title: '鲤源池',
  // 真实写入入口已开放，具体操作仍检查当前会话、服务端动作与对象版本。
  verificationWritesReady: true,
  wishWritesReady: true,
  isDev: import.meta.env.DEV,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  // 只有显式开启才启用隔离合成状态，生产构建不能开启。
  useMock: import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true',
}
