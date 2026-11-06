import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['node_modules/astro/bin/astro.mjs','build'],{stdio:'inherit',env:{...process.env,XINWEI_BROWSER_QA:'1',XINWEI_INDEXABLE:'0'}});
process.exitCode=result.status??1;
