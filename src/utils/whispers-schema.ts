// 仅解释本端固定契约使用的 schema 关键字；协议新增关键字须同步消费者。
export interface Schema {
  $ref?: string
  type?: string
  const?: unknown
  enum?: unknown[]
  oneOf?: Schema[]
  anyOf?: Schema[]
  allOf?: Schema[]
  not?: Schema
  if?: Schema
  then?: Schema
  else?: Schema
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: boolean
  items?: Schema
  contains?: Schema
  uniqueItems?: boolean
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
}
export interface OperationSpec {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  private: boolean
  input: Schema
  output: Schema | null
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const isWhisperUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value)
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'undefined'
}
export function matchesSchema(
  schema: Schema,
  value: unknown,
  catalog: Record<string, Schema>,
): boolean {
  if (schema.$ref) {
    const target = catalog[schema.$ref.slice(schema.$ref.lastIndexOf('/') + 1)]
    return !!target && matchesSchema(target, value, catalog)
  }
  const match = (part: Schema) => matchesSchema(part, value, catalog)
  if ('const' in schema && value !== schema.const) return false
  if (schema.enum && !schema.enum.includes(value)) return false
  if (schema.oneOf && schema.oneOf.filter(match).length !== 1) return false
  if (schema.anyOf && !schema.anyOf.some(match)) return false
  if (schema.allOf && !schema.allOf.every(match)) return false
  if (schema.not && match(schema.not)) return false
  if (schema.if) {
    const branch = match(schema.if) ? schema.then : schema.else
    if (branch && !match(branch)) return false
  }
  if (schema.type === 'null' && value !== null) return false
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false
  if (schema.type === 'string' && typeof value !== 'string') return false
  if (schema.type === 'integer' && !Number.isSafeInteger(value)) return false
  if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
    return false
  if (schema.type === 'array' && !Array.isArray(value)) return false
  if (schema.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value)))
    return false
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return false
    if (schema.maximum !== undefined && value > schema.maximum) return false
  }
  if (typeof value === 'string') {
    // 孤立代理项不是有效 Unicode；码点长度与 UTF-16 单元长度不同。
    const points = Array.from(value)
    if (
      points.some((p) => p.length === 1 && p.charCodeAt(0) >= 0xd800 && p.charCodeAt(0) <= 0xdfff)
    )
      return false
    if (schema.minLength !== undefined && points.length < schema.minLength) return false
    if (schema.maxLength !== undefined && points.length > schema.maxLength) return false
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) return false
    if (schema.format === 'uuid' && !uuid.test(value)) return false
    if (schema.format === 'date-time') {
      const time = Date.parse(value)
      if (!Number.isFinite(time) || new Date(time).toISOString().replace('.000Z', 'Z') !== value)
        return false
    }
    if (schema.format === 'uri' && !/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value)) return false
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false
    if (schema.items && !value.every((item) => matchesSchema(schema.items!, item, catalog)))
      return false
    if (schema.contains && !value.some((item) => matchesSchema(schema.contains!, item, catalog)))
      return false
    if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) return false
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== null && prototype !== Object.prototype) return false
    const object = value as Record<string, unknown>
    if (schema.required?.some((key) => !Object.prototype.hasOwnProperty.call(object, key)))
      return false
    if (
      schema.additionalProperties === false &&
      Object.keys(object).some(
        (key) => !Object.prototype.hasOwnProperty.call(schema.properties ?? {}, key),
      )
    )
      return false
    if (
      schema.properties &&
      !Object.entries(schema.properties).every(
        ([key, part]) =>
          !Object.prototype.hasOwnProperty.call(object, key) ||
          matchesSchema(part, object[key], catalog),
      )
    )
      return false
  }
  return true
}
