<script setup lang="ts">
import { computed } from 'vue'
import WishSupportButton from '@/components/WishSupportButton.vue'
import AppIcon from '@/components/AppIcon.vue'
import ProfileAvatar from '@/components/ProfileAvatar.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import ContentStats from '@/components/ContentStats.vue'
import WishImages from '@/components/WishImages.vue'
import { displayTime } from '@/utils/time'
import { categories, campuses, rewards } from '@/types/wish'
import type { WishResult } from '@/types/wish'
import { publicWishBody, ownWishBody, wishStateLabels } from '@/utils/wish'
const props = defineProps<{ wish: WishResult; own?: boolean; compact?: boolean }>()
const emit = defineEmits<{ supportChange: [] }>()
const body = computed(() => (props.own ? ownWishBody(props.wish) : publicWishBody(props.wish)))
const content = computed(() =>
  body.value ? (props.own ? props.wish.own_content || props.wish.public : props.wish.public) : null,
)
const author = computed(() =>
  props.own
    ? '我的心愿'
    : body.value
      ? props.wish.public?.author?.nickname || '一位许愿的同学'
      : '',
)
</script>
<template>
  <view class="wish-preview">
    <navigator :url="`/pages/wish-detail/index?id=${encodeURIComponent(wish.id)}`">
      <view class="card-author">
        <ProfileAvatar
          :src="wish.public?.author?.avatar_url"
          :size="68"
          class="avatar-placeholder"
        />
        <view class="author-copy">
          <text class="author-name">{{ author || '心愿暂不可查看' }}</text>
          <text v-if="!compact" class="author-hint">{{ wishStateLabels[wish.current_state] }}</text>
        </view>
        <text
          v-if="content?.category"
          class="category-pill"
          :class="{ mint: content.category === 'help' }"
        >
          {{ categories.find((item) => item.value === content?.category)?.label }}
        </text>
      </view>
      <text v-if="content" class="section-title">{{ content.title || '未命名心愿' }}</text>
      <IdentityTags :tags="wish.public?.author?.identity_tags" />
      <text class="wish-body">{{ body || '内容暂不可查看' }}</text>
      <WishImages
        v-if="wish.public?.images?.length"
        :images="wish.public.images"
        :wish-id="wish.id"
        compact
      />
      <text v-if="wish.expires_at || wish.public?.expires_at" class="expiry-date"
        >到期 {{ displayTime(wish.expires_at || wish.public?.expires_at || '') }}</text
      >
      <ContentStats
        :applications="wish.public?.application_count ?? wish.application_count"
        :comments="wish.public?.comment_count ?? wish.comment_count"
        :views="wish.public?.view_count ?? wish.view_count"
      />
      <text v-if="body && wish.public?.school_related" class="notice">{{
        wish.public.notice_text || '未经证实'
      }}</text>
      <view v-if="content || !compact" class="card-meta">
        <view v-if="content?.campus" class="meta-item">
          <AppIcon name="pin" :size="28" />
          <text class="ui-text">{{
            campuses.find((item) => item.value === content?.campus)?.label
          }}</text>
        </view>
        <view v-if="content?.reward_method" class="meta-item">
          <AppIcon name="gift" :size="28" />
          <text class="ui-text">{{
            content.reward_text ||
            rewards.find((item) => item.value === content?.reward_method)?.label
          }}</text>
        </view>
        <text v-if="!compact" class="wish-link">查看心愿 ›</text>
      </view>
    </navigator>
    <WishSupportButton
      v-if="wish.current_state === 'published' && wish.public?.support_count !== undefined"
      :wish-id="wish.id"
      :count="wish.public.support_count"
      :supported="wish.public.supported === true"
      @change="emit('supportChange')"
    />
  </view>
</template>

<style scoped>
.expiry-date {
  display: block;
  color: var(--theme-muted);
  font-size: 24rpx;
  margin-top: 16rpx;
}
.wish-link {
  margin-left: auto;
  color: var(--theme-teal);
  font-size: 26rpx;
  font-weight: 600;
  white-space: nowrap;
}
</style>
