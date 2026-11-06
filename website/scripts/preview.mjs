import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const qa=process.argv.includes('--qa');
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port',qa?'4322':'4321','--inspector-port',qa?'9231':'9230',...(qa?['--assets','.qa-dist','--name','xinwei-website-qa']:[]),'--persist-to',qa?'.wrangler/state-qa':'.wrangler/state-main'],{
  stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:resolve('.wrangler/logs'),WRANGLER_REGISTRY_PATH:resolve('.wrangler/registry'),WRANGLER_SEND_METRICS:'false'},
});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
