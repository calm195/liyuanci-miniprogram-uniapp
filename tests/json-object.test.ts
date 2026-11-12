import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { matchesSchema } from '../src/utils/whispers-schema.ts'
import { matchesResourceSchema } from '../src/utils/resource-schema.ts'

test('微信桥接跨上下文JSON对象保持严格字段校验', () => {
  const schema = {
    type: 'object',
    properties: { count: { type: 'integer', minimum: 0 } },
    required: ['count'],
    additionalProperties: false,
  }
  for (const validate of [matchesSchema, matchesResourceSchema]) {
    assert.equal(validate(schema, runInNewContext('({count: 2})'), {}), true)
    assert.equal(validate(schema, runInNewContext('({count: -1})'), {}), false)
    assert.equal(validate(schema, runInNewContext('({count: 2, extra: true})'), {}), false)
    assert.equal(
      validate(
        schema,
        new (class {
          count = 2
        })(),
        {},
      ),
      false,
    )
  }
})
