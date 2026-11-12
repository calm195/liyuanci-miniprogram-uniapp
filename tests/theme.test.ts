import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { loadRuntime, pageScript } from './support/page-runtime.ts'

const source = readFileSync(new URL('../src/stores/theme.ts', import.meta.url), 'utf8')

test('主题在跨页和重启后保持一致，坏缓存与存储失败可恢复', async () => {
  let saved: unknown = 'invalid'
  let failSave = false
  let systemMode: string | undefined
  const navigation: Record<string, unknown>[] = []
  const backgrounds: Record<string, unknown>[] = []
  const hints: Record<string, unknown>[] = []
  Object.assign(globalThis, {
    uni: {
      getAppBaseInfo: () => ({ theme: systemMode }),
      setNavigationBarColor: (value: Record<string, unknown>) => navigation.push(value),
      setBackgroundColor: (value: Record<string, unknown>) => backgrounds.push(value),
      setBackgroundTextStyle: () => {},
      $emit: (_event: string, value: Record<string, unknown>) => hints.push(value),
    },
  })
  const { useThemeStore } = await loadRuntime(source, {
    defineStore,
    storage: {
      get: () => saved,
      set: (_key: string, value: unknown) => {
        if (failSave) throw new Error('合成存储故障')
        saved = value
      },
    },
  })
  setActivePinia(createPinia())
  const theme = useThemeStore()
  assert.equal(theme.preference, 'system')
  assert.equal(theme.mode, 'light')
  theme.updateSystemMode('dark')
  assert.equal(theme.mode, 'dark')
  assert.equal(navigation.at(-1)?.frontColor, '#ffffff')
  assert.equal(hints.length, 0)
  theme.setMode('dark')
  assert.equal(saved, 'dark')
  theme.updateSystemMode('light')
  assert.equal(theme.mode, 'dark')
  assert.match(theme.variables, /--theme-canvas:#0f172a/)
  assert.equal(navigation.at(-1)?.frontColor, '#ffffff')
  assert.equal(backgrounds.at(-1)?.backgroundColor, '#0f172a')
  // 新页面进入与后台恢复使用同一偏好，重新创建 Pinia 模拟应用重启。
  theme.syncNative()
  assert.equal(navigation.at(-1)?.backgroundColor, '#0f172a')
  setActivePinia(createPinia())
  const restarted = useThemeStore()
  assert.equal(restarted.preference, 'dark')
  assert.equal(restarted.mode, 'dark')
  failSave = true
  restarted.setMode('light')
  assert.equal(restarted.mode, 'light')
  assert.equal(navigation.at(-1)?.frontColor, '#000000')
  assert.equal(hints.length, 0)
  assert.equal(saved, 'dark')
  failSave = false
  systemMode = 'dark'
  restarted.setMode('system')
  assert.equal(saved, 'system')
  assert.equal(restarted.mode, 'dark')
  systemMode = 'light'
  restarted.updateSystemMode()
  assert.equal(restarted.mode, 'light')
  systemMode = 'dark'
  setActivePinia(createPinia())
  assert.equal(useThemeStore().preference, 'system')
  assert.equal(useThemeStore().mode, 'dark')
  assert.equal(hints.length, 0)
})

test('个人中心每次点击循环切换外观偏好', async () => {
  const theme = reactive({
    preference: 'system',
    setMode(value: string) {
      theme.preference = value
    },
  })
  const page = await loadRuntime(
    pageScript(new URL('../src/pages/profile/index.vue', import.meta.url)) +
      '\nexport { cycleTheme };',
    {
      useUserStore: () => ({}),
      useThemeStore: () => theme,
      useEntryStore: () => ({}),
      useUnreadStore: () => ({ count: 0, label: '' }),
      onShow: () => {},
      onPullDownRefresh: () => {},
    },
  )
  for (const expected of ['light', 'dark', 'system']) {
    page.cycleTheme()
    assert.equal(theme.preference, expected)
  }
})
