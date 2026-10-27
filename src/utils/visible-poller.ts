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
  let active = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  function stop() {
    active = false
    generation++
    if (timer !== undefined) scheduler.clear(timer)
    timer = undefined
  }
  async function tick(current: number) {
    if (!active || current !== generation || running) return
    running = true
    timer = undefined
    try {
      await task()
    } catch {
      // 页面负责展示错误；单次失败不产生重叠轮询或自动重放写入。
    } finally {
      running = false
      if (active) {
        // 快速离开后返回时等待旧请求结束，再开始当前代次，避免重叠请求。
        if (current !== generation) void tick(generation)
        else
          timer = scheduler.set(() => {
            void tick(current)
          }, 3000)
      }
    }
  }
  function start() {
    stop()
    active = true
    void tick(generation)
  }
  return { start, stop }
}
