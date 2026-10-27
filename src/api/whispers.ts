import { request, RequestError } from '@/utils/request'
import { session } from '@/utils/session'
import { whisperOperations, whisperSchemas } from '@/utils/whispers-contract'
import { matchesSchema } from '@/utils/whispers-schema'
import type { WhisperInputs, WhisperOutputs, WhisperOperation } from '@/types/whispers'

// API 与类型共用固定目录，所有操作均走真实 request，不加载合成样例。
export async function callWhisper<K extends WhisperOperation>(
  operation: K,
  input: WhisperInputs[K],
): Promise<WhisperOutputs[K]> {
  const spec = whisperOperations[operation]
  if (!spec || !matchesSchema(spec.input, input, whisperSchemas))
    throw new RequestError('请求参数不符合接口约定', -2)
  if (spec.private && !session.getToken())
    throw new RequestError('请先登录', 401, 'UNAUTHENTICATED', '', 401)
  const epoch = session.getEpoch()
  // 在发送前复制，确保等待期间的表单修改不会改变同次请求。
  const snapshot = JSON.parse(JSON.stringify(input)) as {
    path?: Record<string, string>
    query?: Record<string, string | number>
    data?: Record<string, unknown>
    key?: string
  }
  let url = spec.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
    encodeURIComponent(snapshot.path![key]!),
  )
  const query = Object.entries(snapshot.query ?? {})
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  if (query) url += '?' + query
  const result = await request<unknown>({
    url,
    method: spec.method,
    data: snapshot.data,
    header: snapshot.key ? { 'Idempotency-Key': snapshot.key } : undefined,
    silent: true,
  })
  if (epoch !== session.getEpoch()) throw new RequestError('会话已变化，请重新操作', -1)
  if (spec.output ? !matchesSchema(spec.output, result, whisperSchemas) : result !== undefined)
    throw new RequestError('接口返回格式不符合约定，请刷新后重试', -3)
  return result as WhisperOutputs[K]
}
