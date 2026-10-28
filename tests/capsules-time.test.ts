import test from 'node:test'
import assert from 'node:assert/strict'
import { beijingTime, capsuleUnlockAt } from '../src/utils/capsules.ts'

test('REQ-011：北京时间转换独立设备时区，秒精度、闰日及60秒/365天含边界', () => {
  const now = Date.parse('2028-02-28T16:00:07Z')
  assert.equal(beijingTime(new Date(now).toISOString()), '2028-02-29 00:00:07')
  for (const seconds of [60, 31536000]) {
    const utc = new Date(now + seconds * 1000).toISOString().replace('.000Z', 'Z')
    assert.equal(capsuleUnlockAt(beijingTime(utc), now), utc)
  }
  for (const seconds of [59, 31536001])
    assert.throws(() =>
      capsuleUnlockAt(beijingTime(new Date(now + seconds * 1000).toISOString()), now),
    )
  for (const local of [
    '2027-02-29 12:00:00',
    '2028-02-30 12:00:00',
    '2028-02-29 24:00:00',
    '2028-02-29 00:00:60',
    '2028-02-29 00:00:1',
  ])
    assert.throws(() => capsuleUnlockAt(local, now))
})
