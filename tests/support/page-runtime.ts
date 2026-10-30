import { readFileSync } from 'node:fs'
import ts from 'typescript'

// 执行实际页面脚本及API适配器，仅替换平台、会话与传输边界。
export async function loadRuntime(source: string, context: Record<string, unknown>) {
  const key = `runtime_${Math.random().toString(36).slice(2)}`
  Object.assign(globalThis, { [key]: context })
  const body = source.replace(/^import\s[\s\S]*?from\s+'([^']+)'\n/gm, (_all, name) =>
    name === 'vue'
      ? `import { computed, nextTick, ref, watch } from '${import.meta.resolve('vue')}'\n`
      : '',
  )
  const compiled = ts.transpileModule(
    `const { ${Object.keys(context).join(', ')} } = globalThis[${JSON.stringify(key)}];\n${body}`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    },
  ).outputText
  try {
    return await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
  } finally {
    Reflect.deleteProperty(globalThis, key)
  }
}
export function pageScript(url: URL) {
  return readFileSync(url, 'utf8').split('<script setup lang="ts">')[1]!.split('</script>')[0]!
}
export async function settle() {
  for (let i = 0; i < 25; i++) await Promise.resolve()
}
