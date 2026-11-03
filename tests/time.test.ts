import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beijingTime, displayDate, displayFriendly, displayTime } from '../src/utils/time.ts'

test('时间换算固定东八区，跨日仍按北京时间切分', () => {
  assert.equal(beijingTime('2026-11-03T12:44:00Z'), '2026-11-03 20:44:00')
  // UTC 16:30 已是北京时间次日 00:30，跨日不能沿用 UTC 日期。
  assert.equal(beijingTime('2026-11-03T16:30:00Z'), '2026-11-04 00:30:00')
  assert.equal(displayTime('2026-11-03T12:44:00Z'), '2026-11-03 20:44')
  assert.equal(displayDate('2026-11-03T16:30:00Z'), '2026-11-04')
})

test('严格版在时间不可用时抛出可读错误，保持既有校验行为', () => {
  assert.throws(() => beijingTime(''), /服务端时间不可用/)
  assert.throws(() => beijingTime('不是时间'), /服务端时间不可用/)
})

test('展示版对缺失与异常值降级为占位符，绝不抛异常', () => {
  const unusable = [null, undefined, '', '不是时间', '2026-13-45T99:99:99Z']
  for (const value of unusable) {
    assert.equal(displayTime(value), '—')
    assert.equal(displayDate(value), '—')
    assert.equal(displayFriendly(value), '—')
  }
})

test('友好时间按北京日期判断今天、昨天与跨年', () => {
  // 基准：北京时间 2026-11-03 18:00
  const now = Date.parse('2026-11-03T10:00:00Z')
  assert.equal(displayFriendly('2026-11-03T06:23:00Z', now), '14:23')
  assert.equal(displayFriendly('2026-11-02T06:23:00Z', now), '昨天 14:23')
  assert.equal(displayFriendly('2026-10-23T06:23:00Z', now), '10月23日 14:23')
  assert.equal(displayFriendly('2025-11-03T06:23:00Z', now), '2025年11月3日 14:23')
})

test('跨日边界以北京时间为准，而非 UTC 日期', () => {
  // 基准：北京时间 2026-11-03 00:30，此时 UTC 仍是 11-02。
  const now = Date.parse('2026-11-02T16:30:00Z')
  // 北京时间 11-02 23:59 应算作昨天，UTC 日期同为 11-02 也不会误判为今天。
  assert.equal(displayFriendly('2026-11-02T15:59:00Z', now), '昨天 23:59')
  // 北京时间 11-03 00:10 与基准同一天。
  assert.equal(displayFriendly('2026-11-02T16:10:00Z', now), '00:10')
})
