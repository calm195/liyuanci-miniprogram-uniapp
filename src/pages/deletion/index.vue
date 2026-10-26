<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { config } from '@/config'
import { useUserStore } from '@/stores/user'
import { useDeletionStore } from '@/stores/deletion'
import { session } from '@/utils/session'
import { canDeleteAccount, validDeletionReceipt } from '@/utils/deletion'

const user = useUserStore()
const deletion = useDeletionStore()
const acknowledged = ref(false)
const inputReceipt = ref('')
const preparing = ref(false)
const confirming = ref(false)
const notice = ref('')
let visible = false
let generation = 0
const busy = computed(
  () => preparing.value || confirming.value || deletion.submitting || deletion.reading,
)
const maySubmit = computed(
  () =>
    !config.useMock &&
    acknowledged.value &&
    !busy.value &&
    !deletion.receipt &&
    !deletion.uncertain &&
    canDeleteAccount(user.user, user.validated),
)
async function refresh() {
  if (busy.value || config.useMock || deletion.receipt || deletion.uncertain || !session.getToken())
    return
  const current = ++generation
  preparing.value = true
  notice.value = ''
  try {
    await user.refresh(false)
  } catch {
    if (visible && current === generation) notice.value = '当前账号资格读取失败，请重试。'
  } finally {
    if (current === generation) preparing.value = false
  }
}
async function confirmDeletion() {
  if (!maySubmit.value) return
  const owner = user.user!.id
  const epoch = session.getEpoch()
  await refresh()
  if (!visible || owner !== user.user?.id || epoch !== session.getEpoch() || !maySubmit.value)
    return
  const version = user.user!.version
  const current = generation
  confirming.value = true
  uni.showModal({
    title: '确认注销账号',
    content:
      '受理后当前会话将失效，普通内容和相关交互不可继续访问，清理将在后台进行。此操作不可撤销，是否确认提交？',
    confirmText: '确认注销',
    success: (result) => {
      confirming.value = false
      if (
        !result.confirm ||
        !visible ||
        current !== generation ||
        !acknowledged.value ||
        owner !== user.user?.id ||
        epoch !== session.getEpoch()
      )
        return
      void deletion.submit(owner, epoch, version)
    },
    fail: () => {
      confirming.value = false
    },
  })
}
function retry() {
  if (busy.value || !visible || !deletion.uncertain) return
  void deletion.submit('', -1, -1, true)
}
function queryReceipt() {
  if (busy.value) return
  const handle = inputReceipt.value.trim()
  if (!validDeletionReceipt(handle)) {
    notice.value = '请输入有效的删除回执。'
    return
  }
  notice.value = ''
  inputReceipt.value = ''
  void deletion.read(handle)
}
function copyReceipt() {
  if (!deletion.receipt || busy.value) return
  uni.setClipboardData({
    data: deletion.receipt,
    success: () => {
      if (visible) notice.value = '回执已复制，请自行妥善保存，勿分享给他人。'
    },
  })
}
function toggle(event: { detail: { value: string[] } }) {
  acknowledged.value = event.detail.value.includes('ack')
}
function leave() {
  visible = false
  generation++
  preparing.value = false
  confirming.value = false
  acknowledged.value = false
  inputReceipt.value = ''
  notice.value = ''
}
onShow(() => {
  visible = true
  void refresh()
})
onHide(leave)
onUnload(leave)
</script>
<template>
  <view class="page">
    <text class="title">账号注销与删除进度</text>
    <view class="card">
      <text
        >注销受理后，账号会话将撤销，普通资料、心愿、故事、申请和双方普通聊天等进入清理，相关内容不可继续访问，旧审核或投递不会恢复这些内容。</text
      >
      <text
        >尚存用户自有内容按隐私规则处理，必要时保持屏障并重新审核；注销不会使其自动公开或恢复原匹配。</text
      >
      <text
        >已认定违规或已生成危机事件的限定证据按规则保留。备份保留 90
        天，恢复须重新执行删除；注销不表示立即抹除全部备份或合法保留证据。</text
      >
      <text>提交不可撤销。处理完成前只显示处理中，不代表全部物理清理已完成。</text>
    </view>
    <text v-if="config.useMock">合成模式不提交注销，也不查询真实回执。</text>
    <template v-if="!deletion.receipt && !deletion.uncertain">
      <navigator v-if="!user.isLoggedIn" url="/pages/login/index">前往登录</navigator>
      <button :disabled="busy || config.useMock" @click="refresh">重新读取账号资格</button>
      <text v-if="user.isLoggedIn && !canDeleteAccount(user.user, user.validated)"
        >当前服务未授予注销动作或资格尚未校验。</text
      >
      <checkbox-group @change="toggle">
        <label
          ><checkbox
            value="ack"
            :checked="acknowledged"
            :disabled="busy"
          />我已阅读注销影响，确认申请注销本人账号</label
        >
      </checkbox-group>
      <button :disabled="!maySubmit" @click="confirmDeletion">申请注销账号</button>
    </template>
    <text v-if="deletion.submitting">正在提交，请等待受理结果…</text>
    <view v-if="deletion.uncertain" class="card">
      <text>注销结果尚未确认，请勿重复发起。会话失效不等于已取得删除回执或清理完成。</text>
      <button :disabled="busy || !user.isLoggedIn" @click="retry">手动重试原请求</button>
    </view>
    <view v-if="deletion.receipt" class="card">
      <text>删除回执已取得。回执是查询凭证，仅在本次应用运行期间保留，请自行保存。</text>
      <text selectable>{{ deletion.receipt }}</text>
      <button :disabled="busy" @click="copyReceipt">复制回执</button>
      <button :disabled="busy || config.useMock" @click="deletion.read()">查询当前进度</button>
    </view>
    <view v-if="deletion.status" class="card">
      <text v-if="deletion.status.status === 'processing'">处理中：后台清理尚未完成。</text>
      <text v-else>已完成：服务端报告本次注销清理完成。合法保留证据及备份规则仍适用。</text>
      <text v-if="deletion.status.status === 'processing' && deletion.status.retryable_error"
        >后台清理遇到可重试问题，仍需等待后续处理。</text
      >
    </view>
    <view class="card">
      <text>已有删除回执可直接查询，无需登录。回执无效或过期不代表清理已停止或完成。</text>
      <input
        v-model="inputReceipt"
        :disabled="busy"
        :maxlength="2048"
        placeholder="输入自行保存的删除回执"
      />
      <button :disabled="busy || config.useMock || !inputReceipt.trim()" @click="queryReceipt">
        使用回执查询
      </button>
    </view>
    <text v-if="deletion.reading">正在读取进度…</text>
    <text v-if="notice">{{ notice }}</text>
    <text v-if="deletion.error" class="error">{{ deletion.error }}</text>
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
  background: white;
  border-radius: 20rpx;
}
text {
  display: block;
  margin: 16rpx 0;
  overflow-wrap: anywhere;
}
button {
  margin-top: 16rpx;
}
input {
  border: 1px solid #ccc;
  padding: 16rpx;
}
.error {
  color: #b42318;
}
</style>
