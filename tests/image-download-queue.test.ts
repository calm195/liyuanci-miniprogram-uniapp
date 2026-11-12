import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createImageDownloadQueue } from '../src/utils/image-download-queue.ts'
import { settle } from './support/page-runtime.ts'

test('图片队列限制并发、合并在途同源请求、完成后重新鉴权下载', async () => {
  const queue = createImageDownloadQueue(2)
  const finishes: ((path: string) => void)[] = []
  let started = 0
  const start = () => {
    started++
    return { promise: new Promise<string>((resolve) => finishes.push(resolve)), cancel: () => {} }
  }
  const first = queue.request('same', start)
  const duplicate = queue.request('same', start)
  const second = queue.request('second', start)
  const third = queue.request('third', start)
  await settle()
  assert.equal(started, 2)
  finishes[0]!('first-path')
  assert.equal(await first.promise, 'first-path')
  assert.equal(await duplicate.promise, 'first-path')
  // 在完成回调中立即再次请求，也不能挂到已完成的在途任务上。
  const again = queue.request('same', start)
  await settle()
  assert.equal(started, 3)
  finishes[1]!('second-path')
  await settle()
  assert.equal(started, 4)
  finishes[2]!('third-path')
  finishes[3]!('new-path')
  assert.deepEqual(await Promise.all([second.promise, third.promise, again.promise]), [
    'second-path',
    'third-path',
    'new-path',
  ])
})

test('取消一个使用者不取消共享下载，取消最后使用者终止下载，排队取消不发请求', async () => {
  const queue = createImageDownloadQueue(1)
  let aborts = 0
  let starts = 0
  const start = () => {
    starts++
    let reject!: (error: Error) => void
    return {
      promise: new Promise<string>((_resolve, failure) => {
        reject = failure
      }),
      cancel: () => {
        aborts++
        reject(new Error('abort'))
      },
    }
  }
  const first = queue.request('same', start)
  const shared = queue.request('same', start)
  const waiting = queue.request('waiting', start)
  const failures = [first, shared, waiting].map((task) => assert.rejects(task.promise))
  await settle()
  first.cancel()
  assert.equal(aborts, 0)
  waiting.cancel()
  shared.cancel()
  await Promise.all(failures)
  await settle()
  assert.equal(aborts, 1)
  assert.equal(starts, 1)
})
