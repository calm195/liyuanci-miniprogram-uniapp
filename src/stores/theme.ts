import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

export type ThemeMode = 'light' | 'dark'
export type ThemePreference = ThemeMode | 'system'
const palettes = {
  light: {
    canvas: '#fcfaf7',
    surface: '#ffffff',
    ink: '#091d3d',
    muted: '#617184',
    line: '#e9e9e7',
    brand: '#ff4c3e',
    peach: '#fff0e9',
    mint: '#e1f7f4',
    teal: '#137e83',
    navy: '#253b57',
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
    brand: '#ff9288',
    peach: '#3e2e30',
    mint: '#193a3d',
    teal: '#8fdbd6',
    navy: '#253b57',
    warning: '#493713',
    'warning-ink': '#fde68a',
    danger: '#fda4af',
  },
} as const

function readSystemMode() {
  return uni.getAppBaseInfo?.().theme ?? uni.getSystemInfoSync?.().theme
}

export const useThemeStore = defineStore('theme', () => {
  // 保留设备上已保存的手动选择，未设置或缓存损坏时跟随系统。
  const saved = storage.get<unknown>('theme')
  const preference = ref<ThemePreference>(saved === 'light' || saved === 'dark' ? saved : 'system')
  const systemMode = ref<ThemeMode>(readSystemMode() === 'dark' ? 'dark' : 'light')
  const mode = computed(() => (preference.value === 'system' ? systemMode.value : preference.value))
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
      // 首次启动时页面可能尚未建立；页面 onShow 会再次同步。
      fail: () => {},
    })
    uni.setBackgroundColor?.({
      backgroundColor: palette.value.canvas,
      backgroundColorTop: palette.value.canvas,
      backgroundColorBottom: palette.value.canvas,
    })
    uni.setBackgroundTextStyle?.({ textStyle: dark ? 'light' : 'dark' })
  }
  function updateSystemMode(value = readSystemMode()) {
    if (value === 'light' || value === 'dark') systemMode.value = value
    if (preference.value === 'system') syncNative()
  }
  function setMode(value: ThemePreference) {
    if (value === preference.value) return
    preference.value = value
    if (value === 'system') updateSystemMode()
    else syncNative()
    try {
      storage.set('theme', value)
    } catch {
      // 存储失败时保留当前运行期间的外观选择。
    }
  }
  return { preference, mode, variables, setMode, syncNative, updateSystemMode }
})
