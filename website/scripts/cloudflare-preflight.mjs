import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Read-only ownership gate. Never prints credentials, modifies DNS, or creates services.
const host='xinwei.learnaiwithcode.com';
const worker='xinwei-website';
async function existingToken() {
  if(process.env.CLOUDFLARE_API_TOKEN)return process.env.CLOUDFLARE_API_TOKEN;
  const paths=[join(homedir(),'Library/Preferences/.wrangler/config/default.toml'),join(homedir(),'.config/.wrangler/config/default.toml'),join(homedir(),'.wrangler/config/default.toml')];
  for(const path of paths){
    let text;
    try{text=await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
    const token=text.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
    const expiry=text.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
    if(token&&expiry&&Date.parse(expiry)>Date.now())return token;
  }
  throw new Error('缺少有效 Cloudflare 凭据；现有 OAuth 如已过期，请在本机终端用 Wrangler 重新登录。不要把 Token 粘贴到聊天。');
}
async function run(){
  const token=await existingToken();
  async function api(route,{allowMissing=false}={}){
    const r=await fetch('https://api.cloudflare.com/client/v4'+route,{headers:{Authorization:`Bearer ${token}`}});
    if(allowMissing&&r.status===404)return null;
    const j=await r.json();
    if(!r.ok||!j.success)throw new Error(`Cloudflare 只读检查失败：${route.split('?')[0]}，HTTP ${r.status}，错误码 ${(j.errors??[]).map(e=>e.code).join(',')}`);
    return j.result;
  }
  const zones=await api('/zones?name=learnaiwithcode.com');
  if(zones.length!==1)throw new Error('无法唯一确认 learnaiwithcode.com zone；停止部署。');
  const zone=zones[0],account=zone.account.id;
  if(zone.status!=='active')throw new Error('Zone 未激活；停止部署。');
  if(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_ACCOUNT_ID!==account)throw new Error('配置的账号与目标 zone 不一致；停止部署。');
  const [script,domains,dns,routes]=await Promise.all([
    api(`/accounts/${account}/workers/scripts/${worker}/settings`,{allowMissing:true}),
    api(`/accounts/${account}/workers/scripts/${worker}/domains/records`),
    api(`/zones/${zone.id}/dns_records?name=${host}`),api(`/zones/${zone.id}/workers/routes`),
  ]);
  const domain=domains.find(d=>d.hostname===host);
  if(domain&&(domain.service!==worker||domain.environment&&domain.environment!=='production'))throw new Error('目标 Custom Domain 绑定其他服务；停止覆盖。');
  if(script&&!domain)throw new Error('同名 Worker 已存在，但未绑定目标域名，归属不能自动确认；停止覆盖。');
  if(dns.length&&!domain)throw new Error('目标 DNS 已存在，归属不能自动确认；停止覆盖。');
  for(const route of routes){
    const pattern=route.pattern.replace(/^https?:\/\//,'');
    const patternHost=pattern.split('/')[0];
    const regex=new RegExp('^'+patternHost.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$');
    if(regex.test(host)&&route.script&&route.script!==worker)throw new Error('目标域名命中其他 Worker Route；停止覆盖。');
  }
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),accountId:account,zoneId:zone.id,worker,host,existingWebsite:Boolean(script&&domain),safeToDeploy:true},null,2));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
