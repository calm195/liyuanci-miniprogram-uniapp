// 模块只解释固定协议使用的关键字，并执行规范文本和跨字段约束。
export interface ResourceSchema {
  $ref?: string
  type?: string | string[]
  const?: unknown
  enum?: unknown[]
  oneOf?: ResourceSchema[]
  allOf?: ResourceSchema[]
  properties?: Record<string, ResourceSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: ResourceSchema
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  'x-contract-text'?: { kind: string; canonical: boolean }
  'x-invariant'?: string
}
const whitespace =
  '\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const trim = new RegExp(`^[${whitespace}]+|[${whitespace}]+$`, 'gu')
const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
export const resourceId = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value)
export function utf8Length(value: string): number {
  return Array.from(value).reduce(
    (size, p) =>
      size + (p.codePointAt(0)! < 128 ? 1 : p.codePointAt(0)! < 2048 ? 2 : p.length === 2 ? 4 : 3),
    0,
  )
}
export function normalizeResourceText(kind: string, input: unknown): string | null {
  if (input === null && ['description', 'extraction_code'].includes(kind)) input = ''
  if (
    typeof input !== 'string' ||
    Array.from(input).some((p) => p.length === 1 && /[\ud800-\udfff]/u.test(p))
  )
    throw new Error('文本格式错误')
  let value = input
  if (kind === 'description') value = value.replace(/\r\n?/g, '\n')
  value = value.replace(trim, '')
  if (kind === 'download_url') {
    if (
      !value ||
      utf8Length(value) > 2048 ||
      new RegExp(`[${whitespace}\\u0000-\\u001f\\u007f-\\u009f]`, 'u').test(value) ||
      /\\|%(?![\da-fA-F]{2})/u.test(value)
    )
      throw new Error('链接格式错误')
    // 小程序没有浏览器 URL 全局，解析协议/authority 而不改写原链接。
    const parts = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(value)
    const authority = parts?.[1]
    if (!authority || authority.includes('@')) throw new Error('链接主机错误')
    let host = authority
    let port: string | undefined
    if (authority.startsWith('[')) {
      const match = /^\[([0-9a-fA-F:.]+)\](?::([0-9]+))?$/.exec(authority)
      if (!match || !validIPv6(match[1]!)) throw new Error('链接主机错误')
      host = match[1]!
      port = match[2]
    } else {
      const match = /^([^:[\]]+)(?::([0-9]+))?$/.exec(authority)
      if (!match) throw new Error('链接主机错误')
      host = match[1]!
      port = match[2]
      if (/[\uff0f\uff1f\uff03\uff20\uff1a]/u.test(host)) throw new Error('链接主机错误')
    }
    if (!host || (port !== undefined && (+port < 1 || +port > 65535)))
      throw new Error('链接端口错误')
    return value
  }
  const limits: Record<string, [number, number]> = {
    title: [1, 100],
    name: [1, 30],
    description: [0, 2000],
    extraction_code: [0, 64],
    q: [0, 100],
    reason: [1, 500],
  }
  const bound = limits[kind]
  const size = Array.from(value).length
  if (!bound || size < bound[0] || size > bound[1]) throw new Error('文本长度不符合要求')
  const chars = ['description', 'reason'].includes(kind) ? value.replace(/[\n\t]/g, '') : value
  if (
    Array.from(chars).some((p) => {
      const code = p.codePointAt(0)!
      return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029
    })
  )
    throw new Error('文本含控制字符')
  return kind === 'extraction_code' && !value ? null : value
}
function validIPv6(host: string): boolean {
  let value = host
  if (value.includes('.')) {
    const index = value.lastIndexOf(':')
    const octets = value.slice(index + 1).split('.')
    if (octets.length !== 4 || octets.some((p) => !/^(0|[1-9][0-9]{0,2})$/.test(p) || +p > 255))
      return false
    value = value.slice(0, index + 1) + '0:0'
  }
  if (value.includes('::')) {
    if (value.indexOf('::') !== value.lastIndexOf('::')) return false
    const groups = value.split('::').flatMap((part) => (part ? part.split(':') : []))
    return groups.length < 8 && groups.every((p) => /^[0-9a-fA-F]{1,4}$/.test(p))
  }
  return (
    value.split(':').length === 8 && value.split(':').every((p) => /^[0-9a-fA-F]{1,4}$/.test(p))
  )
}
export function matchesResourceSchema(
  schema: ResourceSchema,
  value: unknown,
  catalog: Record<string, ResourceSchema>,
): boolean {
  if (schema.$ref) {
    const target = catalog[schema.$ref.split('/').pop()!]
    return !!target && matchesResourceSchema(target, value, catalog)
  }
  const match = (s: ResourceSchema) => matchesResourceSchema(s, value, catalog)
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) return false
  if (schema.enum && !schema.enum.includes(value)) return false
  if (schema.oneOf && schema.oneOf.filter(match).length !== 1) return false
  if (schema.allOf && !schema.allOf.every(match)) return false
  if (Array.isArray(schema.type)) {
    if (!schema.type.some((type) => match({ ...schema, type }))) return false
  } else {
    const type = schema.type
    if (type === 'null' && value !== null) return false
    if (type === 'integer' && !Number.isSafeInteger(value)) return false
    if (type === 'string' && typeof value !== 'string') return false
    if (type === 'boolean' && typeof value !== 'boolean') return false
    if (type === 'array' && !Array.isArray(value)) return false
    if (type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value)))
      return false
  }
  if (
    typeof value === 'number' &&
    ((schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum))
  )
    return false
  if (typeof value === 'string') {
    const points = Array.from(value)
    if (points.some((p) => p.length === 1 && /[\ud800-\udfff]/u.test(p))) return false
    if (
      (schema.minLength !== undefined && points.length < schema.minLength) ||
      (schema.maxLength !== undefined && points.length > schema.maxLength)
    )
      return false
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) return false
    if (schema.format === 'uuid' && !resourceId(value)) return false
    if (schema.format === 'date-time') {
      const m = /^(\d{4})-(\d\d)-(\d\d)[Tt](\d\d):(\d\d):(\d\d)(?:\.\d+)?Z$/.exec(value)
      if (!m || +m[4]! > 23 || +m[5]! > 59 || +m[6]! > 59) return false
      const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
      if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`)
        return false
    }
  }
  if (schema['x-contract-text']) {
    try {
      const text = schema['x-contract-text']
      const normalized = normalizeResourceText(text.kind, value)
      if (text.canonical && normalized !== value) return false
    } catch {
      return false
    }
  }
  if (Array.isArray(value)) {
    if (
      (schema.minItems !== undefined && value.length < schema.minItems) ||
      (schema.maxItems !== undefined && value.length > schema.maxItems)
    )
      return false
    if (schema.items && !value.every((v) => matchesResourceSchema(schema.items!, v, catalog)))
      return false
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (![null, Object.prototype].includes(Object.getPrototypeOf(value))) return false
    const obj = value as Record<string, unknown>
    if (schema.required?.some((k) => !Object.prototype.hasOwnProperty.call(obj, k))) return false
    if (
      schema.additionalProperties === false &&
      Object.keys(obj).some(
        (k) => !Object.prototype.hasOwnProperty.call(schema.properties ?? {}, k),
      )
    )
      return false
    if (
      schema.properties &&
      !Object.entries(schema.properties).every(
        ([k, s]) =>
          !Object.prototype.hasOwnProperty.call(obj, k) ||
          matchesResourceSchema(s, obj[k], catalog),
      )
    )
      return false
    if (
      schema['x-invariant'] === 'download' &&
      obj.copy_text !==
        obj.download_url + (obj.extraction_code === null ? '' : '\n提取码：' + obj.extraction_code)
    )
      return false
    if (schema['x-invariant'] === 'student_detail') {
      if (Number(obj.content_version) > Number(obj.version)) return false
      const own = obj.my_feedback as Record<string, unknown> | null
      if (own && (own.resource_id !== obj.id || own.content_version !== obj.content_version))
        return false
    }
  }
  return true
}
