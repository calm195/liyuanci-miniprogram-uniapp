import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createSSRApp, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { loadRuntime, pageScript } from './support/page-runtime.ts'

const file = new URL('../src/components/CommentComposer.vue', import.meta.url)
async function setup(values: Record<string, unknown> = {}) {
  const props = reactive<Record<string, unknown>>({
    modelValue: '原稿',
    title: '写回复',
    expanded: true,
    ...values,
  })
  const events: unknown[][] = []
  const runtime = await loadRuntime(
    pageScript(file) +
      '\nexport { input, close, submit, cancel, characterCount, submitLocked, cancelLocked }',
    {
      defineProps: () => props,
      withDefaults: (target: typeof props, defaults: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(defaults))
          if (target[key] === undefined) target[key] = value
        return target
      },
      defineEmits:
        () =>
        (...args: unknown[]) =>
          events.push(args),
    },
  )
  return { props, events, runtime }
}

let component: unknown
async function render(props: Record<string, unknown>) {
  if (!component) {
    const { descriptor } = parse(readFileSync(file, 'utf8'))
    const script = compileScript(descriptor, {
      id: 'comment-composer-test',
      inlineTemplate: true,
      templateOptions: {
        ssr: true,
        compilerOptions: { isCustomElement: (tag) => tag === 'view' || tag === 'text' },
      },
    })
    const source = script.content.replace(
      /from (['"])(vue(?:\/server-renderer)?)\1/g,
      (_match, _quote, name: string) => `from ${JSON.stringify(import.meta.resolve(name))}`,
    )
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    component = (
      await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
    ).default
  }
  return renderToString(
    createSSRApp({
      render: () =>
        h(component as Parameters<typeof h>[0], props, {
          context: () => h('text', '审核状态'),
          feedback: () => h('text', '恢复入口'),
        }),
    }),
  )
}
function button(html: string, name: string) {
  return (
    html.match(new RegExp(`<button[^>]*class="[^"]*comment-composer-${name}[^"]*"[^>]*>`))?.[0] ??
    ''
  )
}

test('公共编辑框输入是受控事件，原样保留空格换行并按Unicode码点计数', async () => {
  const s = await setup()
  const body = '  A😀\n𠮷  '
  s.runtime.input({ detail: { value: body } })
  assert.deepEqual(s.events, [['update:modelValue', body]])
  assert.equal(s.props.modelValue, '原稿')
  s.props.modelValue = body
  assert.equal(s.runtime.characterCount.value, 8)
  s.runtime.input({ target: { value: 'DOM输入\n' } })
  assert.deepEqual(s.events[1], ['update:modelValue', 'DOM输入\n'])
  s.runtime.input({ detail: { value: 'uni原文' }, target: { value: '不同值' } })
  assert.deepEqual(s.events[2], ['update:modelValue', 'uni原文'])
  s.runtime.input(null)
  s.runtime.input({ detail: { value: 42 } })
  assert.equal(s.events.length, 3)
})

test('公共编辑框输入锁定与原请求重试分别控制，loading不替代业务禁用条件', async () => {
  const s = await setup({ disabled: true, canCancel: true })
  s.runtime.input({ detail: { value: '不应写入' } })
  s.runtime.submit()
  s.runtime.cancel()
  assert.deepEqual(s.events, [])
  s.props.submitDisabled = false
  s.props.loading = true
  s.runtime.submit()
  assert.deepEqual(s.events, [['submit']])
  s.props.cancelDisabled = false
  s.runtime.cancel()
  assert.deepEqual(s.events[1], ['cancel'])
  s.props.disabled = false
  s.props.submitDisabled = true
  s.runtime.input({ detail: { value: '可修改草稿' } })
  s.runtime.submit()
  assert.deepEqual(s.events.slice(2), [['update:modelValue', '可修改草稿']])
})

test('公共编辑框收起只通知父组件，不清稿、不改变展开与提交状态', async () => {
  const s = await setup({
    modelValue: '保留的未知结果草稿',
    disabled: true,
    loading: true,
    submitDisabled: false,
  })
  s.runtime.close()
  assert.deepEqual(s.events, [['close']])
  assert.equal(s.props.modelValue, '保留的未知结果草稿')
  assert.equal(s.props.expanded, true)
  assert.equal(s.props.submitDisabled, false)
  s.props.expanded = false
  s.props.expanded = true
  assert.equal(s.props.modelValue, '保留的未知结果草稿')
  s.props.editable = false
  s.runtime.input({ detail: { value: '不可编辑' } })
  s.runtime.submit()
  assert.equal(s.events.length, 1)
})

test('公共编辑框实际模板保留状态恢复插槽，并分离平台截断与展示上限', async () => {
  const html = await render({
    modelValue: '😀𠮷A',
    title: '回复同学',
    expanded: true,
    disabled: true,
    canCancel: true,
    maxlength: -1,
  })
  assert.match(html, /3 \/ 500/)
  assert.match(html, /maxlength="-1"/)
  assert.doesNotMatch(html, /comment-composer-panel-hidden/)
  assert.match(button(html, 'submit'), /disabled/)
  assert.match(button(html, 'cancel'), /disabled/)
  const retry = await render({
    modelValue: '原请求',
    title: '回复同学',
    expanded: true,
    disabled: true,
    submitDisabled: false,
    submitLabel: '核实原请求',
    maxlength: 80,
    countLimit: 500,
  })
  assert.doesNotMatch(button(retry, 'submit'), /disabled/)
  assert.match(retry, /maxlength="80"/)
  assert.match(retry, /3 \/ 500/)
  assert.match(retry, /核实原请求/)
  const readonly = await render({
    modelValue: '仍由父组件保留',
    title: '回复同学',
    expanded: false,
    editable: false,
  })
  assert.match(readonly, /comment-composer-panel/)
  assert.match(readonly, /comment-composer-panel-hidden/)
  assert.match(readonly, /display:none/)
  assert.match(readonly, /审核状态/)
  assert.match(readonly, /恢复入口/)
  assert.doesNotMatch(readonly, /<textarea/)
  assert.equal(button(readonly, 'submit'), '')
  assert.ok(readonly.indexOf('审核状态') < readonly.indexOf('恢复入口'))
})

test('公共编辑框收起后保留输入节点，并给微信端显式隐藏标记', async () => {
  const props = { modelValue: '  未发送的草稿\n', title: '写回复', expanded: false }
  const collapsed = await render(props)
  assert.match(collapsed, /comment-composer-panel-hidden/)
  assert.match(collapsed, /<textarea/)
  assert.ok(collapsed.includes(props.modelValue))
  const expanded = await render({ ...props, expanded: true })
  assert.doesNotMatch(expanded, /comment-composer-panel-hidden/)
  assert.ok(expanded.includes(props.modelValue))
})
