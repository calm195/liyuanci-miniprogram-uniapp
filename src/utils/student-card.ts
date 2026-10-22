export function studentCardMultipart(bytes: Uint8Array, decodedType: string) {
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
