import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canAct, verificationLabel } from '../src/utils/access.ts'
import { session } from '../src/utils/session.ts'
import type { UserInfo } from '../src/types/api.ts'
test('T009 / REQ-002：认证与动作权限同时满足，所有未认证状态拒绝', () => {
  assert.equal(verificationLabel(null), '未登录')
  assert.equal(canAct(null, 'postWishes'), false)
  for (const state of ['unverified', 'pending', 'rejected', 'verified'] as const) {
    const me: UserInfo = {
      id: 'synthetic',
      version: 1,
      verification: state,
      allowed_actions: ['postWishes'],
    }
    assert.equal(canAct(me, 'postWishes'), state === 'verified')
    assert.equal(canAct(me, 'unknown-action'), false)
    assert.ok(verificationLabel(me))
  }
})
test('T009 / REQ-018：会话清理推进代次，不能复用旧响应', () => {
  session.setToken('synthetic-test-only')
  const epoch = session.getEpoch()
  session.clear()
  assert.equal(session.getToken(), '')
  assert.ok(session.getEpoch() > epoch)
})
