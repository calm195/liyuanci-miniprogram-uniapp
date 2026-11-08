import type { ResourceDownload, ResourceFile } from '@/types/resource'

// 下载使用服务端刚签发的地址，不附带业务会话令牌。
export function downloadResourceFile(
  value: ResourceDownload,
  progress: (percent: number) => void,
): { promise: Promise<string>; cancel: () => void } {
  if (!value.file || !/^https:\/\//i.test(value.download_url))
    throw new Error('当前资料不支持直接下载。')
  let task: UniApp.DownloadTask | undefined
  const promise = new Promise<string>((resolve, reject) => {
    task = uni.downloadFile({
      url: value.download_url,
      timeout: 120_000,
      success: (result) => {
        if (result.statusCode !== 200 || !result.tempFilePath) {
          reject(new Error('文件下载失败或地址已过期，请重新下载。'))
          return
        }
        resolve(result.tempFilePath)
      },
      fail: () => reject(new Error('文件下载未完成，请检查网络后重试。')),
    })
    task.onProgressUpdate((result) => progress(Math.max(0, Math.min(100, result.progress))))
  })
  return { promise, cancel: () => task?.abort() }
}
declare const wx: { env: { USER_DATA_PATH: string } }

function resourceFilePath(file: ResourceFile): string {
  // 文件 ID 对应不可变的 COS 对象，重进详情可定位已保存的本地文件。
  const extension = file.name.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? ''
  return `${wx.env.USER_DATA_PATH}/resource-${file.id}${extension}`
}

export function findSavedResourceFile(file: ResourceFile): Promise<string | null> {
  if (typeof wx === 'undefined') return Promise.resolve(null)
  const path = resourceFilePath(file)
  return new Promise((resolve) =>
    uni.getFileSystemManager().access({
      path,
      success: () => resolve(path),
      fail: () => resolve(null),
    }),
  )
}

export function saveResourceFile(tempFilePath: string, file: ResourceFile): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined') {
      reject(new Error('请在微信小程序中保存文件。'))
      return
    }
    uni.getFileSystemManager().saveFile({
      tempFilePath,
      filePath: resourceFilePath(file),
      success: ({ savedFilePath }) => resolve(savedFilePath),
      fail: () => reject(new Error('文件保存失败，请检查手机存储空间后重试。')),
    })
  })
}

export function shareResourceFile(path: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!uni.shareFileMessage) {
      reject(new Error('当前环境不支持文件转发，请在微信小程序中操作。'))
      return
    }
    uni.shareFileMessage({
      filePath: path,
      fileName: name,
      success: () => resolve(),
      fail: () => reject(new Error('文件尚未转发，可再次操作。')),
    })
  })
}
