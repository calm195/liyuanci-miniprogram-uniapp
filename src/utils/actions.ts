import type { UserInfo, Verification, VerificationInput, StudentCardAsset } from '../types/api.ts'
import type { WishResult } from '../types/wish.ts'

// 仅消费正式索引中本端适用的写提示；目录本身不赋予权限。
export const meActions = [
  'postMeStudentCardAssets',
  'postMeVerificationRequests',
  'postWishes',
] as const
export const wishActions = [
  'putWishesIdContent',
  'deleteWishesIdDraft',
  'postWishesIdSubmitReview',
  'postWishesIdPublish',
  'postWishesIdWithdraw',
  'postWishesIdRollback',
  'postWishesIdComplete',
  'postWishesIdExceptionExit',
] as const
export type WishAction = (typeof wishActions)[number]
const validVersion = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0
export function canMeAction(
  me: UserInfo | null,
  targetId: string,
  action: string,
  validated: boolean,
): boolean {
  if (
    !validated ||
    !me ||
    !targetId ||
    me.id !== targetId ||
    !meActions.some((known) => known === action)
  )
    return false
  if (!Array.isArray(me.allowed_actions) || !me.allowed_actions.includes(action)) return false
  return action === 'postWishes'
    ? me.verification === 'verified'
    : ['unverified', 'rejected'].includes(me.verification)
}
export function canWishAction(
  me: UserInfo | null,
  validated: boolean,
  wish: WishResult | null,
  targetId: string,
  action: string,
): boolean {
  return (
    !!me &&
    validated &&
    me.verification === 'verified' &&
    !!wish &&
    !!targetId &&
    wish.id === targetId &&
    validVersion(wish.version) &&
    !wish.privacy_review_required &&
    wishActions.some((known) => known === action) &&
    Array.isArray(wish.allowed_actions) &&
    wish.allowed_actions.includes(action) &&
    (action !== 'postWishesIdSubmitReview' || validVersion(wish.content_version))
  )
}
export type ReviewSnapshot = {
  state: 'unknown' | 'absent' | 'present'
  record: Verification | null
}
// 按 UTF-8 计算安全输入边界，不将技术字节上限解释为学校资格规则。
function utf8Bytes(value: string): number {
  return Array.from(value).reduce((total, char) => {
    const point = char.codePointAt(0)!
    return total + (point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4)
  }, 0)
}
// 仅明确无记录才省略版本；所有读取错误都保持未知，不能降级成首次。
export function verificationInput(
  name: string,
  studentNumber: string,
  asset: StudentCardAsset | null,
  review: ReviewSnapshot,
): VerificationInput {
  if (!name.trim() || !studentNumber.trim()) throw new Error('请填写姓名和学号')
  if (utf8Bytes(name) > 256 || utf8Bytes(studentNumber) > 128)
    throw new Error('姓名或学号超出接口输入大小限制')
  if (!asset?.asset_id || asset.scan_status !== 'approved')
    throw new Error('学生卡安全扫描尚未通过')
  if (review.state === 'unknown') throw new Error('请先读取当前审核记录')
  const input: VerificationInput = {
    name,
    student_number: studentNumber,
    asset_id: asset.asset_id,
  }
  if (review.state === 'present') {
    if (
      !review.record ||
      review.record.status !== 'rejected' ||
      !validVersion(review.record.version)
    )
      throw new Error('当前审核记录不可重提，请重新读取')
    input.expected_version = review.record.version
  } else if (review.record !== null) throw new Error('审核记录状态不一致，请重新读取')
  return input
}
