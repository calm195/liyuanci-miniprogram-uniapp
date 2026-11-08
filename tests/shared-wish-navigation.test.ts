import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { mainNavigation } from '../src/utils/navigation.ts'
import { nativeShareQuery, sharePage } from '../src/utils/share.ts'
import { loadRuntime } from './support/page-runtime.ts'

test('分享详情以首页为上一页，认证后返回详情时保留已有页面栈', async () => {
  const id = '01234567-89ab-cdef-0123-456789abcdef'
  const calls: string[] = []
  const home = mainNavigation[0].url
  const detail = sharePage('wish')
  let pages = [{ route: detail.slice(1) }]
  let scene = 1007
  let category = ''
  let rejectHome = false
  let rejectDetail = false
  const notices: string[] = []
  const scheduled: (() => void)[] = []
  const runtime = await loadRuntime(
    readFileSync(new URL('../src/utils/shared-wish-navigation.ts', import.meta.url), 'utf8'),
    {
      mainNavigation,
      nativeShareQuery,
      sharePage,
      getCurrentPages: () => pages,
      wx: { getApiCategory: () => category },
      setTimeout: (fn: () => void) => scheduled.push(fn),
      uni: {
        getEnterOptionsSync: () => ({ scene }),
        reLaunch: (opts: UniNamespace.ReLaunchOptions) => {
          calls.push(String(opts.url))
          if (rejectHome) {
            opts.fail?.({})
          } else {
            pages = [{ route: home.slice(1) }]
            opts.success?.({})
          }
        },
        navigateTo: (opts: UniNamespace.NavigateToOptions) => {
          calls.push(String(opts.url))
          if (rejectDetail) opts.fail?.({ errMsg: '合成导航失败' })
          else pages.push({ route: detail.slice(1) })
          opts.complete?.({})
        },
        $emit: (_event: string, notice: { message: string }) => notices.push(notice.message),
      },
    },
  )

  assert.equal(await runtime.prepareSharedWishBackStack(undefined, id), true)
  scheduled.shift()?.()
  assert.equal(await runtime.prepareSharedWishBackStack(undefined, id), false)
  assert.deepEqual(calls, [home, `${detail}?${nativeShareQuery(id)}`])

  pages = [{ route: detail.slice(1) }]
  scene = 1154
  assert.equal(await runtime.prepareSharedWishBackStack(undefined, id), false)
  category = 'browseOnly'
  scene = 1155
  assert.equal(await runtime.prepareSharedWishBackStack(undefined, id), false)
  category = 'default'
  assert.equal(await runtime.prepareSharedWishBackStack(id, ''), true)
  scheduled.shift()?.()
  assert.deepEqual(calls.slice(2), [home, `${detail}?ref=${id}`])

  pages = [{ route: detail.slice(1) }]
  assert.equal(await runtime.prepareSharedWishBackStack('', ''), true)
  scheduled.shift()?.()
  assert.deepEqual(calls.slice(4), [home, `${detail}?ref=invalid`])

  pages = [{ route: detail.slice(1) }]
  rejectHome = true
  assert.equal(await runtime.prepareSharedWishBackStack(id, ''), false)
  assert.equal(scheduled.length, 0)
  assert.deepEqual(calls.slice(6), [home])

  rejectHome = false
  rejectDetail = true
  assert.equal(await runtime.prepareSharedWishBackStack(id, ''), true)
  scheduled.shift()?.()
  assert.deepEqual(notices, ['分享的心愿打开失败，请重试。'])
  pages = [{ route: detail.slice(1) }]
  assert.equal(await runtime.prepareSharedWishBackStack(id, ''), true)
})
