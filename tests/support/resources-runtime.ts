import { readFileSync } from 'node:fs'
import { reactive } from 'vue'
import { session } from '../../src/utils/session.ts'
import { resourceOperations, resourceSchemas } from '../../src/utils/resource-contract.ts'
import * as schema from '../../src/utils/resource-schema.ts'
import * as helpers from '../../src/utils/resources.ts'
import { beijingTime } from '../../src/utils/capsules.ts'
import { loadRuntime, pageScript, settle } from './page-runtime.ts'
import type { UserInfo } from '../../src/types/api.ts'
import type { RequestResponse } from '../../src/utils/request.ts'
export type Input = {
  url: string
  method: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}
export const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/resources.json', import.meta.url), 'utf8'),
)
export const resourceId = 'ac230000-0000-4000-8000-000000000001'
export const categoryId = 'ac230000-0000-4000-8000-000000000002'
export function sample(operation: string) {
  return structuredClone(
    fixture.exchanges.find((e: { operation_id: string }) => e.operation_id === operation).body.data,
  )
}
export function envelope(data: unknown, statusCode = 200) {
  return {
    statusCode,
    data: { code: 0, message: '合成成功', data, request_id: 'synthetic-response' },
    header: { 'Cache-Control': 'no-store' },
  }
}
export async function resourcesRuntime(transport: (input: Input) => Promise<RequestResponse>) {
  const calls: Input[] = []
  const runtime = await loadRuntime(
    readFileSync(new URL('../../src/utils/request.ts', import.meta.url), 'utf8'),
    {
      config: { apiBaseUrl: 'https://synthetic.invalid/api/v1', useMock: false, isDev: false },
      session,
      uni: {
        request(
          options: Input & { success: (response: RequestResponse) => void; fail: () => void },
        ) {
          calls.push(
            structuredClone({
              url: options.url,
              method: options.method,
              data: options.data,
              header: options.header,
            }),
          )
          void transport(options).then(options.success, options.fail)
        },
        $emit() {},
        showToast() {},
      },
    },
  )
  const api = await loadRuntime(
    readFileSync(new URL('../../src/api/resources.ts', import.meta.url), 'utf8'),
    {
      ...runtime,
      session,
      resourceOperations,
      resourceSchemas,
      ...schema,
    },
  )
  return { ...api, ...runtime, calls }
}
export async function setupResourcePage(
  name: 'index' | 'detail',
  verification: UserInfo['verification'] | 'guest' = 'verified',
) {
  session.clear()
  if (verification !== 'guest') session.setToken('synthetic-resource-session')
  const user = reactive({
    user:
      verification === 'guest'
        ? null
        : ({
            id: 'synthetic-owner',
            version: 1,
            verification,
            allowed_actions: [],
          } as UserInfo | null),
    validated: verification !== 'guest',
    isLoggedIn: verification !== 'guest',
    async refresh() {
      this.validated = true
    },
  })
  let detail = { ...sample('resourceDetail'), my_feedback: null }
  let transport: (input: Input) => Promise<RequestResponse> = async (input) => {
    const path = input.url.split('/api/v1')[1]!
    if (path.startsWith('/resource-categories')) return envelope(sample('resourceCategoriesList'))
    if (path.startsWith('/resources?')) return envelope(sample('resourcesList'))
    if (path.includes('/download-info')) return envelope(sample('resourceDownloadInfo'))
    if (input.method === 'PUT') {
      const feedback = {
        ...sample('resourceFeedbackPut'),
        kind: input.data?.kind,
        version: Number(input.data?.expected_feedback_version) + 1,
      }
      detail = { ...detail, my_feedback: feedback }
      return envelope(feedback)
    }
    return envelope(detail)
  }
  const api = await resourcesRuntime((input) => transport(input))
  const hooks = {
    show: [] as (() => void)[],
    hide: [] as (() => void)[],
    unload: [] as (() => void)[],
  }
  const events = {
    onShow: (fn: () => void) => hooks.show.push(fn),
    onHide: (fn: () => void) => hooks.hide.push(fn),
    onUnload: (fn: () => void) => hooks.unload.push(fn),
    onLoad: (fn: (q: Record<string, string>) => void) => fn({ id: resourceId }),
  }
  const composable = await loadRuntime(
    readFileSync(new URL('../../src/composables/use-resource-page.ts', import.meta.url), 'utf8'),
    {
      ...events,
      config: { useMock: false },
      session,
      RequestError: api.RequestError,
      useUserStore: () => user,
      ...helpers,
    },
  )
  let clipboard = ''
  let rejectClipboard = false
  let clipboardCallback: (() => void) | undefined
  let delayClipboard = false
  const runtime = await loadRuntime(
    pageScript(new URL(`../../src/pages/resources/${name}.vue`, import.meta.url)) +
      '\nexport { page, load, ' +
      (name === 'index'
        ? 'items, categories, category, keyword, cursor, search, changeCategory, contribution, openContribution'
        : 'detail, choice, pending, writing, copy, select, submit') +
      ' }',
    {
      ...events,
      ...api,
      ...composable,
      ...helpers,
      ...schema,
      beijingTime,
      uni: {
        setClipboardData(options: { data: string; success: () => void; fail: () => void }) {
          clipboard = options.data
          clipboardCallback = rejectClipboard ? options.fail : options.success
          if (!delayClipboard) clipboardCallback()
        },
      },
    },
  )
  async function show() {
    hooks.show.forEach((fn) => fn())
    await settle()
  }
  function hide() {
    hooks.hide.forEach((fn) => fn())
  }
  await show()
  return {
    runtime,
    user,
    api,
    show,
    hide,
    detail: () => detail,
    setDetail: (v: unknown) => {
      detail = v
    },
    transport: (fn: typeof transport) => {
      transport = fn
    },
    clipboard: () => clipboard,
    failClipboard: () => {
      rejectClipboard = true
    },
    delayClipboard: () => {
      delayClipboard = true
    },
    finishClipboard: () => clipboardCallback?.(),
  }
}
