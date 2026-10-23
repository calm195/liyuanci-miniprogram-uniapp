import { getWish } from '@/api/wishes'
import { getStory } from '@/api/stories'
import { listWishApplications } from '@/api/applications'
import { findConversation, listMessages, listNotifications } from '@/api/chat'
import { findSafetyItem } from '@/utils/safety'
import { mergeMessages } from '@/utils/chat'
import type { ReportKind } from '@/types/safety'

// 路由仅携带引用；不使用来源页正文或昵称作为当前授权证据。
export async function readableReportTarget(
  kind: ReportKind,
  id: string,
  context: string,
  current: () => boolean,
) {
  if (!id || !current()) return false
  if (kind === 'wish') {
    const wish = await getWish(id)
    return (
      current() &&
      wish.id === id &&
      !wish.privacy_review_required &&
      !!(wish.public || wish.participant || wish.own_content)
    )
  }
  if (kind === 'story') {
    const story = await getStory(id)
    return current() && story.id === id
  }
  if (kind === 'application') {
    if (!context) return false
    const wish = await getWish(context)
    if (!current() || wish.id !== context || !wish.own_content || wish.privacy_review_required)
      return false
    return !!(await findSafetyItem(
      (cursor) => listWishApplications(context, cursor),
      (item) => item.id === id && item.wish_id === context && item.status === 'active',
      current,
    ))
  }
  if (kind === 'message') {
    if (!context || !(await findConversation(context, current)) || !current()) return false
    let after = 0
    while (current()) {
      const page = await listMessages(context, after)
      if (!current()) return false
      const result = mergeMessages([], page, after)
      if (result.items.some((item) => item.message_id === id)) return true
      if (result.afterSeq === after) return false
      after = result.afterSeq
    }
  }
  return false
}
export async function ownPenaltyNotification(
  notificationId: string,
  penaltyId: string,
  current: () => boolean,
) {
  if (!notificationId || !penaltyId) return false
  return !!(await findSafetyItem(
    listNotifications,
    (item) =>
      item.id === notificationId && item.kind === 'penalty_notice' && item.target_ref === penaltyId,
    current,
  ))
}
