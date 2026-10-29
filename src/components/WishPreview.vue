<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { categories, campuses, rewards } from '@/types/wish'
import type { WishResult } from '@/types/wish'
import { publicWishBody, ownWishBody, wishStateLabels } from '@/utils/wish'
const props = defineProps<{ wish: WishResult; own?: boolean; compact?: boolean }>()
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
  <navigator
    :url="`/pages/wish-detail/index?id=${encodeURIComponent(wish.id)}`"
    class="wish-preview"
  >
    <view class="card-author">
      <view class="avatar-placeholder"><AppIcon name="fish" :size="38" /></view>
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
    <text class="wish-body">{{ body || '内容暂不可查看' }}</text>
    <view v-if="content" class="card-meta">
      <view v-if="content.campus" class="meta-item">
        <AppIcon name="pin" :size="28" />
        <text class="ui-text">{{
          campuses.find((item) => item.value === content?.campus)?.label
        }}</text>
      </view>
      <view v-if="content.reward_method" class="meta-item">
        <AppIcon name="gift" :size="28" />
        <text class="ui-text">{{
          rewards.find((item) => item.value === content?.reward_method)?.label
        }}</text>
      </view>
    </view>
    <text v-if="body && wish.public?.school_related" class="notice">{{
      wish.public.notice_text || '未经证实'
    }}</text>
    <view v-if="!compact" class="card-footer">
      <text class="ui-text">每一份善意，都值得被看见</text>
      <view class="outline-pill">查看心愿 ›</view>
    </view>
  </navigator>
</template>
