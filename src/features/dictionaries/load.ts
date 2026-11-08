import { request } from '@/utils/request'
import { parseDictionaries, replaceDictionaries } from './catalog'
let pending: Promise<void> | undefined
// 应用回到前台时刷新公开展示资料；失败保留本进程已验证快照，不恢复硬编码映射。
export function refreshDictionaries(): Promise<void> {
  if (!pending)
    pending = request<unknown>({ url: '/dictionaries', auth: false, silent: true })
      .then((value) => {
        replaceDictionaries(parseDictionaries(value))
      })
      .finally(() => {
        pending = undefined
      })
  return pending
}
