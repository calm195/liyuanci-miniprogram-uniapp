<script setup lang="ts">
import WishPond from '@/components/WishPond.vue'
import { useWishPondPage } from '@/composables/use-wish-pond-page'

const pond = useWishPondPage(true)
</script>

<template>
  <WishPond ref="pond" main-tab />
</template>
