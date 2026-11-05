import { defineConfig } from '@playwright/test';
const port = Number(process.env.XINWEI_E2E_PORT ?? 1420);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid XINWEI_E2E_PORT');
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:30000,use:{baseURL,channel:process.platform==='darwin'?'chrome':'msedge',headless:true,viewport:{width:900,height:850},screenshot:'only-on-failure',trace:'retain-on-failure'},outputDir:'artifacts/e2e',reporter:[['list'],['json',{outputFile:'artifacts/e2e-results.json'}]],webServer:{command:`npm run dev -- --port ${port}`,url:baseURL,reuseExistingServer:!process.env.CI,timeout:30000}});
