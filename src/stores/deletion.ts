import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from '@/stores/user'
import { config } from '@/config'
import { session } from '@/utils/session'
import { RequestError } from '@/utils/request'
import { requestDeletion, getDeletionStatus } from '@/api/deletion'
import {
  canDeleteAccount,
  validDeletionReceipt,
  deletionAccepted,
  deletionStatus,
} from '@/utils/deletion'
import type { DeletionInput, DeletionStatus } from '@/types/deletion'

// 回执与未确认请求只驻内存，离页不丢在途受理结果，不写本地持久化或路由。
export const useDeletionStore = defineStore('deletion', () => {
  const user = useUserStore()
  const receipt = ref('')
  const status = ref<DeletionStatus | null>(null)
  const submitting = ref(false)
  const reading = ref(false)
  const uncertain = ref(false)
  const error = ref('')
  let generation = 0
  let readGeneration = 0
  let clearing = false
  let pending: { owner: string; epoch: number; key: string; input: DeletionInput } | null = null
  function reset() {
    generation++
    readGeneration++
    pending = null
    receipt.value = ''
    status.value = null
    submitting.value = false
    reading.value = false
    uncertain.value = false
    error.value = ''
  }
  watch(
    () => user.user?.id,
    (id) => {
      // 401清理会话时保留结果不明提示；新账号不能继承旧账号请求或回执。
      if (!clearing && !((submitting.value || uncertain.value) && !id)) reset()
    },
    { flush: 'sync' },
  )
  async function submit(owner: string, epoch: number, version: number, retry = false) {
    if (submitting.value || reading.value || receipt.value || config.useMock) return
    if (retry) {
      if (
        !uncertain.value ||
        !pending ||
        pending.owner !== user.user?.id ||
        pending.epoch !== session.getEpoch() ||
        !session.getToken()
      )
        return
    } else {
      if (
        uncertain.value ||
        !canDeleteAccount(user.user, user.validated) ||
        user.user?.id !== owner ||
        session.getEpoch() !== epoch ||
        user.user.version !== version ||
        !session.getToken()
      )
        return
      pending = {
        owner,
        epoch,
        key: `deletion-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        input: { confirmation: 'delete_account', expected_version: version },
      }
    }
    const request = pending!
    const current = ++generation
    submitting.value = true
    error.value = ''
    try {
      const result = await requestDeletion(request.input, request.key)
      if (current !== generation) return
      const handle = deletionAccepted(result)
      if (user.user?.id !== request.owner || session.getEpoch() !== request.epoch) {
        uncertain.value = true
        error.value = '会话已变化，无法确认本次注销结果。请勿重复发起注销。'
        return
      }
      // 受理已撤销服务端会话，仅清本地，不再用旧令牌调用退出接口。
      clearing = true
      try {
        user.clearSession()
      } finally {
        clearing = false
      }
      pending = null
      uncertain.value = false
      receipt.value = handle
      status.value = { status: 'processing' }
    } catch (failure) {
      if (current !== generation) return
      if (
        failure instanceof RequestError &&
        [400, 403, 404, 409, 429].includes(failure.statusCode)
      ) {
        pending = null
        uncertain.value = false
        user.validated = false
        error.value = '本次未获受理，请重新读取账号资格并核对后再操作。'
      } else {
        uncertain.value = true
        if (user.user?.id === request.owner) user.validated = false
        error.value =
          '注销结果尚未确认。若会话仍有效，可手动重试原请求；不要重新发起。若会话已失效且未取得回执，当前协议无法补取回执。'
      }
    } finally {
      if (current === generation) submitting.value = false
    }
  }
  async function read(handle = receipt.value) {
    if (config.useMock || submitting.value || reading.value || !validDeletionReceipt(handle)) return
    const current = ++readGeneration
    const epoch = session.getEpoch()
    reading.value = true
    status.value = null
    error.value = ''
    try {
      const result = await getDeletionStatus(handle)
      if (current !== readGeneration || epoch !== session.getEpoch()) return
      status.value = deletionStatus(result)
      receipt.value = handle
    } catch {
      if (current === readGeneration && epoch === session.getEpoch())
        error.value = '回执暂不可查询，可能无效、已过期或服务暂不可用；不能据此判断清理已完成。'
    } finally {
      if (current === readGeneration) reading.value = false
    }
  }
  return { receipt, status, submitting, reading, uncertain, error, submit, read, reset }
})
