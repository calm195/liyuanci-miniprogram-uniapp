<script setup lang="ts">
import WishPond from '@/components/WishPond.vue'
import { useWishPondPage } from '@/composables/use-wish-pond-page'

const pond = useWishPondPage()
</script>

<template>
  <WishPond ref="pond" />
</template>
