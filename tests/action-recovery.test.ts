import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import { actionRecoveryStore } from './support/page-runtime.ts'

test('原请求不能被其他键覆盖，换会话或账号即清空', async () => {
  const user = reactive({ user: { id: 'synthetic-owner' }, validated: true })
  const state = reactive({ epoch: 1 })
  const store = await actionRecoveryStore(user, {
    getEpoch: () => state.epoch,
    getToken: () => 'synthetic-token',
  })
  const command = {
    kind: 'wish',
    wish: { id: 'wish-a', version: 2 },
    action: 'complete',
    owner: 'synthetic-owner',
    epoch: 1,
    key: 'key-a',
  }
  assert.equal(store.save('wish:wish-a', command), true)
  assert.equal(store.save('wish:wish-a', { ...command, key: 'key-b' }), false)
  store.remove('wish:wish-a', 'key-b')
  assert.equal(store.get('wish:wish-a').key, 'key-a')
  state.epoch++
  assert.equal(store.get('wish:wish-a'), null)
  assert.equal(store.save('wish:wish-a', { ...command, epoch: 2 }), true)
  user.user.id = 'synthetic-other'
  assert.equal(store.get('wish:wish-a'), null)
})
