// 与当前生产学生卡预算保持一致；服务端仍负责实际图片和规范化结果的最终校验。
export const studentCardMaxBytes = 4 * 1024 * 1024
export const studentCardMaxPixels = 4_000_000

export function assertStudentCardSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('无法确认图片大小，请重新选择')
  if (size > studentCardMaxBytes) throw new Error('图片不能超过 4 MiB，请压缩或裁剪后重新选择')
}

export function assertStudentCardDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new Error('无法确认图片尺寸，请重新选择 PNG/JPEG 图片')
  if (width > studentCardMaxPixels / height)
    throw new Error('图片不能超过 400 万像素，请降低分辨率后重新选择')
}

export function studentCardMultipart(bytes: Uint8Array, decodedType: string) {
  assertStudentCardSize(bytes.byteLength)
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const type = png && decodedType === 'png' ? 'png' : jpeg && decodedType === 'jpeg' ? 'jpeg' : ''
  if (!type) throw new Error('请选择真实 PNG 或 JPEG 图片')
  const boundary = `student-card-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // 固定 ASCII 文件名，不将本地路径或用户文件名写入 multipart 头。
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="card.${type}"\r\nContent-Type: image/${type}\r\n\r\n`
  const tail = `\r\n--${boundary}--\r\n`
  const length = head.length + bytes.byteLength + tail.length
  const body = new Uint8Array(length)
  body.set(Array.from(head, (char) => char.charCodeAt(0)))
  body.set(bytes, head.length)
  body.set(
    Array.from(tail, (char) => char.charCodeAt(0)),
    head.length + bytes.byteLength,
  )
  return { body: body.buffer, contentType: `multipart/form-data; boundary=${boundary}` }
}
