import { config } from '@/config'
import type { ApiResponse } from '@/types/api'
import { session } from './session'
export class RequestError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly error_code = '',
    public readonly request_id = '',
    public readonly statusCode = 0,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}
export interface RequestResponse {
  statusCode: number
  data: unknown
  header?: Record<string, unknown>
}
type RequestOptions = Omit<UniApp.RequestOptions, 'success' | 'fail' | 'complete' | 'url'> & {
  url: string
  auth?: boolean
  silent?: boolean
  filePath?: string
  // 模块可按自己的正式契约验证封装、状态码与响应头。
  validateResponse?: (response: RequestResponse) => boolean
}
// 开发联调仅放行回环和私有局域网 HTTP，避免把令牌发送到公网明文地址。
function isAllowedApiBaseUrl(value: string): boolean {
  if (/^https:\/\/[^/]+(?:\/[^?#]*)?$/.test(value)) return true
  if (!config.isDev) return false
  const match = /^http:\/\/(localhost|\[::1\]|[0-9.]+)(?::([0-9]{1,5}))?(?:\/[^?#]*)?$/.exec(value)
  if (!match || (match[2] && (+match[2] < 1 || +match[2] > 65535))) return false
  if (match[1] === 'localhost' || match[1] === '[::1]') return true
  const octets = match[1]!.split('.')
  if (octets.some((part) => !/^(0|[1-9][0-9]{0,2})$/.test(part))) return false
  const parts = octets.map(Number)
  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255)) return false
  const [first, second] = parts
  return (
    first === 127 ||
    first === 10 ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 168)
  )
}
// 仅向配置的接口地址发送内存会话令牌；不记录请求正文或凭据。
export async function request<T>(options: RequestOptions): Promise<T> {
  try {
    if (config.useMock) throw new RequestError('合成模式不发送 API 请求', -1)
    if (!isAllowedApiBaseUrl(config.apiBaseUrl))
      throw new RequestError(
        config.isDev
          ? '请配置 HTTPS 或本机、局域网 HTTP API 地址（含 /api/v1）'
          : '请配置 HTTPS API 地址（含 /api/v1）',
        -1,
      )
    // 游标是不透明字符串，点号等合法查询字符不能当作路径穿越。
    const pathname = options.url.split('?')[0]!
    const invalidPath = pathname.split('/').some((part) => {
      try {
        const decoded = decodeURIComponent(part)
        return decoded === '.' || decoded === '..'
      } catch {
        return true
      }
    })
    if (!/^\/(?!\/)[a-zA-Z0-9/_?=&%~.!'()*-]*$/.test(options.url) || invalidPath)
      throw new RequestError('接口路径无效', -1)
    const token = session.getToken()
    const epoch = session.getEpoch()
    return await new Promise<T>((resolve, reject) => {
      const transport = {
        ...options,
        url: config.apiBaseUrl.replace(/\/$/, '') + options.url,
        timeout: options.timeout ?? 15000,
        header: {
          ...(options.filePath ? {} : { 'Content-Type': 'application/json' }),
          ...options.header,
          ...(options.auth !== false && token ? { Authorization: `Bearer ${token}` } : {}),
        },
        success: (response: RequestResponse) => {
          const body = response.data as ApiResponse<T>
          if (
            response.statusCode === 401 &&
            options.auth !== false &&
            epoch === session.getEpoch()
          ) {
            session.clear()
            uni.$emit('auth:expired')
          }
          if (epoch !== session.getEpoch() && response.statusCode !== 401) {
            reject(new RequestError('会话已变化，请重新操作', -1))
            return
          }
          if (options.validateResponse && !options.validateResponse(response)) {
            reject(new RequestError('接口返回格式不符合约定，请刷新后重试', -3))
            return
          }
          if (response.statusCode === 204) {
            resolve(undefined as T)
            return
          }
          if (response.statusCode < 200 || response.statusCode >= 300 || body?.code !== 0) {
            reject(
              new RequestError(
                response.statusCode === 401
                  ? options.auth === false
                    ? '微信登录凭据无效，请重新登录'
                    : '登录已过期，请重新登录'
                  : '请求未完成，请稍后重试',
                body?.code || response.statusCode,
                body?.error_code,
                body?.request_id,
                response.statusCode,
              ),
            )
            return
          }
          if (!body || typeof body.request_id !== 'string' || !('data' in body)) {
            reject(new RequestError('接口返回格式错误', -2))
            return
          }
          resolve(body.data)
        },
        fail: () => reject(new RequestError('网络异常，请检查网络后重试', -1)),
      }
      if (options.filePath) {
        uni.uploadFile({
          url: transport.url,
          filePath: options.filePath,
          name: 'file',
          header: transport.header,
          timeout: transport.timeout,
          success: (response) => {
            let body: unknown
            try {
              body = JSON.parse(response.data)
            } catch {
              // 无效正文仍走统一状态处理，确保上传返回 401 时清理会话。
              body = null
            }
            transport.success({ statusCode: response.statusCode, data: body })
          },
          fail: transport.fail,
        })
      } else {
        uni.request(transport)
      }
    })
  } catch (error) {
    const failure = error instanceof RequestError ? error : new RequestError('请求处理失败', -1)
    if (!options.silent) uni.showToast({ title: failure.message, icon: 'none' })
    throw failure
  }
}
