import { request } from '@/utils/request'
import type { CareCard } from '@/types/care'

// 卡片归属由服务端逐次校验；不读取后台案件或身份资料。
export const getCareCard = (id: string) =>
  request<CareCard>({ url: `/me/care-cards/${encodeURIComponent(id)}` })
