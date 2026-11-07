import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadRuntime } from './support/page-runtime.ts'

test('冷启动恢复同环境令牌、跨环境隔离，清理后不能恢复旧会话', async () => {
  const values = new Map<string, unknown>()
  const uni = {
    getStorageSync: (key: string) => values.get(key),
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
    removeStorageSync: (key: string) => values.delete(key),
    showToast() {},
  }
  const source = readFileSync(new URL('../src/utils/session.ts', import.meta.url), 'utf8')
  const first = (await loadRuntime(source, { uni })).session
  first.restore('https://synthetic.invalid/api/v1')
  first.setToken('synthetic-session')
  const restarted = (await loadRuntime(source, { uni })).session
  restarted.restore('https://synthetic.invalid/api/v1')
  assert.equal(restarted.getToken(), 'synthetic-session')
  restarted.restore('https://other.invalid/api/v1')
  assert.equal(restarted.getToken(), '')
  restarted.restore('https://synthetic.invalid/api/v1')
  restarted.clear()
  const afterLogout = (await loadRuntime(source, { uni })).session
  afterLogout.restore('https://synthetic.invalid/api/v1')
  assert.equal(afterLogout.getToken(), '')
  values.set('liyuanci:session:https://synthetic.invalid/api/v1', { token: 'bad-object' })
  afterLogout.restore('https://synthetic.invalid/api/v1')
  assert.equal(afterLogout.getToken(), '')
  assert.equal(values.size, 0)
})
