import { computed, ref } from 'vue'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'

const revision = ref(0)

export function useHiddenWishes() {
  const user = useUserStore()
  // 游客与不同账号分开保存，隐藏偏好不改变公开链接或应愿关系。
  const key = computed(
    () => `liyuanci:hidden-wishes:${config.apiBaseUrl}:${user.user?.id || 'guest'}`,
  )
  const hidden = computed(() => {
    void revision.value
    try {
      const saved: unknown = uni.getStorageSync(key.value)
      return new Set<string>(
        Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [],
      )
    } catch {
      return new Set<string>()
    }
  })
  function toggle(id: string) {
    const next = new Set(hidden.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    uni.setStorageSync(key.value, [...next])
    revision.value++
    return next.has(id)
  }
  return { hidden, toggle }
}
