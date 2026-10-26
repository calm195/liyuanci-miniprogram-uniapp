import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

export type ThemeMode = 'light' | 'dark'
const palettes = {
  light: {
    canvas: '#f3f6fb',
    surface: '#ffffff',
    ink: '#172033',
    muted: '#526176',
    line: '#cbd5e1',
    brand: '#2563eb',
    warning: '#fff1cc',
    'warning-ink': '#7a4600',
    danger: '#b42318',
  },
  dark: {
    canvas: '#0f172a',
    surface: '#1e293b',
    ink: '#e2e8f0',
    muted: '#b6c2d2',
    line: '#526176',
    brand: '#93c5fd',
    warning: '#493713',
    'warning-ink': '#fde68a',
    danger: '#fda4af',
  },
} as const

export const useThemeStore = defineStore('theme', () => {
  // 外观属于设备偏好，与账号和登录会话独立；只接受已知值，损坏缓存回退亮色。
  const mode = ref<ThemeMode>(storage.get<unknown>('theme') === 'dark' ? 'dark' : 'light')
  const palette = computed(() => palettes[mode.value])
  const variables = computed(() =>
    Object.entries(palette.value)
      .map(([key, value]) => `--theme-${key}:${value}`)
      .join(';'),
  )
  function syncNative() {
    const dark = mode.value === 'dark'
    // 每次页面显示时同步原生区域，避免导航到新页面后恢复 pages.json 的默认亮色。
    uni.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: palette.value.canvas,
    })
    uni.setBackgroundColor({
      backgroundColor: palette.value.canvas,
      backgroundColorTop: palette.value.canvas,
      backgroundColorBottom: palette.value.canvas,
    })
    uni.setBackgroundTextStyle({ textStyle: dark ? 'light' : 'dark' })
  }
  function setMode(value: ThemeMode) {
    if (value !== 'light' && value !== 'dark') return
    mode.value = value
    try {
      storage.set('theme', value)
    } catch {
      uni.showToast({ title: '外观已切换，但未能保存到本机', icon: 'none' })
    }
    syncNative()
  }
  return { mode, variables, setMode, syncNative }
})
