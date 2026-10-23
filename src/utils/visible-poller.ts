type Scheduler = {
  set: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clear: (timer: ReturnType<typeof setTimeout>) => void
}
export function createVisiblePoller(
  task: () => Promise<void>,
  scheduler: Scheduler = {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: (timer) => clearTimeout(timer),
  },
) {
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  function stop() {
    generation++
    if (timer !== undefined) scheduler.clear(timer)
    timer = undefined
  }
  async function tick(current: number) {
    try {
      await task()
    } catch {
      // 页面负责展示错误；单次失败不产生重叠轮询或自动重放写入。
    } finally {
      if (current === generation)
        timer = scheduler.set(() => {
          void tick(current)
        }, 3000)
    }
  }
  function start() {
    stop()
    void tick(generation)
  }
  return { start, stop }
}
