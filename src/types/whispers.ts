// 从固定 whispers/1.0.0 契约生成；使用 scripts/sync_whispers_contract.py 同步，勿手工修改。
export type BlockAck = { accepted: true }
export type BlockCreate = { source: SourceRef }
export type BlockEntry = {
  block_id: string
  version: number
  label: '已屏蔽对象'
  allowed_actions: 'interactionBlockDelete'[]
}
export type BlockEntryPage = { items: BlockEntry[]; next_cursor: string | null }
export type Capsule = {
  id: string
  version: number
  status:
    | 'scanning'
    | 'review_pending'
    | 'locked'
    | 'unlocked'
    | 'rejected'
    | 'isolated'
    | 'cancelled'
    | 'deleted'
  unlock_at: string
  server_now: string
  created_at: string
  body: string | null
  review_result: ReviewResult | null
  allowed_actions: ('whisperCapsuleCancel' | 'whisperCapsuleDelete')[]
}
export type CapsuleCreate = { body: string; unlock_at: string; safety_notice_accepted: true }
export type CapsulePage = { items: CapsuleSummary[]; next_cursor: string | null }
export type CapsuleSummary = {
  id: string
  version: number
  status:
    | 'scanning'
    | 'review_pending'
    | 'locked'
    | 'unlocked'
    | 'rejected'
    | 'isolated'
    | 'cancelled'
    | 'deleted'
  unlock_at: string
  server_now: string
  created_at: string
  body: null
  review_result: ReviewResult | null
  allowed_actions: ('whisperCapsuleCancel' | 'whisperCapsuleDelete')[]
}
export type CommentCreate = {
  expected_post_version: number
  expected_comments_epoch: number
  body: string
  identity: IdentityInput
}
export type CommentUpdate = {
  expected_version: number
  expected_post_version: number
  expected_comments_epoch: number
  body: string
  identity: IdentityInput
}
export type CommentsSetting = { expected_version: number; comments_open: boolean }
export type HelpDirectory = {
  status: 'ready' | 'unavailable'
  version: number | null
  verified_at: string | null
  items: HelpItem[]
}
export type HelpItem = {
  kind: 'school_appointment' | 'hotline'
  label: string
  contact: string
  source_url: string
}
export type HugCommand = {
  expected_post_version: number
  expected_hug_version: number
  active: boolean
}
export type HugResult = { post_id: string; hug_count: number; my_hug: HugState }
export type HugState = { active: boolean; version: number }
export type IdentityInput =
  | { mode: 'anonymous' }
  | { mode: 'semi'; tags: Tags; dictionary_version: number }
  | { mode: 'named'; nickname_version: number }
