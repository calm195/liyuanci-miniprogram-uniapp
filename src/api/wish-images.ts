import { request } from '@/utils/request'
import { config } from '@/config'
import { session } from '@/utils/session'
import type { WishImage } from '@/types/wish'

export function uploadWishImage(filePath: string, key: string) {
  return request<WishImage>({
    url: '/wish-images',
    method: 'POST',
    filePath,
    timeout: 120000,
    header: { 'Idempotency-Key': key },
    silent: true,
  })
}
// 仅请求自己配置的 API，避免将会话凭据附在任意返回地址上。
export function downloadWishImage(id: string, wishId?: string): Promise<string> {
  const epoch = session.getEpoch()
  const token = session.getToken()
  return new Promise((resolve, reject) =>
    uni.downloadFile({
      url: `${config.apiBaseUrl.replace(/\/$/, '')}/wish-images/${encodeURIComponent(id)}${wishId ? `?wish_id=${encodeURIComponent(wishId)}` : ''}`,
      header: {
        'X-Wish-Identity-Version': '2',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (result) => {
        if (epoch !== session.getEpoch() || result.statusCode !== 200) {
          reject(new Error('图片暂不可查看'))
          return
        }
        resolve(result.tempFilePath)
      },
      fail: () => reject(new Error('图片暂不可查看')),
    }),
  )
}
