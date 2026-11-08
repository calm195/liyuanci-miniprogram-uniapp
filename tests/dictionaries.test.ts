import { readFileSync } from 'node:fs'
import { loadRuntime } from './support/page-runtime.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed } from 'vue'
import {
  dictionaryLabel,
  parseDictionaries,
  replaceDictionaries,
} from '../src/features/dictionaries/catalog.ts'
import { wishStateLabels } from '../src/utils/wish.ts'
import { pageTicket } from '../src/utils/page-scope.ts'

test('字典发布响应式更新展示，迟到版本不覆盖，未知编码不伪造名称', () => {
  const label = computed(() => wishStateLabels.published)
  const data = (version: number, text: string) =>
    parseDictionaries({
      version,
      items: [{ type: 'wish_state', code: 'published', label: text, enabled: true, sort_order: 0 }],
    })
  replaceDictionaries(data(2, '已上架'))
  assert.equal(label.value, '已上架')
  replaceDictionaries(data(3, '公开中'))
  assert.equal(label.value, '公开中')
  replaceDictionaries(data(2, '旧名称'))
  assert.equal(label.value, '公开中')
  assert.equal(dictionaryLabel('wish_state', 'unknown'), '名称暂不可用')
  assert.throws(() => parseDictionaries({ version: 4, items: [{ type: 'wish_state' }] }))
  const one = data(4, '公开中')
  assert.throws(() => parseDictionaries({ ...one, items: [...one.items, ...one.items] }))
})

test('请求作用域绑定可见性、页面代次、会话及主体', () => {
  let visible = true,
    generation = 0,
    epoch = 0,
    owner = 'one'
  const ticket = () =>
    pageTicket(
      () => visible,
      () => generation,
      () => epoch,
      () => owner,
    )
  let active = ticket()
  assert.equal(active(), true)
  epoch++
  assert.equal(active(), false)
  active = ticket()
  owner = 'two'
  assert.equal(active(), false)
  active = ticket()
  generation++
  assert.equal(active(), false)
  active = ticket()
  visible = false
  assert.equal(active(), false)
})

test('字典并发刷新复用请求，失败保留已验证快照并允许再次刷新', async () => {
  let count = 0
  let fail = true
  const { refreshDictionaries } = await loadRuntime(
    readFileSync(new URL('../src/features/dictionaries/load.ts', import.meta.url), 'utf8'),
    {
      request: async (options: { auth: boolean; silent: boolean }) => {
        count++
        assert.equal(options.auth, false)
        assert.equal(options.silent, true)
        if (fail) throw new Error('合成网络故障')
        return {
          version: 20,
          items: [
            {
              type: 'resource_feedback',
              code: 'valid',
              label: '有效资料',
              sort_order: 0,
              enabled: true,
            },
          ],
        }
      },
      parseDictionaries,
      replaceDictionaries,
    },
  )
  const before = dictionaryLabel('wish_state', 'published')
  const first = refreshDictionaries()
  assert.equal(refreshDictionaries(), first)
  await assert.rejects(first)
  assert.equal(count, 1)
  assert.equal(dictionaryLabel('wish_state', 'published'), before)
  fail = false
  await refreshDictionaries()
  assert.equal(count, 2)
  assert.equal(dictionaryLabel('resource_feedback', 'valid'), '有效资料')
})
