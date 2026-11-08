import { request, RequestError } from '@/utils/request'
import { session } from '@/utils/session'
import {
  studentCardMultipart,
  assertStudentCardSize,
  assertStudentCardDimensions,
  studentCardMaxBytes,
  studentCardMaxPixels,
} from '@/utils/student-card'
import type { StudentCardAsset, Verification, VerificationInput } from '@/types/api'

async function inspectImage(filePath: string) {
  const file = await uni.getFileInfo({ filePath }).catch(() => {
    throw new Error('无法读取图片文件，请重新选择')
  })
  if (!Number.isSafeInteger(file.size) || file.size < 1)
    throw new Error('无法确认图片大小，请重新选择')
  // 平台解码结果与文件签名共同校验，不能只信扩展名。
  const image = await uni.getImageInfo({ src: filePath }).catch(() => {
    throw new Error('图片无法解码，请重新选择可正常打开的 PNG 或 JPEG 图片')
  })
  assertStudentCardDimensions(image.width, image.height)
  const type = image.type === 'jpg' ? 'jpeg' : image.type
  if (type !== 'png' && type !== 'jpeg') throw new Error('请选择真实 PNG 或 JPEG 图片')
  return { width: image.width, height: image.height, type, size: file.size, filePath }
}

type ResizeImage = (path: string, width: number, height: number) => Promise<string>
async function resizeImage(
  original: Awaited<ReturnType<typeof inspectImage>>,
  maxPixels: number,
  fallback?: ResizeImage,
) {
  const scale = Math.min(
    1,
    Math.sqrt(maxPixels / original.width / original.height),
    2048 / Math.max(original.width, original.height),
  )
  const width = Math.max(1, Math.floor(original.width * scale))
  const height = Math.max(1, Math.floor(original.height * scale))
  try {
    const compressed = await new Promise<{ tempFilePath: string }>((resolve, reject) => {
      uni.compressImage({
        src: original.filePath,
        quality: 92,
        compressedWidth: width,
        compressedHeight: height,
        success: resolve,
        fail: reject,
      })
    })
    const output = await inspectImage(compressed.tempFilePath)
    // 旧基础库可能忽略缩放参数，按实际结果决定是否回退。
    if (output.width * output.height <= maxPixels && output.size <= studentCardMaxBytes)
      return output
  } catch {
    // 部分微信版本只支持原生 JPEG 压缩，PNG 由页面画布重新编码。
  }
  if (fallback) {
    const output = await inspectImage(await fallback(original.filePath, width, height))
    if (output.width * output.height <= maxPixels && output.size <= studentCardMaxBytes)
      return output
  }
  throw new Error('无法自动缩小图片，请裁剪后重新选择')
}

export async function uploadStudentCard(
  filePath: string,
  key: string,
  options?: { resize: ResizeImage; isCurrent: () => boolean },
) {
  const epoch = session.getEpoch()
  if (!session.getToken() || !key) throw new Error('请先登录后重新上传学生卡')
  function ensureCurrent() {
    if (epoch !== session.getEpoch() || options?.isCurrent() === false)
      throw new Error('会话已变化，请重新选择学生卡')
  }
  const original = await inspectImage(filePath)
  ensureCurrent()
  let image = original
  if (
    original.width * original.height > studentCardMaxPixels ||
    original.size > studentCardMaxBytes
  )
    image = await resizeImage(original, studentCardMaxPixels, options?.resize)
  try {
    return await sendImage(image)
  } catch (failure) {
    // 服务端在写入前拒绝过大的 PNG 规范化结果。只有这种明确拒绝才允许缩小后重发。
    if (
      !(failure instanceof RequestError) ||
      failure.error_code !== 'STUDENT_CARD_NORMALIZED_IMAGE_TOO_LARGE'
    )
      throw failure
    ensureCurrent()
    // 约 96 万像素给无损 RGBA 编码留出空间；从原图重采样，避免重复有损编码。
    return sendImage(await resizeImage(original, 960_000, options?.resize))
  }

  async function sendImage(image: Awaited<ReturnType<typeof inspectImage>>) {
    ensureCurrent()
    assertStudentCardSize(image.size)
    const data = await new Promise<ArrayBuffer>((resolve, reject) => {
      uni.getFileSystemManager().readFile({
        filePath: image.filePath,
        success: (result) => {
          // 微信桥接对象可能来自不同运行上下文，不能依赖本地构造函数的 instanceof。
          if (
            typeof result.data !== 'string' &&
            Object.prototype.toString.call(result.data) === '[object ArrayBuffer]'
          )
            resolve(result.data)
          else reject(new Error('无法读取图片二进制内容'))
        },
        fail: () => reject(new Error('无法读取学生卡图片，请重新选择')),
      })
    })
    const multipart = studentCardMultipart(new Uint8Array(data), image.type)
    ensureCurrent()
    return request<StudentCardAsset>({
      url: '/me/student-card-assets',
      timeout: 45_000,
      silent: true,
      method: 'POST',
      data: multipart.body,
      header: { 'Content-Type': multipart.contentType, 'Idempotency-Key': key },
    })
  }
}
// 查询提示由认证页统一展示。
export function getStudentCardAsset(id: string) {
  return request<StudentCardAsset>({
    url: `/me/student-card-assets/${encodeURIComponent(id)}`,
    silent: true,
    method: 'GET',
  })
}
// 首次省略版本；重提由调用方读取当前审核记录版本，不默认或替换版本。
export function submitVerification(input: VerificationInput, key: string) {
  return request<Verification>({
    url: '/me/verification-requests',
    silent: true,
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
}
