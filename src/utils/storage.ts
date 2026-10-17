interface StorageItem<T> {
  value: T
  expiresAt: number | null
}
const PREFIX = 'uni-starter:'

export const storage = {
  // ttl 使用毫秒；未指定时永久保存。仅删除本模板键，不影响其他业务缓存。
  set<T>(key: string, value: T, ttl?: number): void {
    const item: StorageItem<T> = { value, expiresAt: ttl === undefined ? null : Date.now() + ttl }
    uni.setStorageSync(PREFIX + key, JSON.stringify(item))
  },
  get<T>(key: string): T | null {
    try {
      const raw = uni.getStorageSync(PREFIX + key)
      if (!raw) return null
      const item = JSON.parse(raw) as StorageItem<T>
      if (
        !item ||
        typeof item !== 'object' ||
        !('value' in item) ||
        (item.expiresAt !== null && typeof item.expiresAt !== 'number')
      ) {
        this.remove(key)
        return null
      }
      if (item.expiresAt !== null && Date.now() >= item.expiresAt) {
        this.remove(key)
        return null
      }
      return item.value
    } catch {
      this.remove(key)
      return null
    }
  },
  remove(key: string): void {
    uni.removeStorageSync(PREFIX + key)
  },
}
