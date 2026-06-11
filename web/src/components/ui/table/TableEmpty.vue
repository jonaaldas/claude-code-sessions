<script setup lang="ts">
import { cn } from "@/lib/utils";
defineProps<{ class?: string; colspan?: number }>();
</script>

<template>
  <tr>
    <td
      :colspan="colspan ?? 1"
      :class="cn('p-8 text-center text-muted-foreground', $props.class)"
    >
      <slot />
    </td>
  </tr>
</template>
