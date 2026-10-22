import { request } from '@/utils/request'
import { session } from '@/utils/session'
import { studentCardMultipart } from '@/utils/student-card'
import type { StudentCardAsset, Verification, VerificationInput } from '@/types/api'

export async function uploadStudentCard(filePath: string, key: string) {
  const epoch = session.getEpoch()
  if (!session.getToken() || !key) throw new Error('请先登录后重新上传学生卡')
  // 平台解码结果与文件签名共同校验，不能只信扩展名。
  const image = await uni.getImageInfo({ src: filePath })
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
    method: 'POST',
    data: multipart.body,
    header: { 'Content-Type': multipart.contentType, 'Idempotency-Key': key },
  })
}
// 页面按生命周期隔离单次查询；不推断扫描完成时间。
export function getStudentCardAsset(id: string) {
  return request<StudentCardAsset>({
    url: `/me/student-card-assets/${encodeURIComponent(id)}`,
    method: 'GET',
  })
}
// 首次省略版本；重提由调用方读取当前审核记录版本，不默认或替换版本。
export function submitVerification(input: VerificationInput, key: string) {
  return request<Verification>({
    url: '/me/verification-requests',
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
}
