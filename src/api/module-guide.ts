import { request } from '@/utils/request'
export interface GuideModule {
  module: string
  title: string
  body: string
}
export interface ModuleGuide {
  version: number
  modules: GuideModule[]
  acknowledged_version: number
}
// 使用说明仅接受已发布纯文本快照，损坏响应不能形成确认凭据。
export function parseModuleGuide(value: unknown): ModuleGuide {
  if (!value || typeof value !== 'object') throw new Error('使用说明格式无效')
  const guide = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(guide.version) ||
    Number(guide.version) < 0 ||
    !Number.isSafeInteger(guide.acknowledged_version) ||
    Number(guide.acknowledged_version) < 0 ||
    !Array.isArray(guide.modules) ||
    guide.modules.length > 12 ||
    !guide.modules.every((item: unknown) => {
      if (!item || typeof item !== 'object') return false
      const module = item as Record<string, unknown>
      return (
        typeof module.module === 'string' &&
        !!module.module &&
        typeof module.title === 'string' &&
        !!module.title.trim() &&
        Array.from(module.title).length <= 40 &&
        typeof module.body === 'string' &&
        !!module.body.trim() &&
        Array.from(module.body).length <= 2000
      )
    })
  )
    throw new Error('使用说明格式无效')
  return value as ModuleGuide
}
export const getModuleGuide = async () =>
  parseModuleGuide(await request<unknown>({ url: '/me/module-guide' }))
export const acknowledgeGuide = async (version: number) =>
  parseModuleGuide(
    await request<unknown>({
      url: '/me/module-guide/ack',
      method: 'PUT',
      data: { version },
      header: { 'Idempotency-Key': `guide-${version}-${Date.now()}` },
    }),
  )
