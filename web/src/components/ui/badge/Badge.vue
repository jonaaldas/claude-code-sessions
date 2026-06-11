<script setup lang="ts">
import { type BadgeVariants, badgeVariants } from ".";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{ variant?: BadgeVariants["variant"]; class?: string }>(),
  { variant: "default" }
);
</script>

<template>
  <span :class="cn(badgeVariants({ variant }), props.class)">
    <slot />
  </span>
</template>
