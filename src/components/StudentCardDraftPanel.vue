<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import type { StudentCardAsset } from '@/types/api'
defineProps<{
  photo: StudentCardAsset | null
  candidate: StudentCardAsset | null
  scannedAt: string
  disabled: boolean
  noUpload: boolean
  uploading: boolean
  querying: boolean
  scanMessage: string
  chooseCard: () => Promise<void>
  queryAsset: () => Promise<void>
  cancelReplacement: () => Promise<void>
}>()
const emit = defineEmits<{ 'show-record': [] }>()
</script>
<template>
  <view class="student-photo-card">
    <text class="student-photo-title">学生卡照片</text>
    <view v-if="photo?.scan_status === 'approved'" class="student-photo-scan">
      <AppIcon name="shield" :size="46" />
      <view class="student-photo-summary">
        <text class="student-photo-state">安全扫描通过</text>
        <text v-if="scannedAt" class="student-photo-caption">{{ scannedAt }}</text>
        <text class="student-photo-caption">已保存，下次可继续使用。</text>
      </view>
    </view>
    <text v-else class="student-photo-caption"
      >请上传清晰、完整的本人学生卡，支持 JPG 或 PNG。</text
    >
    <view class="student-photo-actions">
      <button
        v-if="photo?.scan_status === 'approved'"
        class="ui-button"
        :disabled="disabled"
        @click="emit('show-record')"
      >
        查看照片与记录
      </button>
      <button
        class="ui-button"
        :disabled="disabled || noUpload || candidate?.scan_status === 'pending'"
        :loading="isPageActionPending('student-card-choose')"
        @click="runPageAction(chooseCard, 'student-card-choose')"
      >
        {{
          uploading
            ? '正在上传'
            : photo
              ? '替换照片'
              : candidate
                ? '重新选择照片'
                : '选择学生卡照片'
        }}
      </button>
    </view>
    <text v-if="candidate?.scan_status === 'pending'" class="student-photo-caption">
      新照片正在扫描，可以离开后再查看。
    </text>
    <text v-else-if="candidate?.scan_status === 'rejected'" class="student-photo-warning">
      新照片未通过安全扫描。{{ photo ? '原照片仍可使用。' : '请重新选择。' }}
    </text>
    <text v-if="scanMessage" class="student-photo-caption">{{ scanMessage }}</text>
    <view v-if="candidate || scanMessage" class="student-photo-actions">
      <button
        v-if="candidate?.scan_status === 'pending'"
        class="ui-button"
        :disabled="disabled"
        :loading="isPageActionPending('student-card-cancel-replacement')"
        @click="runPageAction(cancelReplacement, 'student-card-cancel-replacement')"
      >
        {{ photo ? '取消替换，继续使用原照片' : '取消这次上传' }}
      </button>
      <button
        class="ui-button"
        :disabled="disabled || querying"
        :loading="isPageActionPending('student-card-refresh')"
        @click="runPageAction(queryAsset, 'student-card-refresh')"
      >
        {{ scanMessage ? '重新读取照片' : '刷新扫描状态' }}
      </button>
    </view>
  </view>
</template>
<style scoped>
.student-photo-card {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  min-width: 0;
  padding: 26rpx;
  border: 1px solid var(--theme-line);
  border-radius: 32rpx;
  background: var(--theme-surface);
}
.student-photo-title {
  font-size: 31rpx;
  font-weight: 700;
}
.student-photo-card text {
  margin: 0;
}
.student-photo-scan,
.student-photo-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}
.student-photo-scan {
  flex-wrap: nowrap;
  padding: 20rpx;
  border-radius: 20rpx;
  background: var(--theme-success);
  color: var(--theme-success-ink);
}
.student-photo-summary {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.student-photo-state {
  font-size: 28rpx;
  font-weight: 700;
}
.student-photo-caption,
.student-photo-warning {
  color: var(--theme-muted);
  font-size: 25rpx;
  line-height: 1.5;
}
.student-photo-scan .student-photo-caption {
  color: var(--theme-success-ink);
}
.student-photo-warning {
  color: var(--theme-warning-ink);
}
.student-photo-actions .ui-button {
  width: auto;
  flex: 1 0 auto;
  min-height: 44px;
  margin: 0;
  font-size: 26rpx;
}
</style>
