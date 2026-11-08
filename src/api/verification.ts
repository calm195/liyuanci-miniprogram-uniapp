import { request } from '@/utils/request'
import { session } from '@/utils/session'
import {
  studentCardMultipart,
  assertStudentCardSize,
  assertStudentCardDimensions,
} from '@/utils/student-card'
import type { StudentCardAsset, Verification, VerificationInput } from '@/types/api'

export async function uploadStudentCard(filePath: string, key: string) {
  const epoch = session.getEpoch()
  if (!session.getToken() || !key) throw new Error('请先登录后重新上传学生卡')
  // 先读取文件元数据，超限图片不读入内存、不发送网络请求。
  const file = await uni.getFileInfo({ filePath }).catch(() => {
    throw new Error('无法读取图片文件，请重新选择')
  })
  assertStudentCardSize(file.size)
  // 平台解码结果与文件签名共同校验，不能只信扩展名。
  const image = await uni.getImageInfo({ src: filePath }).catch(() => {
    throw new Error('图片无法解码，请重新选择可正常打开的 PNG 或 JPEG 图片')
  })
  assertStudentCardDimensions(image.width, image.height)
  const data = await new Promise<ArrayBuffer>((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath,
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
  const multipart = studentCardMultipart(new Uint8Array(data), image.type || '')
  if (epoch !== session.getEpoch()) throw new Error('会话已变化，请重新选择学生卡')
  return request<StudentCardAsset>({
    url: '/me/student-card-assets',
    timeout: 45_000,
    silent: true,
    method: 'POST',
    data: multipart.body,
    header: { 'Content-Type': multipart.contentType, 'Idempotency-Key': key },
  })
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
