import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import {
  NodeTypes,
  type DirectiveNode,
  type ElementNode,
  type RootNode,
  type TemplateChildNode,
} from '@vue/compiler-dom'

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url))

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? vueFiles(path) : entry.name.endsWith('.vue') ? [path] : []
  })
}

function directive(node: ElementNode, name: string, argument: string): DirectiveNode | undefined {
  return node.props.find(
    (prop): prop is DirectiveNode =>
      prop.type === NodeTypes.DIRECTIVE &&
      prop.name === name &&
      prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION &&
      prop.arg.content === argument,
  )
}

function expression(prop: DirectiveNode | undefined): string {
  return prop?.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.exp.content : ''
}

function call(source: string): { name: string; args: string[] } {
  const file = ts.createSourceFile('button.ts', source, ts.ScriptTarget.Latest, true)
  const statement = file.statements[0]
  assert.ok(statement && ts.isExpressionStatement(statement), source)
  const expression = statement.expression
  assert.ok(ts.isCallExpression(expression) && ts.isIdentifier(expression.expression), source)
  return {
    name: expression.expression.text,
    args: expression.arguments.map((argument) => argument.getText(file).replace(/\s+/g, '')),
  }
}

// 全量模板审计防止后续按钮复用全页busy显示loading，或列表各行共用同一个进度身份。
test('所有页面和组件按钮的进度绑定只指向自己的动作与循环目标', () => {
  const identities = new Set<string>()
  let checked = 0
  for (const file of [
    ...vueFiles(join(sourceRoot, 'pages')),
    ...vueFiles(join(sourceRoot, 'components')),
  ]) {
    const template = parse(readFileSync(file, 'utf8')).descriptor.template?.ast
    if (!template) continue
    const name = relative(sourceRoot, file)
    function visit(node: RootNode | TemplateChildNode, targets: string[]) {
      if (node.type === NodeTypes.ELEMENT) {
        if (node.props.some((prop) => prop.type === NodeTypes.DIRECTIVE && prop.name === 'for')) {
          const target = expression(directive(node, 'bind', 'key')).replace(/\s+/g, '')
          assert.ok(target, `${name}：循环必须有目标身份`)
          targets = [...targets, target]
        }
        if (node.tag === 'button') {
          const handlerSource = expression(directive(node, 'on', 'click'))
          if (handlerSource.startsWith('runPageAction(')) {
            checked++
            const handler = call(handlerSource)
            assert.equal(handler.args.length, 2, `${name}：点击动作缺少独立身份`)
            const identity = handler.args[1]!
            assert.equal(identities.has(identity), false, `${name}：按钮重复使用进度身份`)
            identities.add(identity)
            for (const target of targets) {
              assert.ok(identity.includes(target), `${name}：循环按钮缺少当前目标 ${target}`)
            }
            const loading = expression(directive(node, 'bind', 'loading'))
            if (name === 'pages/verification/index.vue') {
              // 原生选图会暂时hide，该页用独立动作状态保留上传跨选图进度。
              if (loading)
                assert.ok(
                  ['uploading', 'submitting', 'querying', 'refreshing && !submitting'].includes(
                    loading,
                  ),
                )
              else assert.match(handlerSource, /\(\)\s*=>\s*(scanDemo|reviewDemo)\(/)
            } else {
              const pending = call(loading)
              assert.equal(
                pending.name,
                'isPageActionPending',
                `${name}：不能用全页busy显示按钮进度`,
              )
              assert.deepEqual(pending.args, [identity], `${name}：点击身份和进度身份不一致`)
            }
          }
        }
      }
      if (node.type === NodeTypes.ROOT || node.type === NodeTypes.ELEMENT) {
        for (const child of node.children) visit(child, targets)
      }
    }
    visit(template, [])
  }
  assert.ok(checked > 0, '必须覆盖实际页面按钮')
})
