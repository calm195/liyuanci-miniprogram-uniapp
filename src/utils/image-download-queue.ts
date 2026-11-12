export interface ImageDownload {
  promise: Promise<string>
  cancel: () => void
}

type Start = () => ImageDownload
interface Subscriber {
  resolve: (path: string) => void
  reject: (error: Error) => void
}
interface Job {
  key: string
  start: Start
  subscribers: Set<Subscriber>
  running?: ImageDownload
}

// 只合并在途请求，不复用已完成的私有图片，避免绕过下一次读取时的权限检查。
export function createImageDownloadQueue(limit = 4) {
  const jobs = new Map<string, Job>()
  const pending: Job[] = []
  let active = 0

  function pump() {
    while (active < limit && pending.length) {
      const job = pending.shift()!
      if (!job.subscribers.size) continue
      active++
      Promise.resolve()
        .then(() => {
          if (!job.subscribers.size) throw new Error('图片下载已取消')
          job.running = job.start()
          return job.running.promise
        })
        .then(
          (path) => {
            if (jobs.get(job.key) === job) jobs.delete(job.key)
            for (const subscriber of job.subscribers) subscriber.resolve(path)
          },
          () => {
            if (jobs.get(job.key) === job) jobs.delete(job.key)
            for (const subscriber of job.subscribers) subscriber.reject(new Error('图片暂不可查看'))
          },
        )
        .finally(() => {
          if (jobs.get(job.key) === job) jobs.delete(job.key)
          job.subscribers.clear()
          active--
          pump()
        })
    }
  }

  return {
    request(key: string, start: Start): ImageDownload {
      let job = jobs.get(key)
      if (!job) {
        job = { key, start, subscribers: new Set() }
        jobs.set(key, job)
        pending.push(job)
      }
      const current = job
      let subscriber: Subscriber
      const promise = new Promise<string>((resolve, reject) => {
        subscriber = { resolve, reject }
        current.subscribers.add(subscriber)
      })
      pump()
      return {
        promise,
        cancel() {
          if (!current.subscribers.delete(subscriber)) return
          subscriber.reject(new Error('图片下载已取消'))
          if (!current.subscribers.size) {
            if (jobs.get(key) === current) jobs.delete(key)
            const index = pending.indexOf(current)
            if (index >= 0) pending.splice(index, 1)
            current.running?.cancel()
          }
        },
      }
    },
  }
}
