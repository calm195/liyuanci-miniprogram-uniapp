import { request, RequestError } from '@/utils/request'
import { session } from '@/utils/session'
import {
  matchmakingID,
  parseMatchmakingDetail,
  parseMatchmakingAccountProfile,
  parseMatchmakingPage,
  parseMatchmakingProfileDraft,
  parseMatchmakingReceipt,
} from '@/utils/matchmaking'
import type { MatchmakingCommand } from '@/types/matchmaking'

function path(id: string) {
  if (!matchmakingID(id)) throw new Error('活动标识无效，请从活动列表重新进入。')
  return `/matchmaking/activities/${id}`
}
async function call(
  url: string,
  method: 'GET' | 'PUT' | 'POST' = 'GET',
  data?: Record<string, unknown>,
  key?: string,
) {
  if (!session.getToken())
    throw new RequestError('请先登录后查看包分配活动。', 401, 'UNAUTHENTICATED', '', 401)
  return request<unknown>({
    url,
    method,
    data,
    silent: true,
    header: key ? { 'Idempotency-Key': key } : undefined,
  })
}
export async function listMatchmaking(page = 1) {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('活动页码无效。')
  return parseMatchmakingPage(await call(`/matchmaking/activities?page=${page}&limit=20`))
}
export async function getMatchmaking(id: string) {
  const detail = parseMatchmakingDetail(await call(path(id)))
  if (detail.activity.id !== id) throw new Error('活动返回目标不匹配，请刷新。')
  return detail
}
export async function getMatchmakingAccountProfile() {
  return parseMatchmakingAccountProfile(await call('/matchmaking/profile'))
}
export async function writeMatchmaking(command: MatchmakingCommand) {
  if (!/^[!-~]{1,128}$/.test(command.key)) throw new Error('操作凭据无效。')
  if (command.kind === 'profile') {
    const profile = parseMatchmakingProfileDraft(command.input.profile)
    if (!Number.isSafeInteger(command.input.expected_version) || command.input.expected_version < 0)
      throw new Error('个人资料版本无效，请刷新。')
    return parseMatchmakingReceipt(
      await call(
        '/matchmaking/profile',
        'PUT',
        { expected_version: command.input.expected_version, profile },
        command.key,
      ),
    )
  }
  const base = path(command.activityId)
  if (command.kind === 'enroll') {
    if (
      !command.input.consent ||
      !Number.isSafeInteger(command.input.profile_version) ||
      command.input.profile_version < 1 ||
      !Number.isSafeInteger(command.input.expected_version) ||
      command.input.expected_version < 0
    )
      throw new Error('请核对个人资料和展示说明后提交。')
    return parseMatchmakingReceipt(
      await call(`${base}/enrollment`, 'PUT', command.input, command.key),
    )
  }
  if (command.kind === 'withdraw') {
    if (
      !Number.isSafeInteger(command.input.expected_version) ||
      command.input.expected_version < 1 ||
      [...command.input.reason].length > 200 ||
      !command.input.reason.trim()
    )
      throw new Error('请填写退出原因。')
    return parseMatchmakingReceipt(
      await call(`${base}/withdraw`, 'POST', command.input, command.key),
    )
  }
  if (!matchmakingID(command.taskId)) throw new Error('任务标识无效。')
  return parseMatchmakingReceipt(
    await call(`${base}/tasks/${command.taskId}/open`, 'POST', {}, command.key),
  )
}
