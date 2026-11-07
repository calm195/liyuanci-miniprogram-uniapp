import { ref } from 'vue'

// 本机只保存会话凭据，身份与权限每次启动都由服务端重新确认。
let token = ''
let storageKey = ''
const epoch = ref(0)
function persist(value: string) {
  if (!storageKey) return
  try {
    if (value) uni.setStorageSync(storageKey, value)
    else uni.removeStorageSync(storageKey)
  } catch {
    // 存储不可用不影响当前内存会话，也不记录凭据。
    uni.$emit?.('app:notice', {
      message: '登录状态未能保存到本机，下次进入可能需要重新登录',
      kind: 'error',
    })
  }
}
export const session = {
  getToken: () => token,
  getEpoch: () => epoch.value,
  restore(apiBaseUrl: string) {
    storageKey = `liyuanci:session:${apiBaseUrl}`
    try {
      const saved: unknown = uni.getStorageSync(storageKey)
      if (typeof saved === 'string' && /^[!-~]{1,4096}$/.test(saved)) token = saved
      else {
        token = ''
        uni.removeStorageSync(storageKey)
      }
    } catch {
      token = ''
    }
    epoch.value++
  },
  setToken(value: string) {
    token = value
    persist(value)
    epoch.value++
  },
  clear() {
    token = ''
    persist('')
    epoch.value++
  },
}
