import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { reactive } from 'vue'
import {
  brandFriendShare,
  brandTimelineShare,
  nativeShareQuery,
  shareCover,
  sharePage,
  sharePath,
  shareReference,
  shareTitle,
} from '../src/utils/share.ts'
import { isPublicContent, shareCard } from '../src/utils/story.ts'
import { loadRuntime, pageScript } from './support/page-runtime.ts'

const ref = '01234567-89ab-cdef-0123-456789abcdef'

test('小程序码 scene 限制为 32 位十六进制，分享路由只接受对应业务页', () => {
  assert.equal(shareReference({ scene: ref.replace(/-/g, '') }), ref)
  assert.equal(shareReference({ ref }), ref)
  assert.equal(shareReference({ scene: 'bad', ref }), '')
  assert.equal(shareReference({ id: ref }), undefined)
  const path = `/pages/stories/index?ref=${ref}`
  assert.equal(sharePath('story', { ref, miniapp_route: path }), path)
  assert.throws(() => sharePath('wish', { ref, miniapp_route: path }))
  assert.throws(() => sharePath('story', { ref, miniapp_route: path + '&body=extra' }))
})

test('好友和朋友圈分享只使用当前公开投影，失去公开内容或账号资格时立即回退品牌卡片', async () => {
  const account = reactive({ validated: true, user: { verification: 'verified' } })
  const config = reactive({ useMock: false })
  const state = reactive({ target: { id: ref, title: '公开标题' } as object | null })
  const runtime = await loadRuntime(
    readFileSync(new URL('../src/composables/use-content-share.ts', import.meta.url), 'utf8'),
    {
      useUserStore: () => account,
      config,
      brandFriendShare,
      brandTimelineShare,
      nativeShareQuery,
      shareCover,
      sharePage,
      shareTitle,
    },
  )
  const share = runtime.useContentShare('wish', () => state.target)
  const imageUrl = '/static/share-cover.png'
  assert.deepEqual(share.friendShare(), {
    title: '公开标题',
    imageUrl,
    path: `/pages/wish-detail/index?id=${ref}&shared=1`,
  })
  assert.deepEqual(share.timelineShare(), {
    title: '公开标题',
    imageUrl,
    query: `id=${ref}&shared=1`,
  })
  const brandTitle = '鲤愿池 · 心愿与还愿故事'
  function expectBrandCard() {
    assert.equal(share.target.value, null)
    assert.deepEqual(share.friendShare(), {
      title: brandTitle,
      imageUrl,
      path: '/pages/index/index?fromShare=1',
    })
    assert.deepEqual(share.timelineShare(), { title: brandTitle, imageUrl, query: 'brandShare=1' })
  }
  state.target = null
  expectBrandCard()
  state.target = { id: ref, title: '刚刚失去资格的标题' }
  account.validated = false
  expectBrandCard()
  account.validated = true
  account.user.verification = 'pending'
  expectBrandCard()
  account.user.verification = 'verified'
  config.useMock = true
  expectBrandCard()
})

test('带码卡片使用当前公开投影绘制并打开原生图片菜单，重复操作复用引用', async () => {
  const calls: string[] = []
  const path = `/pages/stories/index?ref=${ref}`
  const content = {
    id: ref,
    title: '公开标题',
    body: '公开正文',
    content_version: 2,
    school_related: false,
  }
  const canvas = {
    setFillStyle: () => {},
    fillRect: () => {},
    setFontSize: () => {},
    fillText: (text: string) => calls.push(text),
    measureText: (text: string) => ({ width: text.length * 20 }),
    drawImage: (file: string) => assert.match(file, /share-poster-1-\d+\.png$/),
    draw: (_reserve: boolean, callback: () => void) => callback(),
  }
  const page = await loadRuntime(
    pageScript(new URL('../src/components/ShareActions.vue', import.meta.url)) +
      '\nexport { sharePoster, notice, error };',
    {
      defineProps: () => ({ kind: 'story', content }),
      getCurrentInstance: () => ({
        uid: 1,
        proxy: { isPageVisible: true, pageActionGeneration: 1 },
      }),
      useUserStore: () => ({ validated: true, user: { verification: 'verified' } }),
      session: { getEpoch: () => 1 },
      createShare: async () => {
        calls.push('create')
        return { ref, miniapp_route: path }
      },
      resolveShare: async () => ({ target_kind: 'story', target: content }),
      getShareCode: async (reference: string, version: string) => {
        assert.equal(reference, ref)
        assert.equal(version, 'trial')
        return { image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }
      },
      sharePath,
      shareTitle,
      shareCard,
      isPublicContent,
      RequestError: class extends Error {},
      wx: {
        env: { USER_DATA_PATH: '/tmp' },
        getAccountInfoSync: () => ({ miniProgram: { envVersion: 'trial' } }),
        showShareImageMenu(options: { path: string; entrancePath: string; success: () => void }) {
          assert.equal(options.path, '/tmp/poster.png')
          assert.equal(options.entrancePath, path)
          calls.push('open')
          options.success()
        },
      },
      uni: {
        getFileSystemManager: () => ({
          writeFile: (options: { success: () => void }) => options.success(),
          unlink: () => calls.push('unlink'),
        }),
        createCanvasContext: () => canvas,
        canvasToTempFilePath: (options: { success: (result: { tempFilePath: string }) => void }) =>
          options.success({ tempFilePath: '/tmp/poster.png' }),
      },
    },
  )
  await page.sharePoster()
  await page.sharePoster()
  assert.equal(page.error.value, '')
  assert.match(page.notice.value, /已生成/)
  assert.equal(calls.filter((value) => value === 'create').length, 1)
  assert.equal(calls.filter((value) => value === '公开标题').length, 2)
  assert.equal(calls.filter((value) => value === 'open').length, 2)
  assert.equal(calls.filter((value) => value === 'unlink').length, 2)
})
