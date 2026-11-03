import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], clearScreen: false, server: { port: 1420, strictPort: true }, envPrefix: ['VITE_', 'TAURI_ENV_'], build: { target: 'es2022' }, test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
