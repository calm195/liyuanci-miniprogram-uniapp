import { readFileSync } from 'node:fs'
import { reactive } from 'vue'
import { defineStore, createPinia, setActivePinia } from 'pinia'
import { session } from '../../src/utils/session.ts'
import * as content from '../../src/utils/whisper-content.ts'
import { loadRuntime, pageScript, settle } from './page-runtime.ts'
import { whispersRuntime, WhisperTestError as RequestError } from './whispers-runtime.ts'
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/whispers.json', import.meta.url), 'utf8'),
) as { fixtures: { schema: string; valid: boolean; body: unknown }[] }
export function sample(schema: string) {
  return structuredClone(
    fixture.fixtures.find((item) => item.schema === schema && item.valid)!.body,
  ) as Record<string, unknown>
}
export const postId = '6c500000-0000-4000-8000-000000000001'
export const commentId = '6c500000-0000-4000-8000-000000000002'
type Input = {
  url: string
  method: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}
export async function setup(name: string, query: Record<string, string> = {}, guest = false) {
  setActivePinia(createPinia())
  if (guest) session.clear()
  else session.setToken('synthetic-whisper-pages')
  const user = reactive({ user: guest ? null : { id: 'synthetic-owner' }, validated: true })
  const calls: Input[] = []
  const config = { useMock: false }
  const moduleConfig = {
    ...sample('ModuleConfig'),
    enabled: true,
    semi_available: true,
    grade_dictionary: { version: 4, items: [{ code: 'first', label: '合成年级' }] },
    report_types: [{ code: 'unsafe', label: '合成举报类型' }],
  }
  const workspace = {
    ...sample('Workspace'),
    verification: 'verified',
    allowed_actions: ['whisperPostCreate', 'interactionBlockCreate'],
  }
  let owner = {
    ...sample('OwnerPost'),
    id: postId,
    version: 8,
    content_version: 3,
    status: 'draft',
    body: '合成旧正文',
    identity_input: { mode: 'anonymous' },
    allowed_actions: [
      'whisperPostUpdate',
      'whisperPostSubmit',
      'whisperPostWithdraw',
      'whisperCommentsSetting',
    ],
  }
  let publicPost = {
    ...sample('PublicPost'),
    id: postId,
    version: 8,
    content_version: 3,
    comments_epoch: 2,
    comments_open: true,
    viewer_is_author: true,
    allowed_actions: ['whisperReportCreate', 'interactionBlockCreate', 'whisperCommentCreate'],
  }
  let nickname = {
    ...sample('NicknameState'),
    version: 5,
    active: { nickname_version: 3, label: '合成旧昵称' },
    candidate: {
      nickname_version: 4,
      label: '合成待审昵称',
      status: 'review_pending',
      review_result: null,
    },
    allowed_actions: ['whisperNicknameSet'],
  }
  const comment = {
    ...sample('PublicComment'),
    id: commentId,
    post_id: postId,
    parent_content_version: 3,
    allowed_actions: ['whisperReportCreate', 'interactionBlockCreate'],
  }
  let ownerComment: Record<string, unknown> = {
    ...sample('OwnerComment'),
    id: commentId,
    post_id: postId,
    version: 12,
    content_version: 5,
    status: 'published',
    body: '合成已审暖评',
    identity_input: { mode: 'anonymous' },
    parent_content_version: 3,
    recovery_body: null,
    allowed_actions: ['whisperCommentUpdate', 'whisperCommentWithdraw'],
  }
  let notification: Record<string, unknown> = {
    ...sample('Notification'),
    id: '6c500000-0000-4000-8000-000000000003',
    version: 15,
    kind: 'whisper_comment',
    target_kind: 'post',
    target_id: postId,
    comment_id: commentId,
    read: false,
    allowed_actions: ['whisperNotificationRead'],
  }
  const routes: string[] = []
  let transport: (input: Input) => Promise<unknown> = async (input) => {
    const path = input.url.split('?')[0]
    if (path === '/whispers/config') return structuredClone(moduleConfig)
    if (path === '/me/whispers') return structuredClone(workspace)
    if (path === '/me/whispers/nickname') {
      if (input.method === 'PUT')
        nickname = {
          ...nickname,
          version: nickname.version + 1,
          candidate: { ...nickname.candidate, label: String(input.data?.label) },
        }
      return structuredClone(nickname)
    }
    if (path === '/me/whispers/posts' && input.method === 'POST') {
      owner = {
        ...owner,
        version: owner.version + 1,
        body: String(input.data?.body),
        identity_input: input.data?.identity as { mode: string },
      }
      return structuredClone(owner)
    }
    if (path === `/me/whispers/posts/${postId}`) {
      if (input.method === 'PUT')
        owner = {
          ...owner,
          version: owner.version + 1,
          body: String(input.data?.body),
          identity_input: input.data?.identity as { mode: string },
        }
      return structuredClone(owner)
    }
    if (path === `/me/whispers/posts/${postId}/submit`) {
      owner = { ...owner, version: owner.version + 1, status: 'scanning' }
      return structuredClone(owner)
    }
    if (path === `/me/whispers/posts/${postId}/withdraw`) {
      owner = { ...owner, version: owner.version + 1, status: 'withdrawn' }
      return structuredClone(owner)
    }
    if (path === `/me/whispers/posts/${postId}/comments-setting`) {
      owner = {
        ...owner,
        version: owner.version + 1,
        comments_open: input.data?.comments_open,
      } as typeof owner
      return structuredClone(owner)
    }
    if (path === '/whispers/posts')
      return { items: [structuredClone(publicPost)], next_cursor: null }
    if (path === `/whispers/posts/${postId}`) return structuredClone(publicPost)
    if (path === `/whispers/posts/${postId}/comments` && input.method === 'POST') {
      ownerComment = {
        ...ownerComment,
        body: input.data?.body,
        identity_input: input.data?.identity,
        status: 'scanning',
        version: 13,
      }
      return structuredClone(ownerComment)
    }
    if (path === `/me/whispers/comments/${commentId}`) {
      if (input.method === 'PUT')
        ownerComment = {
          ...ownerComment,
          body: input.data?.body,
          identity_input: input.data?.identity,
          status: 'scanning',
          version: Number(ownerComment.version) + 1,
        }
      return structuredClone(ownerComment)
    }
    if (path === '/me/whispers/notifications')
      return { items: [structuredClone(notification)], next_cursor: null }
    if (path === `/me/whispers/notifications/${notification.id}/read`) {
      notification = { ...notification, version: Number(notification.version) + 1, read: true }
      return structuredClone(notification)
    }
    if (path === `/whispers/posts/${postId}/hugs`)
      return {
        post_id: postId,
        hug_count: input.data?.active ? 6 : 5,
        my_hug: {
          active: input.data?.active,
          version: Number(input.data?.expected_hug_version) + 1,
        },
      }
    if (path === `/whispers/posts/${postId}/comments`)
      return { items: [structuredClone(comment)], next_cursor: null }
    if (path === '/me/whispers/posts') return { items: [structuredClone(owner)], next_cursor: null }
    if (path === '/me/whispers/comments')
      return {
        items: [
          {
            ...sample('OwnerComment'),
            id: commentId,
            post_id: postId,
            status: 'context_changed',
            body: null,
            recovery_body: null,
          },
        ],
        next_cursor: null,
      }
    if (path === '/whispers/help')
      return { status: 'unavailable', version: null, verified_at: null, items: [] }
    if (path === '/whispers/reports') return { id: postId, status: 'pending' }
    if (path === '/me/interaction-blocks') return { accepted: true }
    throw new Error('未配置的合成路径：' + input.url)
  }
  const api = await whispersRuntime(async (options) => {
    const input = options as Input
    calls.push(structuredClone(input))
    return transport(input)
  }, session)
  const hooks: Record<string, ((query?: Record<string, string>) => unknown)[]> = {
    show: [],
    hide: [],
    unload: [],
    load: [],
  }
  const platform = {
    onShow: (fn: () => unknown) => hooks.show!.push(fn),
    onHide: (fn: () => unknown) => hooks.hide!.push(fn),
    onUnload: (fn: () => unknown) => hooks.unload!.push(fn),
    onLoad: (fn: () => unknown) => hooks.load!.push(fn),
  }
  const storeRuntime = await loadRuntime(
    readFileSync(new URL('../../src/stores/whispers.ts', import.meta.url), 'utf8'),
    { defineStore, session, useUserStore: () => user, callWhisper: api.callWhisper },
  )
  const module = storeRuntime.useWhispersStore()
  const controller = await loadRuntime(
    readFileSync(new URL('../../src/composables/use-whisper-page.ts', import.meta.url), 'utf8'),
    {
      ...platform,
      config,
      session,
      useUserStore: () => user,
      RequestError,
      createWhisperScope: api.createWhisperScope,
    },
  )
  const feed = await loadRuntime(
    readFileSync(new URL('../../src/composables/use-whisper-feed.ts', import.meta.url), 'utf8'),
    {
      ...platform,
      callWhisper: api.callWhisper,
      useWhispersStore: () => module,
      useWhisperPage: controller.useWhisperPage,
      mergeWhisperPage: content.mergeWhisperPage,
    },
  )
  const exports: Record<string, string> = {
    editor:
      'id,record,body,mode,tags,nickname,identityNotice,canSave,changed,load,save,submit,withdraw,commentsSetting,page',
    nickname: 'state,label,canSave,load,save,page',
    mine: 'tab,posts,comments,cursor,ready,load,switchTab,withdraw,page',
    detail: 'post,comments,cursor,commentsError,load,block,hug,page',
    'comment-editor': 'id,postId,record,post,body,mode,tags,nickname,canSubmit,load,submit,page',
    notifications: 'items,cursor,ready,capsule,capsuleNotice,unread,load,markRead,open,page',
    help: 'directory,load,page',
    report: 'target,typeCode,load,submit,page',
    index: 'items,cursor,ready,busy,error,load',
  }
  const source =
    pageScript(new URL(`../../src/pages/whispers/${name}.vue`, import.meta.url)) +
    `\nexport { ${exports[name]} }`
  const runtime = await loadRuntime(source, {
    ...platform,
    uni: { navigateTo: ({ url }: { url: string }) => routes.push(url) },
    ...api,
    ...content,

    session,
    RequestError,
    useWhispersStore: () => module,
    useWhisperPage: controller.useWhisperPage,
    useWhisperFeed: feed.useWhisperFeed,
  })
  for (const fn of hooks.load!) fn(query)
  for (const fn of hooks.show!) fn()
  await settle()
  return {
    runtime,
    routes,
    calls,
    setComment: (value: Record<string, unknown>) => {
      ownerComment = value
    },
    comment: () => ownerComment,
    setNotification: (value: Record<string, unknown>) => {
      notification = value
    },
    notification: () => notification,
    user,
    module,
    moduleConfig,
    workspace,
    config,
    owner: () => owner,
    publicPost: () => publicPost,
    nickname: () => nickname,
    setOwner: (value: typeof owner) => {
      owner = value
    },
    setPublic: (value: Record<string, unknown>) => {
      publicPost = value as typeof publicPost
    },
    transport: (fn: typeof transport) => {
      transport = fn
    },
    defaultTransport: () => transport,
    show: async () => {
      for (const fn of hooks.show!) fn()
      await settle()
    },
    hide: () => {
      for (const fn of hooks.hide!) fn()
    },
    unload: () => {
      for (const fn of hooks.unload!) fn()
    },
  }
}
