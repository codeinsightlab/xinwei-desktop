import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
if(import.meta.env.DEV){const {setupPreview}=await import('./dev/preview');setupPreview();}
createApp(App).mount('#app');
