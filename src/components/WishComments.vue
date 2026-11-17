<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import CommentThread from '@/components/CommentThread.vue'
import CommentActionBar from '@/components/CommentActionBar.vue'
import CommentReplies from '@/components/CommentReplies.vue'
import CommentComposer from '@/components/CommentComposer.vue'
import {
  listWishComments,
  listOwnWishComments,
  createWishComment,
  updateWishComment,
  withdrawWishComment,
  setWishComments,
  interactionKey,
} from '@/api/interactions'
import type { WishComment } from '@/types/interactions'
import {
  useWishCommentCommands,
  type CommentCommand,
  type CommentControlCommand,
} from '@/stores/wish-comment-commands'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
const props = defineProps<{
  wishId: string
  version: number
  contentVersion?: number
  commentsEpoch?: number
  commentsOpen?: boolean
  owner?: boolean
}>()
const emit = defineEmits<{ refresh: [] }>()
const user = useUserStore()
const recovery = useWishCommentCommands()
const roots = ref<WishComment[]>([])
const supplements = ref<WishComment[]>([])
const own = ref<WishComment[]>([])
const rootCursor = ref<string | null>(null)
const supplementCursor = ref<string | null>(null)
const ownCursor = ref<string | null>(null)
const replies = ref<Record<string, { items: WishComment[]; cursor: string | null }>>({})
const expandedReplies = ref<Record<string, boolean>>({})
const busy = ref(false)
const writing = ref(false)
const error = ref('')
const body = ref('')
const kind = ref<'comment' | 'author_supplement'>('comment')
const composerOpen = ref(false)
const ownExpanded = ref(false)
const reply = ref<WishComment | null>(null)
const editing = ref<WishComment | null>(null)
const pending = ref<CommentCommand | null>(null)
const pendingControl = ref<CommentControlCommand | null>(null)
function rememberCommand() {
  recovery.save(props.wishId, { pending: pending.value, control: pendingControl.value })
}
function restoreCommand() {
  const saved = recovery.get(props.wishId)
  pending.value = saved?.pending ?? null
  pendingControl.value = saved?.control ?? null
  if (pending.value) {
    body.value = pending.value.input.body
    kind.value = pending.value.input.kind
    composerOpen.value = true
  }
  if (pending.value || pendingControl.value) error.value = '操作结果尚未确认，请使用原请求重试。'
}
function revokeOnDenied(failure: unknown) {
  const status = (failure as { statusCode?: number }).statusCode
  if (status !== 401 && status !== 403) return false
  recovery.remove(props.wishId)
  clear()
  error.value = '当前评论访问权限已变化，请刷新后核对。'
  return true
}
let generation = 0
let readGeneration = 0
let mounted = true
let visible = true
const canWrite = computed(() => user.isLoggedIn && props.commentsOpen !== false)
const locked = computed(() => writing.value || !!pending.value || !!pendingControl.value)
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    published: '已公开',
    pending_review: '审核中',
    scanning: '扫描中',
    review_pending: '审核中',
    rejected: '未通过',
    withdrawn: '已撤回',
    context_changed: '原帖已变化',
  }
  return labels[status] || '处理中'
}
function label(item: WishComment) {
  return item.identity?.label || item.author?.nickname || item.author?.display_id || '同学'
}
function isAuthor(item: WishComment) {
  return item.identity?.is_author ?? item.author?.is_author ?? item.kind === 'author_supplement'
}
function ticket() {
  const current = generation
  const epoch = session.getEpoch()
  return () => mounted && visible && generation === current && epoch === session.getEpoch()
}
async function load() {
  if (!visible || !mounted) return
  const currentRead = ++readGeneration
  const context = ticket()
  const active = () => context() && currentRead === readGeneration
  busy.value = true
  error.value = ''
  try {
    const results = await Promise.all([
      listWishComments(props.wishId),
      listWishComments(props.wishId, { kind: 'author_supplement' }),
      session.getToken()
        ? listOwnWishComments(props.wishId)
        : Promise.resolve({ items: [], next_cursor: null }),
    ])
    if (!active()) return
    roots.value = results[0].items
    rootCursor.value = results[0].next_cursor
    supplements.value = results[1].items
    supplementCursor.value = results[1].next_cursor
    own.value = results[2].items
    ownCursor.value = results[2].next_cursor
    replies.value = {}
    expandedReplies.value = {}
  } catch (failure) {
    if (active() && !revokeOnDenied(failure)) error.value = '评论暂不可读取，请重试。'
  } finally {
    if (active()) busy.value = false
  }
}
async function more(section: 'comment' | 'author_supplement' | 'own') {
  const cursor =
    section === 'comment'
      ? rootCursor.value
      : section === 'own'
        ? ownCursor.value
        : supplementCursor.value
  if (!visible || !cursor || busy.value) return
  const currentRead = readGeneration
  const context = ticket()
  const active = () => context() && currentRead === readGeneration
  busy.value = true
  try {
    const result =
      section === 'own'
        ? await listOwnWishComments(props.wishId, cursor)
        : await listWishComments(props.wishId, { kind: section, cursor })
    if (!active()) return
    if (result.next_cursor === cursor) throw new Error('分页已变化')
    const list = section === 'comment' ? roots : section === 'own' ? own : supplements
    list.value = [
      ...list.value,
      ...result.items.filter((item) => !list.value.some((old) => old.id === item.id)),
    ]
    if (section === 'comment') rootCursor.value = result.next_cursor
    else if (section === 'own') ownCursor.value = result.next_cursor
    else supplementCursor.value = result.next_cursor
  } catch (failure) {
    if (active() && !revokeOnDenied(failure)) error.value = '评论分页读取失败，请重试。'
  } finally {
    if (active()) busy.value = false
  }
}
async function expand(root: WishComment) {
  if (!visible || busy.value) return
  const currentRead = readGeneration
  const context = ticket()
  const active = () => context() && currentRead === readGeneration
  const previous = replies.value[root.id]
  if (previous && !previous.cursor) return
  busy.value = true
  try {
    const result = await listWishComments(props.wishId, {
      root_comment_id: root.id,
      ...(previous?.cursor ? { cursor: previous.cursor } : {}),
    })
    if (!active()) return
    if (previous?.cursor && result.next_cursor === previous.cursor) throw new Error('分页已变化')
    replies.value[root.id] = {
      items: [
        ...(previous?.items ?? []),
        ...result.items.filter((item) => !previous?.items.some((old) => old.id === item.id)),
      ],
      cursor: result.next_cursor,
    }
  } catch (failure) {
    if (active() && !revokeOnDenied(failure)) error.value = '楼内回复读取失败，请重试。'
  } finally {
    if (active()) busy.value = false
  }
}
async function toggleReplies(root: WishComment) {
  if (!visible || !mounted) return
  if (expandedReplies.value[root.id]) {
    expandedReplies.value[root.id] = false
    return
  }
  if (busy.value && !replies.value[root.id]) return
  expandedReplies.value[root.id] = true
  // 收起只改变可见性，重新展开沿用已读内容和后续游标。
  if (!replies.value[root.id]) await expand(root)
}
function prepareSupplement() {
  if (locked.value) return
  composerOpen.value = true
  kind.value = 'author_supplement'
  reply.value = null
  editing.value = null
  body.value = ''
}
function beginReply(item: WishComment) {
  if (locked.value) return
  composerOpen.value = true
  reply.value = item
  kind.value = 'comment'
  editing.value = null
}
function beginEdit(item: WishComment) {
  if (locked.value) return
  composerOpen.value = true
  editing.value = item
  reply.value = null
  body.value = item.body ?? ''
  kind.value = item.kind
}
function cancel() {
  if (locked.value) return
  composerOpen.value = false
  reply.value = null
  editing.value = null
  body.value = ''
  kind.value = 'comment'
}
async function submit() {
  if (!visible || writing.value || pendingControl.value || (!canWrite.value && !pending.value))
    return
  error.value = ''
  if (!pending.value) {
    if (!body.value.trim() || Array.from(body.value).length > 500) {
      error.value = '请填写1–500字的评论。'
      return
    }
    const thread = reply.value
      ? {
          root_comment_id: reply.value.root_comment_id || reply.value.id,
          reply_to_comment_id: reply.value.id,
        }
      : editing.value?.root_comment_id
        ? {
            root_comment_id: editing.value.root_comment_id,
            ...(editing.value.reply_to_comment_id
              ? { reply_to_comment_id: editing.value.reply_to_comment_id }
              : {}),
          }
        : {}
    pending.value = {
      key: interactionKey(),
      id: editing.value?.id,
      version: editing.value?.version,
      input: {
        body: body.value,
        kind: kind.value,
        expected_post_version: props.version,
        expected_comments_epoch: props.commentsEpoch ?? 1,
        ...thread,
      },
    }
  }
  const command = pending.value
  rememberCommand()
  const active = ticket()
  writing.value = true
  try {
    const result = command.id
      ? await updateWishComment(
          command.id,
          { ...command.input, expected_version: command.version! },
          command.key,
        )
      : await createWishComment(props.wishId, command.input, command.key)
    if (!active()) return
    own.value = [result, ...own.value.filter((item) => item.id !== result.id)]
    pending.value = null
    rememberCommand()
    writing.value = false
    cancel()
    uni.$emit('app:notice', { message: '已提交评论，审核通过后公开', kind: 'success' })
    await load()
  } catch (failure) {
    if (!active()) return
    const status = (failure as { statusCode?: number }).statusCode ?? 0
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      pending.value = null
      rememberCommand()
      revokeOnDenied(failure)
      error.value = '评论或原帖状态已变化，请刷新核对后重新提交。'
      emit('refresh')
    } else error.value = '评论结果尚未确认，请使用原请求重试。'
  } finally {
    if (active()) writing.value = false
  }
}
async function runControl() {
  if (!visible || writing.value || !pendingControl.value) return
  const command = pendingControl.value
  rememberCommand()
  const active = ticket()
  writing.value = true
  error.value = ''
  try {
    if (command.kind === 'withdraw') await withdrawWishComment(command.comment, command.key)
    else await setWishComments(command.wishId, command.version, command.open, command.key)
    if (!active()) return
    pendingControl.value = null
    rememberCommand()
    uni.$emit('app:notice', {
      message:
        command.kind === 'withdraw' ? '评论已撤回' : command.open ? '评论已开放' : '评论已关闭',
      kind: 'success',
    })
    await load()
    emit('refresh')
  } catch (failure) {
    if (!active()) return
    const status = (failure as { statusCode?: number }).statusCode ?? 0
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      pendingControl.value = null
      rememberCommand()
      revokeOnDenied(failure)
      error.value = '评论状态已变化，请刷新后核对。'
      emit('refresh')
    } else error.value = '操作结果尚未确认，请使用原请求重试。'
  } finally {
    if (active()) writing.value = false
  }
}
async function withdraw(item: WishComment) {
  if (locked.value) return
  pendingControl.value = { kind: 'withdraw', comment: { ...item }, key: interactionKey() }
  await runControl()
}
async function toggleOpen() {
  if (locked.value || !props.owner) return
  pendingControl.value = {
    kind: 'setting',
    wishId: props.wishId,
    version: props.version,
    open: props.commentsOpen === false,
    key: interactionKey(),
  }
  await runControl()
}
function clear() {
  generation++
  readGeneration++
  roots.value = []
  supplements.value = []
  own.value = []
  replies.value = {}
  expandedReplies.value = {}
  rootCursor.value = null
  supplementCursor.value = null
  ownCursor.value = null
  pending.value = null
  pendingControl.value = null
  busy.value = false
  writing.value = false
  error.value = ''
  kind.value = 'comment'
  composerOpen.value = false
  ownExpanded.value = false
  body.value = ''
  reply.value = null
  editing.value = null
}
watch(
  () => [
    props.wishId,
    props.contentVersion,
    props.commentsEpoch,
    user.user?.id,
    session.getEpoch(),
  ],
  () => {
    clear()
    if (visible) {
      restoreCommand()
      void load()
    }
  },
  { immediate: true, flush: 'sync' },
)
onHide(() => {
  visible = false
  clear()
})
onShow(() => {
  if (visible) return
  visible = true
  restoreCommand()
  void load()
})
onUnmounted(() => {
  mounted = false
  clear()
})
</script>
<template>
  <view class="card wish-comments"
    ><text v-if="pending || pendingControl" class="comment-hint"
      >操作结果尚未确认。请使用原请求重试，核实后再进行新操作。</text
    ><button v-if="pendingControl" :disabled="writing" @click="runControl">原请求重试</button
    ><view class="comment-title"
      ><text class="section-title">聊聊这个心愿</text
      ><button v-if="canWrite || pending" @click="composerOpen = !composerOpen">
        {{ composerOpen ? '收起输入' : '写评论' }}</button
      ><button v-if="owner" :disabled="locked" @click="toggleOpen">
        {{ commentsOpen === false ? '开放评论' : '关闭评论' }}
      </button></view
    ><text v-if="commentsOpen === false">评论已关闭，已公开评论仍可阅读。</text
    ><view v-if="supplements.length || owner" class="supplements"
      ><text class="section-title">作者补充</text
      ><CommentThread
        v-for="item in supplements"
        :key="item.id"
        :label="label(item)"
        :body="item.body"
        author
        :time="item.published_at"
      /><button v-if="supplementCursor" :disabled="busy" @click="more('author_supplement')">
        更多补充</button
      ><button v-if="owner && canWrite" :disabled="locked" @click="prepareSupplement">
        ＋ 补充信息
      </button></view
    ><CommentThread
      v-for="item in roots"
      :key="item.id"
      :label="label(item)"
      :body="item.body"
      :author="isAuthor(item)"
      :time="item.published_at"
      ><template #actions>
        <CommentActionBar
          :can-reply="!!(canWrite && item.body && item.status !== 'withdrawn')"
          :reply-disabled="locked"
          :can-expand="!!(item.reply_count || replies[item.id])"
          :expanded="!!expandedReplies[item.id]"
          :reply-count="item.reply_count || replies[item.id]?.items.length"
          :expand-disabled="busy && !expandedReplies[item.id] && !replies[item.id]"
          @reply="beginReply(item)"
          @toggle="toggleReplies(item)"
        />
      </template>
      <CommentReplies
        :expanded="!!expandedReplies[item.id]"
        :loading="busy"
        :has-more="!!replies[item.id]?.cursor"
        @more="expand(item)"
      >
        <CommentThread
          v-for="child in replies[item.id]?.items ?? []"
          :key="child.id"
          nested
          :label="label(child)"
          :body="child.body"
          :author="isAuthor(child)"
          :time="child.published_at"
          :reply-to="child.reply_to_label"
          ><template #actions>
            <CommentActionBar
              :can-reply="!!(canWrite && child.body && child.status !== 'withdrawn')"
              :reply-disabled="locked"
              @reply="beginReply(child)"
            /> </template
        ></CommentThread>
      </CommentReplies> </CommentThread
    ><text v-if="!roots.length && !busy && !error">还没有公开评论，来聊聊吧。</text
    ><button v-if="rootCursor" :disabled="busy" @click="more('comment')">更多评论</button
    ><LoginLink v-if="!user.isLoggedIn">登录后评论</LoginLink
    ><CommentComposer
      v-if="canWrite || pending"
      v-model="body"
      :expanded="composerOpen"
      :title="
        editing
          ? '修改我的评论'
          : kind === 'author_supplement'
            ? '补充心愿'
            : reply
              ? `回复 ${label(reply)}`
              : '留下一句鼓励'
      "
      :disabled="locked"
      :submit-disabled="writing || !!pendingControl"
      :loading="isPageActionPending('wish-comment-submit')"
      :submit-label="pending ? '核实原请求' : editing ? '保存修改' : '发送'"
      :maxlength="500"
      :focus="composerOpen"
      :can-cancel="!!(editing || reply || kind === 'author_supplement')"
      :cancel-disabled="locked"
      @close="composerOpen = false"
      @submit="runPageAction(submit, 'wish-comment-submit')"
      @cancel="cancel" />
    <button
      v-if="own.length"
      class="own-toggle"
      :aria-expanded="ownExpanded"
      @click="ownExpanded = !ownExpanded"
    >
      我的评论记录（{{ own.length }}）{{ ownExpanded ? '收起' : '查看' }}</button
    ><view v-if="own.length" v-show="ownExpanded" class="own-comments"
      ><text class="section-title">我的评论记录</text
      ><view v-for="item in own" :key="item.id" class="own-comment"
        ><text
          >{{ item.kind === 'author_supplement' ? '作者补充' : '评论' }} ·
          {{ statusLabel(item.status) }}</text
        ><text>{{ item.body || '内容暂不可查看' }}</text
        ><view class="own-actions"
          ><button
            v-if="item.allowed_actions.some((action) => /update/i.test(action))"
            :disabled="locked"
            @click="beginEdit(item)"
          >
            修改</button
          ><button
            v-if="item.allowed_actions.some((action) => /withdraw/i.test(action))"
            :disabled="locked"
            @click="withdraw(item)"
          >
            撤回
          </button></view
        ></view
      ><button v-if="ownCursor" :disabled="busy" @click="more('own')">更多本人记录</button></view
    ><button v-if="error && !pending" :disabled="busy" @click="load">刷新评论</button
    ><AppNotice :message="error" kind="error"
  /></view>
</template>
<style scoped>
.comment-hint {
  color: var(--theme-muted);
  font-size: 24rpx;
}
.wish-comments {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.comment-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.comment-title button,
.own-actions button {
  margin: 0;
  padding: 4rpx 16rpx;
  min-height: 52rpx;
  font-size: 24rpx;
  border: 0;
  background: transparent;
  color: var(--theme-teal);
}
.own-comment {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 20rpx;
  background: var(--theme-canvas);
  border-radius: 18rpx;
}
.own-comments {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.own-comment {
  font-size: 25rpx;
}
.own-actions {
  display: flex;
  gap: 16rpx;
}
.supplements {
  border-bottom: 2rpx solid var(--theme-line);
  padding-bottom: 24rpx;
}
.own-comments[hidden] {
  display: none !important;
}
</style>
