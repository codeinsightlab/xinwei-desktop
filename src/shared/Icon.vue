<script setup lang="ts">
defineProps<{name: string; size?: number}>();
const paths: Record<string,string> = {
  sun:'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  hidden:'m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.2C3.5 8.4 2 12 2 12s3.5 7 10 7c2 0 3.8-.7 5.3-1.7M10 10a3 3 0 0 0 4 4',
  settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM10 2h4l.7 3 2.3 1.3 3-.8 2 3.5-2.2 2.2v2.6L22 16l-2 3.5-3-.8-2.3 1.3-.7 3h-4l-.7-3L7 18.7l-3 .8L2 16l2.2-2.2v-2.6L2 9l2-3.5 3 .8L9.3 5 10 2Z',
  close:'m6 6 12 12M18 6 6 18', pin:'m9 3 6 0-1 5 4 4v2H6v-2l4-4-1-5Zm3 11v7',
  arrow:'M5 12h14m-5-5 5 5-5 5', check:'m5 12 4 4L19 6', calendar:'M4 5h16v16H4V5Zm3-3v6m10-6v6M4 10h16',
  leaf:'M5 20C2 8 8 3 21 3c0 13-5 19-14 15m-2 2L16 9', back:'m14 6-6 6 6 6', clock:'M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
};
</script>
<template><svg :width="size || 18" :height="size || 18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.sun"/></svg></template>
