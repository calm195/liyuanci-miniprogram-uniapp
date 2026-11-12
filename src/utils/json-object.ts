// 微信桥接响应可能来自另一运行上下文，不能比较本地 Object.prototype 引用。
export function isJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return (
    prototype === null ||
    (Object.getPrototypeOf(prototype) === null &&
      Object.prototype.hasOwnProperty.call(prototype, 'constructor') &&
      prototype.constructor?.name === 'Object')
  )
}
