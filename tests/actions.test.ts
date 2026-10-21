import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canMeAction, canWishAction, verificationInput } from '../src/utils/actions.ts'
import type { UserInfo } from '../src/types/api.ts'
import type { WishResult } from '../src/types/wish.ts'
const me: UserInfo = {
  id: 'synthetic-a',
  version: 99,
  verification: 'verified',
  allowed_actions: ['postWishes', 'postWishesIdPublish', 'unknown'],
}
const wish: WishResult = {
  id: 'synthetic-wish-a',
  version: 9,
  content_version: 3,
  current_state: 'ready',
  allowed_actions: ['postWishesIdPublish', 'postWishesIdSubmitReview', 'postWishes'],
}
test('B14 / REQ-018：正式动作投影、目标、未知与缺失均失败关闭', () => {
  assert.equal(canMeAction(me, me.id, 'postWishes', true), true)
  assert.equal(canMeAction(me, 'synthetic-b', 'postWishes', true), false)
  assert.equal(canMeAction(me, me.id, 'postWishesIdPublish', true), false)
  assert.equal(canMeAction(me, me.id, 'unknown', true), false)
  assert.equal(canMeAction(me, me.id, 'postWishes', false), false)
  for (const actions of [undefined, null, [], ['content.scan'], 'postWishes']) {
    assert.equal(
      canMeAction({ ...me, allowed_actions: actions } as UserInfo, me.id, 'postWishes', true),
      false,
    )
    assert.equal(
      canWishAction(
        me,
        true,
        { ...wish, allowed_actions: actions } as WishResult,
        wish.id,
        'postWishesIdPublish',
      ),
      false,
    )
  }
  assert.equal(canWishAction(me, true, wish, wish.id, 'postWishesIdPublish'), true)
  assert.equal(canWishAction(me, true, wish, 'synthetic-wish-b', 'postWishesIdPublish'), false)
  assert.equal(canWishAction(me, true, wish, wish.id, 'postWishes'), false)
  assert.equal(
    canWishAction(
      me,
      true,
      { ...wish, privacy_review_required: true },
      wish.id,
      'postWishesIdPublish',
    ),
    false,
  )
  assert.equal(
    canWishAction({ ...me, verification: 'rejected' }, true, wish, wish.id, 'postWishesIdPublish'),
    false,
  )
  assert.equal(
    canWishAction(
      me,
      true,
      { ...wish, content_version: undefined },
      wish.id,
      'postWishesIdSubmitReview',
    ),
    false,
  )
})
test('B14 / 002-A/B/C：首次省略版本，重提只取审核记录，扫描通过不代替认证授权', () => {
  const asset = { asset_id: 'synthetic-asset', scan_status: 'approved' } as const
  const first = verificationInput('合成姓名', '合成学号', asset, { state: 'absent', record: null })
  assert.equal(Object.prototype.hasOwnProperty.call(first, 'expected_version'), false)
  const record = { request_id: 'synthetic-review', status: 'rejected', version: 7 } as const
  assert.equal(
    verificationInput('合成姓名', '合成学号', asset, { state: 'present', record }).expected_version,
    7,
  )
  for (const scan_status of ['pending', 'rejected'] as const)
    assert.throws(() =>
      verificationInput(
        '合成姓名',
        '合成学号',
        { ...asset, scan_status },
        { state: 'absent', record: null },
      ),
    )
  assert.throws(() =>
    verificationInput('合成姓名', '合成学号', asset, { state: 'unknown', record: null }),
  )
  for (const status of ['pending', 'approved'] as const)
    assert.throws(() =>
      verificationInput('合成姓名', '合成学号', asset, {
        state: 'present',
        record: { ...record, status },
      }),
    )
  assert.throws(() =>
    verificationInput('合成姓名', '合成学号', asset, {
      state: 'present',
      record: { ...record, version: 0 },
    }),
  )
  assert.equal(
    canMeAction(
      { ...me, verification: 'unverified', allowed_actions: ['postMeVerificationRequests'] },
      me.id,
      'postMeVerificationRequests',
      true,
    ),
    true,
  )
  assert.equal(
    canMeAction(
      { ...me, verification: 'pending', allowed_actions: ['postMeVerificationRequests'] },
      me.id,
      'postMeVerificationRequests',
      true,
    ),
    false,
  )
})
