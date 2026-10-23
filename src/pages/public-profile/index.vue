<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { session } from '@/utils/session'
import { useUserStore } from '@/stores/user'
import { getPublicProfile } from '@/api/applications'
import type { ProfileContents, PublicProfile } from '@/types/application'
import { campuses, genders } from '@/types/wish'
const user = useUserStore()
const id = ref('')
const profile = ref<PublicProfile | null>(null)
const items = ref<ProfileContents['items']>([])
const cursor = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const readEpoch = ref(-1)
let visible = false
let generation = 0
const currentProfile = computed(() =>
  readEpoch.value === session.getEpoch() ? profile.value : null,
)
const rows = computed(() => (currentProfile.value ? items.value : []))
function clear() {
  profile.value = null
  items.value = []
  cursor.value = null
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
</script>
<template>
  <view class="page">
    <text class="title">公开主页</text>
    <button :disabled="busy" @click="load()">刷新</button>
    <text v-if="busy">加载中…</text>
    <view v-if="currentProfile" class="card">
      <text>{{ currentProfile.nickname }}</text>
      <text v-if="currentProfile.identity_tags?.campus"
        >校区：{{
          campuses.find((item) => item.value === currentProfile?.identity_tags?.campus)?.label
        }}</text
      >
      <text v-if="currentProfile.identity_tags?.gender"
        >性别：{{
          genders.find((item) => item.value === currentProfile?.identity_tags?.gender)?.label
        }}</text
      >
      <text v-if="currentProfile.identity_tags?.grade"
        >年级：{{ currentProfile.identity_tags.grade }}</text
      >
    </view>
    <view v-for="item in rows" :key="`${item.kind}-${item.content.id}`" class="card">
      <text>{{ item.kind === 'wish' ? '公开心愿' : '还愿故事' }}</text>
      <text>{{ item.content.body }}</text>
      <text v-if="item.content.school_related">未经证实</text>
      <navigator
        v-if="item.kind === 'wish'"
        :url="`/pages/wish-detail/index?id=${encodeURIComponent(item.content.id)}`"
        >查看心愿详情</navigator
      >
    </view>
    <text v-if="currentProfile && !busy && !rows.length">暂无可展示的公开内容</text>
    <button v-if="currentProfile && cursor" :disabled="busy" @click="load(true)">加载下一页</button>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>
<style scoped>
.page {
  padding: 32rpx;
}
.title {
  font-size: 40rpx;
  font-weight: bold;
}
.card {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: white;
}
text {
  display: block;
  margin-bottom: 20rpx;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.error {
  margin-top: 24rpx;
  color: #b42318;
}
</style>