export type ModuleConfig = {
  contract_version: 'whispers/1.0.0'
  enabled: boolean
  server_now: string
  semi_available: boolean
  grade_dictionary: { version: number | null; items: { code: string; label: string }[] }
  limits: {
    text_codepoints: 500
    nickname_min: 2
    nickname_max: 20
    capsule_min_delay_seconds: 60
    capsule_max_delay_seconds: 31536000
    capsule_active_limit: 20
  }
  report_types: { code: string; label: string }[]
  block_api: 'opaque-v1'
}
export type NicknameCommand = { expected_version: number; label: string }
export type NicknameState = {
  version: number
  active: { nickname_version: number; label: string } | null
  candidate: {
    nickname_version: number
    label: string
    status: 'scanning' | 'review_pending' | 'approved' | 'rejected' | 'restricted' | 'isolated'
    review_result: ReviewResult | null
  } | null
  allowed_actions: 'whisperNicknameSet'[]
}
export type Notification = {
  id: string
  version: number
  kind: 'whisper_comment' | 'whisper_capsule_unlocked'
  target_kind: 'post' | 'capsule'
  target_id: string
  comment_id: string | null
  read: boolean
  created_at: string
  notice: string
  allowed_actions: 'whisperNotificationRead'[]
}
export type NotificationPage = { items: Notification[]; next_cursor: string | null }
export type OwnerComment = {
  id: string
  version: number
  content_version: number
  status:
    | 'scanning'
    | 'review_pending'
    | 'published'
    | 'rejected'
    | 'withdrawn'
    | 'cancelled'
    | 'restricted'
    | 'isolated'
    | 'privacy_hold'
    | 'context_changed'
  body: string | null
  identity_input: IdentityInput | null
  review_result: ReviewResult | null
  created_at: string
  updated_at: string
  published_at: string | null
  allowed_actions: ('whisperCommentUpdate' | 'whisperCommentWithdraw')[]
  post_id: string | null
  parent_content_version: number
  recovery_body: string | null
}
export type OwnerCommentPage = { items: OwnerComment[]; next_cursor: string | null }
export type OwnerPost = {
  id: string
  version: number
  content_version: number
  status:
    | 'draft'
    | 'scanning'
    | 'review_pending'
    | 'published'
    | 'rejected'
    | 'withdrawn'
    | 'cancelled'
    | 'restricted'
    | 'isolated'
    | 'privacy_hold'
  body: string | null
  identity_input: IdentityInput | null
  review_result: ReviewResult | null
  created_at: string
  updated_at: string
  published_at: string | null
  allowed_actions: (
    'whisperCommentsSetting' | 'whisperPostSubmit' | 'whisperPostUpdate' | 'whisperPostWithdraw'
  )[]
  comments_open: boolean
  comments_epoch: number
}
export type OwnerPostPage = { items: OwnerPost[]; next_cursor: string | null }
export type PostCreate = { body: string; identity: IdentityInput }
export type PostUpdate = { expected_version: number; body: string; identity: IdentityInput }
export type PublicComment = {
  id: string
  version: number
  content_version: number
  body: string
  identity: PublicIdentity
  published_at: string
  school_related: boolean
  notice_codes: 'UNVERIFIED_SCHOOL'[]
  notice_text: '未经证实' | null
  viewer_is_author: boolean
  allowed_actions: ('interactionBlockCreate' | 'whisperReportCreate')[]
  post_id: string
  parent_content_version: number
}
export type PublicCommentPage = { items: PublicComment[]; next_cursor: string | null }
export type PublicIdentity = {
  mode: 'anonymous' | 'semi' | 'named'
  label: string
  tags: Tags | null
  is_author: boolean
}
export type PublicPost = {
  id: string
  version: number
  content_version: number
  body: string
  identity: PublicIdentity
  published_at: string
  school_related: boolean
  notice_codes: 'UNVERIFIED_SCHOOL'[]
  notice_text: '未经证实' | null
  viewer_is_author: boolean
  allowed_actions: (
    'interactionBlockCreate' | 'whisperCommentCreate' | 'whisperHugSet' | 'whisperReportCreate'
  )[]
  comments_open: boolean
  comments_epoch: number
  comment_count: number
  hug_count: number
  my_hug: HugState | null
}
export type PublicPostPage = { items: PublicPost[]; next_cursor: string | null }
export type ReportAck = { id: string; status: 'pending' }
export type ReportCreate = {
  source: { kind: 'whisper_post' | 'whisper_comment'; id: string; content_version: number }
  type_code: string
  description?: string
}
export type ReviewResult = {
  decision: 'pending' | 'approved' | 'rejected' | 'cancelled'
  content_version: number
  reason: string | null
  revision_suggestion: string | null
}
export type SourceRef =
  | { kind: 'whisper_post' | 'whisper_comment'; id: string; content_version: number }
  | { kind: 'public_profile'; id: string }
