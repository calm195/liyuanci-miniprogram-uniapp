import type { ResourceDownload } from '@/types/resource'

// 下载使用服务端刚签发的地址，不附带业务会话令牌。
export function downloadResourceFile(
  value: ResourceDownload,
  progress: (percent: number) => void,
): { promise: Promise<string>; cancel: () => void } {
  if (!value.file || !/^https:\/\//i.test(value.download_url))
    throw new Error('当前资料不支持直接下载，请使用下载链接。')
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
export function openResourceFile(path: string, name: string): Promise<boolean> {
  const extension = name.split('.').pop()?.toLowerCase()
  if (!extension || !['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension))
    return Promise.resolve(false)
  return new Promise((resolve) =>
    uni.openDocument({
      filePath: path,
      fileType: extension,
      showMenu: true,
      success: () => resolve(true),
      fail: () => resolve(false),
    }),
  )
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
