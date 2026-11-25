import { config } from '@/config'
import { isAllowedApiBaseUrl, request } from '@/utils/request'

export interface RandomProfile {
  avatarId: string
  imagePath: string
  imageUrl: string
  nickname: string
  canReroll: boolean
}

const idPattern = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
const idFormat = new RegExp(`^${idPattern}$`, 'i')
const imagePathFormat = new RegExp(`^/random-profiles/images/${idPattern}$`, 'i')

function imageUrl(path: string) {
  // 只接受当前 API 的固定素材路径，避免将响应地址直接交给下载接口。
  if (!imagePathFormat.test(path) || !isAllowedApiBaseUrl(config.apiBaseUrl))
    throw new Error('随机头像地址无效。')
  return config.apiBaseUrl.replace(/\/$/, '') + path
}

export async function drawRandomProfile(previous?: RandomProfile | null): Promise<RandomProfile> {
  const result = await request<{
    avatar_id?: unknown
    image_path?: unknown
    nickname?: unknown
    can_reroll?: unknown
  }>({
    url: '/me/random-profile',
    method: 'POST',
    data: previous
      ? { previous_avatar_id: previous.avatarId, previous_nickname: previous.nickname }
      : {},
    silent: true,
  })
  if (
    typeof result?.avatar_id !== 'string' ||
    !idFormat.test(result.avatar_id) ||
    typeof result.image_path !== 'string' ||
    typeof result.nickname !== 'string' ||
    !result.nickname.trim() ||
    [...result.nickname].length > 40 ||
    typeof result.can_reroll !== 'boolean'
  )
    throw new Error('随机资料回执无效。')
  return {
    avatarId: result.avatar_id,
    imagePath: result.image_path,
    imageUrl: imageUrl(result.image_path),
    nickname: result.nickname,
    canReroll: result.can_reroll,
  }
}

export async function downloadRandomAvatar(path: string): Promise<string> {
  const result = await uni.downloadFile({ url: imageUrl(path), timeout: 15000 })
  if (result.statusCode !== 200 || !result.tempFilePath) throw new Error('随机头像下载失败。')
  return result.tempFilePath
}
