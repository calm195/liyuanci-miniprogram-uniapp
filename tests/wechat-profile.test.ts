import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import type { WechatProfileChoice } from '../src/types/settings.ts'
import { loadRuntime, pageScript } from './support/page-runtime.ts'

const page = new URL('../src/components/WechatProfileSheet.vue', import.meta.url)
const form = (nickname: string) => ({ detail: { value: { nickname } } })
const input = (value: string) => ({ detail: { value } })

async function setup(hasReview = true) {
  const props = reactive({ busy: false, submitted: false, retryLabel: '' })
  const results: (WechatProfileChoice | undefined)[] = []
  const runtime = await loadRuntime(
    pageScript(page) +
      '\nexport { chosenAvatar, typedNickname, nicknameNotice, chooseAvatar, nicknameBlur, nicknameReview, skipNickname, submit }',
    {
      defineProps: () => props,
      defineEmits: () => (event: string, value?: WechatProfileChoice) => {
        assert.equal(event, 'save')
        results.push(value)
      },
      onMounted: () => {},
      useThemeStore: () => ({ mode: 'light' }),
      uni: { canIUse: (feature: string) => feature !== 'input.bindnicknamereview' || hasReview },
    },
  )
  return { runtime, props, results }
}

test('微信推荐昵称用失焦值和审核回执，审核后以原生表单结果保存', async () => {
  const { runtime: r, results } = await setup()
  assert.equal(r.typedNickname.value, '')
  r.nicknameBlur(input(' 小满 '))
  assert.equal(r.typedNickname.value, '小满')
  r.submit(form(' 小满 '))
  assert.match(r.nicknameNotice.value, /正在校验/)
  r.nicknameReview({ detail: { pass: true } })
  r.submit(form(' 小满 '))
  assert.deepEqual(results, [{ avatar: '', nickname: '小满' }])
})

test('昵称审核拒绝或被清空时，不静默提交已选头像', async () => {
  const { runtime: r, results } = await setup()
  r.chooseAvatar({ detail: { avatarUrl: 'wxfile://selected' } })
  r.chooseAvatar({ detail: { errMsg: 'chooseAvatar:fail cancel' } })
  r.nicknameBlur(input('待审核昵称'))
  r.nicknameReview({ detail: { pass: false } })
  r.submit(form(''))
  assert.match(r.nicknameNotice.value, /保留原昵称/)
  assert.deepEqual(results, [])
  r.skipNickname()
  assert.equal(r.typedNickname.value, '')
  r.submit(form(''))
  assert.deepEqual(results, [{ avatar: 'wxfile://selected', nickname: '' }])
})

test('低基础库可用原生表单终值，已提交时重试原请求', async () => {
  const { runtime: r, props, results } = await setup(false)
  r.submit(form('松'.repeat(41)))
  assert.match(r.nicknameNotice.value, /最多 40 字/)
  r.submit(form('小满'))
  props.submitted = true
  props.retryLabel = '确认保存结果'
  r.submit(form('不替换已发送请求'))
  assert.deepEqual(results, [{ avatar: '', nickname: '小满' }, undefined])
})
