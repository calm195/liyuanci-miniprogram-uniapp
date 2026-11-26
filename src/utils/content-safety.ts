// 发布写入的统一安全提示只取已知业务码。
export function contentSafetyMessage(failure: unknown): string {
  if (!failure || typeof failure !== 'object' || !('error_code' in failure)) return ''
  if (failure.error_code === 'CONTENT_VIOLATION') return '你发布的内容含有违规信息'
  if (failure.error_code === 'CONTENT_REVIEW_REQUIRED') return '内容暂无法发布，请修改后重试'
  return ''
}