export type Tags = {
  campus: 'wushan' | 'university_town' | 'international'
  grade: string
  gender: 'male' | 'female' | 'undisclosed'
}
export type VersionCommand = { expected_version: number }
export type Workspace = {
  server_now: string
  verification: 'unverified' | 'pending' | 'verified' | 'rejected'
  write_restricted: boolean
  allowed_actions: ('interactionBlockCreate' | 'whisperCapsuleCreate' | 'whisperPostCreate')[]
}
export interface WhisperInputs {
  whisperConfigGet: Record<string, never>
  whisperHelpGet: Record<string, never>
  whisperPostsList: { query?: { limit?: number; cursor?: string } }
  whisperPostGet: { path: { post_id: string } }
  whisperCommentsList: { path: { post_id: string }; query?: { limit?: number; cursor?: string } }
  whisperCommentCreate: { path: { post_id: string }; data: CommentCreate; key: string }
  whisperWorkspaceGet: Record<string, never>
  whisperOwnPostsList: { query?: { limit?: number; cursor?: string } }
  whisperPostCreate: { data: PostCreate; key: string }
  whisperOwnPostGet: { path: { post_id: string } }
  whisperPostUpdate: { path: { post_id: string }; data: PostUpdate; key: string }
  whisperPostSubmit: { path: { post_id: string }; data: VersionCommand; key: string }
  whisperPostWithdraw: { path: { post_id: string }; data: VersionCommand; key: string }
  whisperCommentsSetting: { path: { post_id: string }; data: CommentsSetting; key: string }
  whisperOwnCommentsList: { query?: { limit?: number; cursor?: string } }
  whisperOwnCommentGet: { path: { comment_id: string } }
  whisperCommentUpdate: { path: { comment_id: string }; data: CommentUpdate; key: string }
  whisperCommentWithdraw: { path: { comment_id: string }; data: VersionCommand; key: string }
  whisperHugSet: { path: { post_id: string }; data: HugCommand; key: string }
  whisperNicknameGet: Record<string, never>
  whisperNicknameSet: { data: NicknameCommand; key: string }
  whisperCapsulesList: { query?: { limit?: number; cursor?: string } }
  whisperCapsuleCreate: { data: CapsuleCreate; key: string }
  whisperCapsuleGet: { path: { capsule_id: string } }
  whisperCapsuleCancel: { path: { capsule_id: string }; data: VersionCommand; key: string }
  whisperCapsuleDelete: { path: { capsule_id: string }; data: VersionCommand; key: string }
  interactionBlocksList: { query?: { limit?: number; cursor?: string } }
  interactionBlockCreate: { data: BlockCreate; key: string }
  interactionBlockDelete: { path: { block_id: string }; data: VersionCommand; key: string }
  whisperReportCreate: { data: ReportCreate; key: string }
  whisperNotificationsList: { query?: { limit?: number; cursor?: string } }
  whisperNotificationRead: { path: { notification_id: string }; data: VersionCommand; key: string }
}
export interface WhisperOutputs {
  whisperConfigGet: ModuleConfig
  whisperHelpGet: HelpDirectory
  whisperPostsList: PublicPostPage
  whisperPostGet: PublicPost
  whisperCommentsList: PublicCommentPage
  whisperCommentCreate: OwnerComment
  whisperWorkspaceGet: Workspace
  whisperOwnPostsList: OwnerPostPage
  whisperPostCreate: OwnerPost
  whisperOwnPostGet: OwnerPost
  whisperPostUpdate: OwnerPost
  whisperPostSubmit: OwnerPost
  whisperPostWithdraw: OwnerPost
  whisperCommentsSetting: OwnerPost
  whisperOwnCommentsList: OwnerCommentPage
  whisperOwnCommentGet: OwnerComment
  whisperCommentUpdate: OwnerComment
  whisperCommentWithdraw: OwnerComment
  whisperHugSet: HugResult
  whisperNicknameGet: NicknameState
  whisperNicknameSet: NicknameState
  whisperCapsulesList: CapsulePage
  whisperCapsuleCreate: CapsuleSummary
  whisperCapsuleGet: Capsule
  whisperCapsuleCancel: CapsuleSummary
  whisperCapsuleDelete: CapsuleSummary
  interactionBlocksList: BlockEntryPage
  interactionBlockCreate: BlockAck
  interactionBlockDelete: void
  whisperReportCreate: ReportAck
  whisperNotificationsList: NotificationPage
  whisperNotificationRead: Notification
}
export type WhisperOperation = keyof WhisperInputs
