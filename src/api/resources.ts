import { request, RequestError } from '@/utils/request'
import type { RequestResponse } from '@/utils/request'
import { session } from '@/utils/session'
import { resourceOperations, resourceSchemas } from '@/utils/resource-contract'
import {
  matchesResourceSchema,
  normalizeResourceText,
  resourceId,
  utf8Length,
} from '@/utils/resource-schema'
import type {
  ResourceCategory,
  ResourceDetail,
  ResourceDownload,
  ResourceFeedback,
  ResourceFeedbackInput,
  ResourcePage,
  ResourceQuery,
  ResourceSummary,
} from '@/types/resource'

type Operation = keyof typeof resourceOperations
const valid = (name: string, data: unknown) =>
  !!resourceSchemas[name] && matchesResourceSchema(resourceSchemas[name]!, data, resourceSchemas)
function invalid(): never {
  throw new RequestError('资料接口参数或返回数据不符合约定', -3)
}
function idPath(id: string) {
  if (!resourceId(id)) invalid()
  return encodeURIComponent(id.toLowerCase())
}
function queryString(query: Record<string, string | number | undefined>) {
  const entries = Object.entries(query).filter(([, value]) => value !== undefined)
  if (
    entries.reduce((size, [key, value]) => size + utf8Length(key) + utf8Length(String(value)), 0) >
    8192
  )
    invalid()
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')
}
function pageQuery(query: { cursor?: string; limit?: number }, maximum: number) {
  if (
    query.cursor !== undefined &&
    (typeof query.cursor !== 'string' || !query.cursor || Array.from(query.cursor).length > 2048)
  )
    invalid()
  if (
    query.limit !== undefined &&
    (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > maximum)
  )
    invalid()
}
export function validResourceResponse(operation: Operation, response: RequestResponse): boolean {
  const spec = resourceOperations[operation]
  const cache = Object.entries(response.header ?? {}).find(
    ([k]) => k.toLowerCase() === 'cache-control',
  )?.[1]
  if (typeof cache !== 'string' || cache.toLowerCase().trim() !== 'no-store') return false
  if (response.statusCode === 200) return valid(spec.output, response.data)
  const body = response.data
  const errors: Readonly<Record<string, readonly string[]>> = spec.errors
  return (
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    valid(`Error${response.statusCode}`, body) &&
    !!errors[response.statusCode]?.includes(String((body as Record<string, unknown>).error_code))
  )
}
async function call<T>(
  operation: Operation,
  url: string,
  data?: ResourceFeedbackInput,
  key?: string,
): Promise<T> {
  if (!session.getToken()) throw new RequestError('请先登录', 401, 'UNAUTHENTICATED', '', 401)
  const epoch = session.getEpoch()
  const result = await request<unknown>({
    url,
    method: resourceOperations[operation].method,
    data,
    header: key ? { 'Idempotency-Key': key } : undefined,
    silent: true,
    validateResponse: (response) => validResourceResponse(operation, response),
  })
  if (epoch !== session.getEpoch()) throw new RequestError('会话已变化，请重新操作', -1)
  const schema = resourceSchemas[resourceOperations[operation].output]?.properties?.data
  if (!schema || !matchesResourceSchema(schema, result, resourceSchemas)) invalid()
  return result as T
}
export function listResourceCategories(
  query: { cursor?: string; limit?: number } = {},
): Promise<ResourcePage<ResourceCategory>> {
  if (Object.keys(query).some((k) => !['cursor', 'limit'].includes(k))) invalid()
  pageQuery(query, 100)
  const qs = queryString(query)
  return call('resourceCategoriesList', '/resource-categories' + (qs ? '?' + qs : ''))
}
export function listResources(query: ResourceQuery = {}): Promise<ResourcePage<ResourceSummary>> {
  if (Object.keys(query).some((k) => !['cursor', 'limit', 'category_id', 'q'].includes(k)))
    invalid()
  pageQuery(query, 50)
  if (query.category_id !== undefined && !resourceId(query.category_id)) invalid()
  const q = query.q === undefined ? undefined : normalizeResourceText('q', query.q) || undefined
  const qs = queryString({ ...query, category_id: query.category_id?.toLowerCase(), q })
  return call('resourcesList', '/resources' + (qs ? '?' + qs : ''))
}
export async function getResource(id: string): Promise<ResourceDetail> {
  const value = await call<ResourceDetail>('resourceDetail', `/resources/${idPath(id)}`)
  if (value.id !== id.toLowerCase()) invalid()
  return value
}
export async function getResourceDownload(id: string, version: number): Promise<ResourceDownload> {
  if (!Number.isSafeInteger(version) || version < 1) invalid()
  const value = await call<ResourceDownload>(
    'resourceDownloadInfo',
    `/resources/${idPath(id)}/download-info?expected_version=${version}`,
  )
  if (value.resource_id !== id.toLowerCase() || value.version !== version) invalid()
  return value
}
export async function putResourceFeedback(
  id: string,
  input: ResourceFeedbackInput,
  key: string,
): Promise<ResourceFeedback> {
  if (!valid('PutFeedback', input) || !/^[!-~]{1,128}$/.test(key)) invalid()
  const snapshot = { ...input }
  const value = await call<ResourceFeedback>(
    'resourceFeedbackPut',
    `/resources/${idPath(id)}/feedback`,
    snapshot,
    key,
  )
  if (
    value.resource_id !== id.toLowerCase() ||
    value.content_version !== snapshot.expected_content_version ||
    value.version < Math.max(1, snapshot.expected_feedback_version)
  )
    invalid()
  return value
}
