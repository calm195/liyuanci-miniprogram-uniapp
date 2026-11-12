import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive, ref } from 'vue'
import { loadRuntime, pageScript, settle } from './support/page-runtime.ts'

test('屏外图片不下载，进入可视区逐张显示，预览才取原图，撤权和离页清空', async () => {
  const props = reactive({ images: [{ id: 'a' }, { id: 'b' }], wishId: 'wish', compact: false })
  const epoch = ref(1)
  const requests: {
    id: string
    variant?: string
    resolve: (path: string) => void
    reject: () => void
    cancelled: boolean
  }[] = []
  let mounted = () => {}
  let hide = () => {}
  let show = () => {}
  let dispose = () => {}
  let intersect: (value: { intersectionRatio: number }) => void = () => {}
  const previews: unknown[] = []
  Object.assign(globalThis, {
    uni: {
      createIntersectionObserver: () => ({
        relativeToViewport() {
          return this
        },
        observe(_selector: string, callback: typeof intersect) {
          intersect = callback
        },
        disconnect() {},
      }),
      previewImage: (value: unknown) => previews.push(value),
      $emit() {},
    },
  })
  const runtime = await loadRuntime(
    pageScript(new URL('../src/components/WishImages.vue', import.meta.url)) +
      '\nexport { paths, failed, preview }',
    {
      defineProps: () => props,
      getCurrentInstance: () => ({ proxy: {} }),
      onMounted: (fn: () => void) => {
        mounted = fn
      },
      onUnmounted: (fn: () => void) => {
        dispose = fn
      },
      onHide: (fn: () => void) => {
        hide = fn
      },
      onShow: (fn: () => void) => {
        show = fn
      },
      session: { getEpoch: () => epoch.value },
      requestWishImage: (id: string, _wish: string, variant?: string) => {
        let resolve!: (path: string) => void
        let reject!: () => void
        const promise = new Promise<string>((success, failure) => {
          resolve = success
          reject = () => failure(new Error('denied'))
        })
        const request = { id, variant, resolve, reject, cancelled: false }
        requests.push(request)
        return {
          promise,
          cancel: () => {
            request.cancelled = true
            reject()
          },
        }
      },
    },
  )
  mounted()
  intersect({ intersectionRatio: 0 })
  assert.equal(requests.length, 0)
  intersect({ intersectionRatio: 1 })
  assert.deepEqual(
    requests.map((item) => item.variant),
    ['thumbnail', 'thumbnail'],
  )
  requests[1]!.resolve('thumb-b')
  await settle()
  assert.deepEqual(
    runtime.paths.value.map((item: { path: string }) => item.path),
    ['', 'thumb-b'],
  )
  requests[0]!.resolve('thumb-a')
  await settle()
  const preview = runtime.preview('a')
  assert.equal(requests[2]!.variant, undefined)
  requests[2]!.resolve('original-a')
  requests[3]!.resolve('original-b')
  await preview
  assert.deepEqual(previews, [{ current: 'original-a', urls: ['original-a', 'original-b'] }])
  epoch.value++
  assert.equal(
    runtime.paths.value.every((item: { path: string }) => !item.path),
    true,
  )
  requests[4]!.resolve('fresh-a')
  await settle()
  requests[5]!.reject()
  await settle()
  assert.equal(runtime.paths.value.length, 0)
  assert.equal(runtime.failed.value, true)
  const oldIntersect = intersect
  hide()
  show()
  const before = requests.length
  oldIntersect({ intersectionRatio: 1 })
  assert.equal(requests.length, before, '离页前的观察回调不能启动新下载')
  intersect({ intersectionRatio: 1 })
  hide()
  assert.equal(requests.at(-1)!.cancelled, true)
  requests.at(-1)!.resolve('late')
  await settle()
  assert.equal(runtime.paths.value.length, 0)
  dispose()
})
