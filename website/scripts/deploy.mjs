import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const env={...process.env,WRANGLER_LOG_PATH:resolve('.wrangler/logs'),WRANGLER_SEND_METRICS:'false',XINWEI_INDEXABLE:'1',XINWEI_BROWSER_QA:'0',XINWEI_REVISION:process.env.GITHUB_SHA??'local'};
const steps=process.argv.includes('--dry-run') ? [['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run']] : [
  ['scripts/cloudflare-preflight.mjs'],
  ['node_modules/astro/bin/astro.mjs','build'],
  ['--test','tests-built/site.test.mjs'],
  ['node_modules/wrangler/bin/wrangler.js','deploy'],
  ['scripts/verify-live.mjs'],
];
for(const args of steps){
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env});
  if(result.status!==0){process.exitCode=result.status??1;break;}
}
