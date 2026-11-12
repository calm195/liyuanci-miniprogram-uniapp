import { request } from '@/utils/request'
import { config } from '@/config'
import { session } from '@/utils/session'
import type { WishImage } from '@/types/wish'
import { createImageDownloadQueue } from '@/utils/image-download-queue'
import type { ImageDownload } from '@/utils/image-download-queue'

const downloads = createImageDownloadQueue(4)
type ImageVariant = 'original' | 'thumbnail' | 'preview'

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
export function requestWishImage(
  id: string,
  wishId?: string,
  variant: ImageVariant = 'original',
): ImageDownload {
  const epoch = session.getEpoch()
  const token = session.getToken()
  const query = [
    wishId ? `wish_id=${encodeURIComponent(wishId)}` : '',
    variant !== 'original' ? `variant=${variant}` : '',
  ]
    .filter(Boolean)
    .join('&')
  return downloads.request(JSON.stringify([epoch, id, wishId, variant]), () => {
    let task: UniApp.DownloadTask | undefined
    const promise = new Promise<string>((resolve, reject) => {
      if (epoch !== session.getEpoch()) {
        reject(new Error('图片暂不可查看'))
        return
      }
      task = uni.downloadFile({
        url: `${config.apiBaseUrl.replace(/\/$/, '')}/wish-images/${encodeURIComponent(id)}${query ? `?${query}` : ''}`,
        timeout: 30000,
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
      })
    })
    return { promise, cancel: () => task?.abort() }
  })
}

export function downloadWishImage(id: string, wishId?: string): Promise<string> {
  return requestWishImage(id, wishId).promise
}
