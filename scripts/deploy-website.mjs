import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const repo='codeinsightlab/xinwei-desktop';
const workflow='deploy-website.yml';
function gh(args,{inherit=false}={}){
  const result=spawnSync('gh',args,{encoding:'utf8',stdio:inherit?'inherit':'pipe'});
  if(result.error)throw new Error(`无法运行 GitHub CLI：${result.error.message}。请安装 gh 并执行 gh auth login。`);
  if(result.status!==0)throw new Error(result.stderr?.trim()||`gh 命令失败（${result.status}）`);
  return result.stdout?.trim()??'';
}
try{
  const args=['run','list','--repo',repo,'--workflow',workflow,'--event','workflow_dispatch','--branch','main','--limit','10','--json','databaseId,headSha,url'];
  const previous=new Set(JSON.parse(gh(args)).map(run=>run.databaseId));
  console.log('重新发布 GitHub main 上已提交的官网；本地未提交修改不会被上传。');
  const output=gh(['workflow','run',workflow,'--repo',repo,'--ref','main']);
  if(output)console.log(output);
  let id=output.match(/\/actions\/runs\/(\d+)/)?.[1];
  for(let attempt=0;!id&&attempt<20;attempt++){
    await delay(1500);
    const run=JSON.parse(gh(args)).find(run=>!previous.has(run.databaseId));
    if(run)id=String(run.databaseId);
  }
  if(!id)throw new Error('已触发发布，但尚未找到运行记录；请查看仓库 Actions，避免重复触发。');
  console.log(`发布进度：https://github.com/${repo}/actions/runs/${id}`);
  gh(['run','watch',id,'--repo',repo,'--exit-status'],{inherit:true});
  console.log('官网发布检查通过：https://xinwei.learnaiwithcode.com');
}catch(error){console.error(error.message);process.exitCode=1;}
