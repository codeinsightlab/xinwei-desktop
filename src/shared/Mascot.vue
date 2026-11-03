<script setup lang="ts">
import { computed } from 'vue';
import fallback from '../assets/mascot-work.svg';
import type { Pose } from '../domain/engagement';
const props=withDefaults(defineProps<{pose?:Pose;compact?:boolean}>(),{pose:'neutral'});
const images=import.meta.glob<string>('../assets/mascot/*.{png,webp,svg}',{eager:true,query:'?url',import:'default'});
const source=computed(()=>Object.entries(images).find(([path])=>path.split('/').at(-1)?.split('.')[0]===props.pose)?.[1]);
</script>
<template><img :src="source||fallback" class="brand-illustration" :class="{compact}" :data-pose="pose" :data-placeholder="!source" alt="" aria-hidden="true" draggable="false"/></template>
