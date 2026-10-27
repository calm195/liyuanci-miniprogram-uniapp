import { ref, watch } from 'vue'
import { callWhisper } from '../api/whispers.ts'
import { RequestError } from './request'
import { session } from './session'
import { whisperSchemas, whisperWrites, whisperOperations } from './whispers-contract.ts'
import { matchesSchema } from './whispers-schema.ts'
import type { WhisperInputs, WhisperOperation, WhisperOutputs } from '../types/whispers.ts'

// 仅用于幂等去重，不作为认证凭据；令牌仍由统一会话管理。
export function whisperKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 3) | 8).toString(16)
  })
}
export function canWhisperAction(projection: string, value: unknown, action: string): boolean {
  const schema = whisperSchemas[projection]
  if (!schema || !matchesSchema(schema, value, whisperSchemas)) return false
  const write = whisperWrites.find((item) => item.operation_id === action)
  const projections = write?.projection.replace('.allowed_actions', '').split('/') ?? []
  if (!projections.includes(projection)) return false
  const actions = (value as { allowed_actions?: string[] }).allowed_actions
  return !!actions?.includes(action)
}

// 版本分别来自当前资源与父帖上下文，不允许用账号版本或计数代替。
export function whisperVersionFields(
  projection: string,
  resource: unknown,
  action: string,
  parent?: unknown,
): Record<string, number> {
  if (!canWhisperAction(projection, resource, action)) throw new Error('当前资源不允许此操作')
  const value = resource as Record<string, unknown>
  if (action === 'whisperCommentCreate')
    return {
      expected_post_version: value.version as number,
      expected_comments_epoch: value.comments_epoch as number,
    }
  if (action === 'whisperCommentUpdate') {
    if (!canWhisperAction('PublicPost', parent, 'whisperCommentCreate'))
      throw new Error('请重新读取可评论的父帖')
    const post = parent as { id: string; version: number; comments_epoch: number }
    if (value.post_id !== post.id) throw new Error('评论与父帖上下文不匹配')
    return {
      expected_version: value.version as number,
      expected_post_version: post.version,
      expected_comments_epoch: post.comments_epoch,
    }
  }
  if (action === 'whisperHugSet') {
    const hug = value.my_hug as { version: number } | null
    if (!hug) throw new Error('请登录后重新读取抱抱状态')
    return { expected_post_version: value.version as number, expected_hug_version: hug.version }
  }
  return typeof value.version === 'number' &&
    !['interactionBlockCreate', 'whisperReportCreate'].includes(action)
    ? { expected_version: value.version }
    : {}
}

// 每个可编辑页面独享内存作用域；离页必须 close，同账号换会话也立即销毁。
export function createWhisperScope() {
  const epoch = session.getEpoch()
  const draft = ref('')
  const pending = ref<{
    operation: WhisperOperation
    input: WhisperInputs[WhisperOperation]
  } | null>(null)
  const busy = ref(false)
  let active = true
  function clear() {
    draft.value = ''
    pending.value = null
  }
  function close() {
    active = false
    clear()
    stop()
  }
  const stop = watch(() => session.getEpoch(), close, { flush: 'sync' })
  async function send<K extends WhisperOperation>(
    operation: K,
    input: WhisperInputs[K],
  ): Promise<WhisperOutputs[K]> {
    if (!active || epoch !== session.getEpoch()) throw new Error('页面或会话已失效')
    if (busy.value || pending.value) throw new Error('请先确认上一操作结果')
    const spec = whisperOperations[operation]
    if (!spec || !matchesSchema(spec.input, input, whisperSchemas))
      throw new RequestError('请求参数不符合接口约定', -2)
    const snapshot = JSON.parse(JSON.stringify(input)) as WhisperInputs[K]
    busy.value = true
    try {
      const result = await callWhisper(operation, snapshot)
      if (!active || epoch !== session.getEpoch()) throw new Error('页面或会话已失效')
      clear()
      return result
    } catch (failure) {
      // 超时与服务内部失败无法确认事务结果，只允许原键原体重试。
      if (
        active &&
        epoch === session.getEpoch() &&
        'key' in snapshot &&
        failure instanceof RequestError &&
        (failure.code === -1 || failure.code === -3 || failure.statusCode >= 500)
      )
        pending.value = { operation, input: snapshot }
      throw failure
    } finally {
      busy.value = false
    }
  }
  async function retry() {
    const previous = pending.value
    if (busy.value || !previous) throw new Error('没有可重试的待确认操作')
    pending.value = null
    return send(previous.operation, previous.input)
  }
  return { draft, pending, busy, send, retry, close }
}
