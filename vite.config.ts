import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import pkg from './package.json' with { type: 'json' };
export default defineConfig({ plugins: [vue()], define: { __APP_VERSION__: JSON.stringify(pkg.version) }, clearScreen: false, server: { port: 1420, strictPort: true }, envPrefix: ['VITE_', 'TAURI_ENV_'], build: { target: 'es2022' }, test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
