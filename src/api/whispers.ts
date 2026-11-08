import { request, RequestError } from '@/utils/request'
import { session } from '@/utils/session'
import { whisperOperations, whisperSchemas } from '@/utils/whispers-contract'
import { matchesSchema } from '@/utils/whispers-schema'
import { contentSearchParams } from '@/utils/content-search'
import type { ContentSearch } from '@/types/content'
import type { WhisperInputs, WhisperOutputs, WhisperOperation } from '@/types/whispers'

function normalizeCapsuleDetail(result: unknown): unknown {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return result
  const { preview, ...detail } = result as Record<string, unknown>
  // 已部署接口复用列表投影，详情中的摘要为空或等于已解锁正文的前三个码点。
  if (
    preview === null ||
    (detail.status === 'unlocked' &&
      typeof detail.body === 'string' &&
      preview === Array.from(detail.body).slice(0, 3).join(''))
  ) {
    return detail
  }
  return result
}

// API 与类型共用固定目录，所有操作均走真实 request，不加载合成样例。
export function listWhisperPosts(
  query: WhisperInputs['whisperPostsList']['query'],
  search: ContentSearch,
) {
  return requestWhisper('whisperPostsList', { query }, contentSearchParams(search))
}

export function callWhisper<K extends WhisperOperation>(
  operation: K,
  input: WhisperInputs[K],
): Promise<WhisperOutputs[K]> {
  return requestWhisper(operation, input)
}

async function requestWhisper<K extends WhisperOperation>(
  operation: K,
  input: WhisperInputs[K],
  searchParams = '',
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
  const params = [query, searchParams].filter(Boolean).join('&')
  if (params) url += '?' + params
  const response = await request<unknown>({
    url,
    method: spec.method,
    data: snapshot.data,
    header: snapshot.key ? { 'Idempotency-Key': snapshot.key } : undefined,
    silent: true,
  })
  if (epoch !== session.getEpoch()) throw new RequestError('会话已变化，请重新操作', -1)
  const result = operation === 'whisperCapsuleGet' ? normalizeCapsuleDetail(response) : response
  if (spec.output ? !matchesSchema(spec.output, result, whisperSchemas) : result !== undefined)
    throw new RequestError('接口返回格式不符合约定，请刷新后重试', -3)
  return result as WhisperOutputs[K]
}
