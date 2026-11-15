<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '@/components/AppPage.vue'
import ProfileAvatar from '@/components/ProfileAvatar.vue'
import AppIcon from '@/components/AppIcon.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import ContentStats from '@/components/ContentStats.vue'
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { getPublicProfile } from '@/api/applications'
import type { ProfileContents, PublicProfile } from '@/types/application'
const user = useUserStore()
const id = ref('')
const profile = ref<PublicProfile | null>(null)
const items = ref<ProfileContents['items']>([])
const cursor = ref<string | null>(null)
const usedCursors = new Set<string>()
const busy = ref(false)
const error = ref('')
const menuTarget = ref('')
const readEpoch = ref(-1)
let visible = false
let generation = 0
const currentProfile = computed(() =>
  readEpoch.value === session.getEpoch() ? profile.value : null,
)
const rows = computed(() => (currentProfile.value ? items.value : []))
function checkCursor(next: unknown) {
  // 游标仅在当前读取链内使用；重复或畸形值停止翻页，刷新后重新建立读取链。
  if (next === null) return
  if (typeof next !== 'string' || !next || usedCursors.has(next))
    throw new Error('分页游标异常，请刷新后重试')
  usedCursors.add(next)
}
function clear() {
  menuTarget.value = ''
  profile.value = null
  items.value = []
  cursor.value = null
  usedCursors.clear()
  readEpoch.value = -1
}
async function load(more = false) {
  if (busy.value || (more && (!currentProfile.value || !cursor.value))) return
  const current = ++generation
  const epoch = session.getEpoch()
  const nextCursor = more ? cursor.value! : undefined
  if (!more) clear()
  error.value = ''
  if (!id.value || config.useMock) {
    error.value = config.useMock ? '公开主页需连接真实服务。' : '公开主页链接无效。'
    return
  }
  busy.value = true
  try {
    const result = await getPublicProfile(id.value, nextCursor)
    if (!visible || current !== generation || epoch !== session.getEpoch()) return
    if (result.profile.id !== id.value) throw new Error('公开主页目标不匹配')
    checkCursor(result.next_cursor)
    profile.value = result.profile
    items.value = [
      ...(more ? items.value : []),
      ...result.items.filter(
        (item) =>
          !more ||
          !items.value.some((old) => old.kind === item.kind && old.content.id === item.content.id),
      ),
    ]
    cursor.value = result.next_cursor
    readEpoch.value = epoch
  } catch {
    if (!visible || current !== generation || epoch !== session.getEpoch()) return
    clear()
    error.value = '公开主页不存在或当前不可查看，请刷新后重试。'
  } finally {
    if (visible && current === generation) busy.value = false
  }
}
function leave() {
  visible = false
  generation++
  clear()
  busy.value = false
  error.value = ''
}
watch(
  () => user.user?.id,
  () => {
    generation++
    clear()
    busy.value = false
  },
  { flush: 'sync' },
)
onLoad((query) => {
  id.value = typeof query?.id === 'string' ? query.id : ''
})
onShow(() => {
  visible = true
  void load()
})
onHide(leave)
onUnload(leave)
onPullDownRefresh(async () => {
  try {
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
<template>
  <AppPage>
    <text v-if="busy" class="page-footnote">加载中…</text>
    <view v-if="currentProfile" class="card public-profile-card">
      <view class="public-profile-heading">
        <ProfileAvatar :src="currentProfile.avatar_url" :size="100" />
        <view class="public-profile-copy">
          <text class="profile-name">{{ currentProfile.nickname }}</text>
          <text v-if="currentProfile.display_id" class="profile-id"
            >ID {{ currentProfile.display_id }}</text
          >
        </view>
        <button
          v-if="user.user && currentProfile.id !== user.user.id"
          class="content-action profile-more"
          aria-label="更多用户操作"
          :aria-expanded="menuTarget === 'profile'"
          @click="menuTarget = menuTarget === 'profile' ? '' : 'profile'"
        >
          <AppIcon name="more" :size="36" />
        </button>
      </view>
      <IdentityTags :tags="currentProfile.identity_tags" />
      <view
        v-if="menuTarget === 'profile' && user.user && currentProfile.id !== user.user.id"
        class="profile-menu"
      >
        <navigator
          class="content-action"
          :url="`/pages/blacklist/index?targetId=${encodeURIComponent(currentProfile.id)}`"
          >屏蔽此用户</navigator
        >
      </view>
    </view>
    <view v-if="currentProfile" class="section-heading"
      ><text class="section-title">公开内容</text></view
    >
    <view
      v-for="item in rows"
      :key="`${item.kind}-${item.content.id}`"
      class="card public-content-card"
    >
      <navigator
        class="public-content-link"
        hover-class="tap-feedback"
        :url="
          item.kind === 'wish'
            ? `/pages/wish-detail/index?id=${encodeURIComponent(item.content.id)}`
            : `/pages/stories/index?id=${encodeURIComponent(item.content.id)}`
        "
      >
        <view class="public-content-heading">
          <text class="section-title">{{
            item.content.title || (item.kind === 'wish' ? '一份心愿' : '一个还愿故事')
          }}</text>
          <text class="category-pill">{{ item.kind === 'wish' ? '心愿' : '还愿故事' }}</text>
        </view>
        <text class="public-content-body">{{ item.content.body }}</text>
        <text v-if="item.content.school_related" class="notice">未经证实</text>
        <view class="public-content-footer">
          <ContentStats :comments="item.content.comment_count" :views="item.content.view_count" />
          <text class="content-action">查看详情 ›</text>
        </view>
      </navigator>
      <button
        class="content-action profile-more"
        aria-label="更多内容操作"
        :aria-expanded="menuTarget === `${item.kind}-${item.content.id}`"
        @click="
          menuTarget =
            menuTarget === `${item.kind}-${item.content.id}`
              ? ''
              : `${item.kind}-${item.content.id}`
        "
      >
        <AppIcon name="more" :size="32" />
      </button>
      <view v-if="menuTarget === `${item.kind}-${item.content.id}`" class="profile-menu">
        <navigator
          class="content-action"
          :url="`/pages/report/index?kind=${item.kind}&id=${encodeURIComponent(item.content.id)}`"
          >举报此内容</navigator
        >
      </view>
    </view>
    <text v-if="currentProfile && !busy && !rows.length" class="empty-state"
      >暂无可展示的公开内容</text
    >
    <button
      v-if="currentProfile && cursor"
      :disabled="busy"
      :loading="isPageActionPending('pages-public-profile-index-button-2')"
      @click="runPageAction(() => load(true), 'pages-public-profile-index-button-2')"
    >
      加载下一页
    </button>
    <AppNotice :message="error" kind="error" />
  </AppPage>
</template>
<style scoped>
.public-profile-card {
  border-top: 6rpx solid var(--theme-teal);
}
.public-profile-heading,
.public-content-heading,
.public-content-footer {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.public-profile-copy {
  flex: 1;
  min-width: 0;
}
.profile-id {
  margin: 0;
  color: var(--theme-muted);
  font-size: 22rpx;
}
.public-content-card {
  position: relative;
}
.public-content-link {
  margin: 0;
  color: var(--theme-ink);
}
.public-content-heading {
  padding-right: 64rpx;
  flex-wrap: wrap;
  gap: 12rpx;
}
.public-content-heading .section-title {
  flex: 1;
  min-width: 160rpx;
}
.public-content-body {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  margin: 20rpx 0 0;
  line-height: 1.7;
  color: var(--theme-ink);
}
.public-content-footer {
  justify-content: space-between;
  flex-wrap: wrap;
  margin-top: 16rpx;
  border-top: 1rpx solid var(--theme-line);
}
.profile-more {
  min-width: 64rpx;
  flex-shrink: 0;
}
.public-content-card > .profile-more {
  position: absolute;
  top: 16rpx;
  right: 20rpx;
}
.profile-menu {
  margin-top: 12rpx;
  padding: 0 20rpx;
  border-radius: 12rpx;
  background: var(--theme-canvas);
}
</style>
