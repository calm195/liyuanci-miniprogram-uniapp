import { computed, ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useMatchmakingStore } from '@/stores/matchmaking'
import { session } from '@/utils/session'
import { config } from '@/config'
import { RequestError } from '@/utils/request'
import { writeMatchmaking } from '@/api/matchmaking'
import type { MatchmakingCommand } from '@/types/matchmaking'

export function matchmakingFailure(failure: unknown): string {
  if (!(failure instanceof RequestError))
    return failure instanceof Error ? failure.message : '操作未完成，请重试。'
  if (failure.statusCode === 401) return '请重新登录后查看包分配活动。'
  if (failure.error_code === 'VERIFICATION_REQUIRED') return '请先完成学生认证再报名。'
  if (failure.error_code === 'REVIEW_PENDING') return '资料暂未通过内容检查，请调整内容后提交。'
  if (failure.statusCode === 403)
    return '当前资格不允许此操作，可查看警告与申诉；已报名用户仍可退出。'
  if (failure.statusCode === 404) return '活动或当前关系已不可访问，请返回列表刷新。'
  if (failure.statusCode === 409) return '活动、报名或配对状态已变化，请刷新后核对再操作。'
  if (failure.statusCode === 400) return '资料或操作不符合活动规则，请核对填写内容和活动时间。'
  if (failure.statusCode === 429) return '操作较频繁，请稍后再试。'
  return '尚未确认操作结果，请检查网络后原样重试。'
}

// 将敏感页面绑定到账号与可见代次；隐藏时清理展示，待确认命令跨页面保留在账号内存仓。
export function useMatchmakingPage(clear: () => void, activityId: () => string = () => '') {
  const user = useUserStore()
  const commands = useMatchmakingStore()
  const busy = ref(false)
  const writing = ref(false)
  const error = ref('')
  const notice = ref('')
  const gate = ref('')
  const pending = computed(() => commands.get(activityId()))
  let visible = false
  let generation = 0
  let viewGeneration = 0
  function reset() {
    generation++
    viewGeneration++
    busy.value = false
    writing.value = false
    error.value = ''
    notice.value = ''
    gate.value = session.getToken() ? '' : '登录后查看活动和本人的报名记录。'
    clear()
  }
  function ticket() {
    const current = generation,
      epoch = session.getEpoch(),
      owner = user.user?.id
    return () =>
      visible && current === generation && epoch === session.getEpoch() && owner === user.user?.id
  }
  // 确认弹窗与写入后的交互可跨本次刷新，但不能跨隐藏、换号或资格失效。
  function actionTicket() {
    const current = viewGeneration,
      epoch = session.getEpoch(),
      owner = user.user?.id
    return () =>
      visible &&
      current === viewGeneration &&
      epoch === session.getEpoch() &&
      owner === user.user?.id
  }
  async function read(load: (active: () => boolean) => Promise<void>) {
    if (!visible || busy.value || writing.value) return
    const current = ++generation,
      epoch = session.getEpoch()
    const active = () => visible && current === generation && epoch === session.getEpoch()
    busy.value = true
    error.value = ''
    gate.value = ''
    try {
      if (!session.getToken() || config.useMock) {
        gate.value = config.useMock
          ? '包分配活动需连接真实服务。'
          : '登录后查看活动和本人的报名记录。'
        clear()
        return
      }
      await user.refresh(false, true)
      if (!active()) return
      if (!user.validated || !user.user) throw new Error('当前登录资格未能确认，请重试。')
      await load(ticket())
    } catch (failure) {
      if (active()) {
        clear()
        error.value = matchmakingFailure(failure)
      }
    } finally {
      if (active()) busy.value = false
    }
  }
  async function retry(refresh: () => Promise<void>) {
    const command = pending.value
    if (!command || busy.value || writing.value || !visible) return
    const active = ticket()
    writing.value = true
    error.value = ''
    notice.value = ''
    let succeeded = false
    try {
      await writeMatchmaking(command)
      if (!active()) return
      commands.remove(command.activityId)
      succeeded = true
      notice.value =
        command.kind === 'profile'
          ? '个人资料已保存。'
          : command.kind === 'enroll'
            ? '报名资料已提交，请等待审核。'
            : command.kind === 'withdraw'
              ? '已退出本次活动。'
              : '已记录本人查看。'
    } catch (failure) {
      if (!active()) return
      // 确定的业务拒绝允许用户修改请求；网络、超时和损坏回执保留原始命令。
      if (
        failure instanceof RequestError &&
        failure.statusCode >= 400 &&
        failure.statusCode < 500 &&
        ![408, 429].includes(failure.statusCode)
      )
        commands.remove(command.activityId)
      const message = matchmakingFailure(failure)
      // 已获明确的访问拒绝时立即撤下旧资料，不能等用户手动刷新才停止展示。
      if (failure instanceof RequestError && [401, 403, 404].includes(failure.statusCode)) reset()
      error.value = message
    } finally {
      if (active()) writing.value = false
    }
    if (succeeded && active()) await refresh()
  }
  async function write(command: MatchmakingCommand, refresh: () => Promise<void>) {
    if (pending.value || busy.value || writing.value || !visible) return
    commands.save(command)
    if (!pending.value) {
      error.value = '当前登录资格未能确认，请刷新后重试。'
      return
    }
    await retry(refresh)
  }
  onShow(() => {
    visible = true
    reset()
  })
  onHide(() => {
    visible = false
    reset()
  })
  onUnload(() => {
    visible = false
    reset()
  })
  watch(() => session.getEpoch(), reset, { flush: 'sync' })
  watch(
    () => user.user?.id,
    (next, previous) => {
      if (previous && next !== previous) reset()
    },
    { flush: 'sync' },
  )
  watch(
    () => [user.validated, user.user?.verification, user.user?.penalty_notice] as const,
    ([validated, verification, restriction], [wasValidated, oldVerification, oldRestriction]) => {
      if (
        (wasValidated && !validated) ||
        (oldVerification === 'verified' && verification !== 'verified') ||
        (restriction && restriction !== oldRestriction)
      ) {
        reset()
        if (visible && session.getToken() && user.user)
          error.value = '当前登录资格未能确认或参与资格已变化，请刷新后重新核对。'
      }
    },
    { flush: 'sync' },
  )
  return { user, busy, writing, error, notice, gate, pending, actionTicket, read, write, retry }
}
