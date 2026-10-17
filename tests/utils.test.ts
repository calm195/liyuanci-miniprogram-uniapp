import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPhone, isEmail, isPassword } from '../src/utils/validate.ts'
import { storage } from '../src/utils/storage.ts'

const values = new Map<string, string>()
// 用最小适配层测试 uni storage 的缓存行为，不依赖微信运行时。
Object.assign(globalThis, {
  uni: {
    setStorageSync: (key: string, value: string) => values.set(key, value),
    getStorageSync: (key: string) => values.get(key) || '',
    removeStorageSync: (key: string) => values.delete(key),
  },
})
test('T004 / REQ-020：模板工具边界校验（不作为业务登录）', () => {
  assert.equal(isPhone('13800138000'), true)
  assert.equal(isPhone('12800138000'), false)
  assert.equal(isPhone('138001380001'), false)
  assert.equal(isEmail('demo@example.com'), true)
  assert.equal(isEmail('demo@'), false)
  assert.equal(isPassword('1234567'), false)
  assert.equal(isPassword('12345678'), true)
  assert.equal(isPassword('a'.repeat(33)), false)
})
test('T004 / REQ-018、020：模板缓存过期与命名空间隔离', () => {
  storage.set('user', { nickname: '测试' })
  assert.deepEqual(storage.get('user'), { nickname: '测试' })
  storage.set('expired', 'value', -1)
  assert.equal(storage.get('expired'), null)
  assert.equal(values.has('uni-starter:expired'), false)
  values.set('uni-starter:broken', '{')
  assert.equal(storage.get('broken'), null)
  assert.equal(values.has('uni-starter:broken'), false)
  values.set('other-project:user', 'preserved')
  storage.remove('user')
  assert.equal(storage.get('user'), null)
  assert.equal(values.get('other-project:user'), 'preserved')
})
