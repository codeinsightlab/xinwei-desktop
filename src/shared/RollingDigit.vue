<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

const props=defineProps<{value:number; direction:number}>();
const strip=ref<HTMLElement>();
let animation:Animation|undefined;

watch(()=>props.value,(value,previous)=>{
  const element=strip.value;
  if(!element)return;
  // Read the visible position before cancelling so an interrupted roll stays smooth.
  const height=element.getBoundingClientRect().height/30;
  const transform=getComputedStyle(element).transform;
  const offset=transform==='none'?previous:-new DOMMatrixReadOnly(transform).m42/height;
  animation?.cancel();
  if(!height || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let from=((offset%10)+10)%10;
  let to=value;
  if(props.direction>=0 && to<from)to+=10;
  if(props.direction<0 && to>from)from+=10;
  animation=element.animate([
    {transform:`translateY(${-from/30*100}%)`},
    {transform:`translateY(${-to/30*100}%)`},
  ],{duration:1000,easing:'linear'});
},{flush:'pre'});

onBeforeUnmount(()=>animation?.cancel());
</script>

<template>
  <span class="rolling-digit"><span ref="strip" class="rolling-digit-strip" :style="{transform:`translateY(${-value/30*100}%)`}"><span v-for="n in 30" :key="n">{{(n-1)%10}}</span></span></span>
</template>
