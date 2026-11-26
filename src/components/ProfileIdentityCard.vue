<script setup lang="ts">
import ProfileAvatar from '@/components/ProfileAvatar.vue'
defineProps<{
  avatar?: string
  nickname: string
  changed: boolean
  editable: boolean
  disabled: boolean
  choicesLocked: boolean
  canRestore: boolean
  wechatAvailable: boolean
  saveLabel: string
  canSave: boolean
  hasPending: boolean
  chooseAvatar: () => Promise<void>
  save: () => Promise<boolean>
}>()
const emit = defineEmits<{
  wechat: []
  random: []
  restore: []
  cancel: []
  nickname: [value: string]
}>()
function editNickname(event: unknown) {
  const input = event as { detail?: { value?: unknown }; target?: { value?: unknown } }
  const value = input.detail?.value ?? input.target?.value
  if (typeof value === 'string') emit('nickname', value)
}
</script>
<template>
  <view class="profile-identity">
    <view class="profile-identity-preview">
      <ProfileAvatar :src="avatar" :size="104" />
      <view class="profile-identity-summary">
        <text class="profile-identity-name">{{ nickname || '填写昵称' }}</text>
        <text class="profile-identity-caption">{{ changed ? '待保存' : '当前头像与昵称' }}</text>
      </view>
    </view>
    <view v-if="editable" class="profile-identity-options">
      <text class="profile-identity-heading">头像与昵称</text>
      <button
        v-if="wechatAvailable"
        class="profile-choice"
        :disabled="choicesLocked"
        @click="emit('wechat')"
      >
        <text>从微信选用头像和昵称</text><text class="profile-choice-meta">›</text>
      </button>
      <button class="profile-choice" :disabled="choicesLocked" @click="emit('random')">
        <text>系统随机头像和昵称</text><text class="profile-choice-meta">换一组 ›</text>
      </button>
      <button
        class="profile-choice"
        :disabled="choicesLocked"
        :loading="isPageActionPending('profile-choose-avatar')"
        @click="runPageAction(chooseAvatar, 'profile-choose-avatar')"
      >
        <text>自选头像</text><text class="profile-choice-meta">相册或相机 ›</text>
      </button>
      <button
        v-if="canRestore"
        class="profile-choice"
        :disabled="choicesLocked"
        @click="emit('restore')"
      >
        <text>恢复默认头像</text><text class="profile-choice-meta">›</text>
      </button>
      <label for="profile-identity-nickname" class="profile-nickname-label">昵称</label>
      <input
        id="profile-identity-nickname"
        :value="nickname"
        :maxlength="-1"
        :disabled="choicesLocked"
        placeholder="填写昵称"
        placeholder-class="field-placeholder"
        @input="editNickname"
      />
      <slot />
      <view class="profile-save-actions">
        <button
          v-if="changed && !hasPending"
          class="ui-button"
          :disabled="disabled"
          @click="emit('cancel')"
        >
          取消修改
        </button>
        <button
          class="ui-button ui-button-primary"
          :disabled="disabled || !canSave"
          :loading="isPageActionPending('profile-identity-save')"
          @click="runPageAction(save, 'profile-identity-save')"
        >
          {{ saveLabel }}
        </button>
      </view>
    </view>
  </view>
</template>
<style scoped>
.profile-identity,
.profile-identity-options,
.profile-identity-summary {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  min-width: 0;
}
.profile-identity-preview {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 26rpx;
  border: 1px solid var(--theme-line);
  border-radius: 32rpx;
  background: var(--theme-surface);
}
.profile-identity-options {
  padding: 24rpx;
  border: 1px solid var(--theme-line);
  border-radius: 32rpx;
  background: var(--theme-surface);
}
.profile-identity text,
.profile-identity input {
  margin: 0;
}
.profile-identity-name,
.profile-identity-heading {
  color: var(--theme-ink);
  font-weight: 700;
  font-size: 30rpx;
  overflow-wrap: anywhere;
}
.profile-identity-caption,
.profile-choice-meta {
  color: var(--theme-muted);
  font-size: 24rpx;
}
button.profile-choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  min-width: 0;
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 8rpx 14rpx;
  border: 0;
  border-radius: 14rpx;
  background: var(--theme-canvas);
  color: var(--theme-ink);
  text-align: left;
  font-size: 26rpx;
}
.profile-choice::after {
  border: 0;
}
.profile-choice-meta {
  flex-shrink: 0;
}
.profile-nickname-label {
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 650;
}
.profile-save-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.profile-save-actions button {
  flex: 1 0 auto;
  min-height: 44px;
  margin: 0;
}
</style>
