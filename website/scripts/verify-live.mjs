import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

const origin='https://xinwei.learnaiwithcode.com';
async function request(path){return fetch(origin+path,{redirect:'follow',signal:AbortSignal.timeout(15_000),headers:{'Cache-Control':'no-cache'}});}
async function verify(){
  const r=await request('/');if(r.status!==200)throw Error(`首页 HTTP ${r.status}`);
  const html=await r.text();
  if(!html.includes('薪慰 Xinwei')||!html.includes('上班已经够苦了'))throw Error('首页不是薪慰官网');
  if(!html.includes(`<link rel="canonical" href="${origin}/"`))throw Error('canonical不匹配');
  if(/name="robots" content="[^"]*noindex/.test(html)||r.headers.get('x-robots-tag')?.includes('noindex'))throw Error('正式首页仍是noindex');
  const revision=html.match(/name="deployment-revision" content="([^"]+)"/)?.[1];
  if(process.env.GITHUB_SHA&&revision!==process.env.GITHUB_SHA)throw Error('线上版本尚未更新到当前GitHub提交');
  const local=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const downloads=[...local.matchAll(/<a\b[^>]*class="download-link"[^>]*href="([^"]+)"/g)].map(match=>match[1]);
  for(const url of downloads){
    if(!url.startsWith('https://github.com/codeinsightlab/xinwei-desktop/releases/download/')||!html.includes(`href="${url}"`))throw Error('线上下载入口与当前发布配置不一致');
    const file=await fetch(url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(15_000)});
    if(file.status!==200||Number(file.headers.get('content-length'))<1000)throw Error(`安装包不可公开下载：HTTP ${file.status}`);
  }
  const assets=[...new Set([...local.matchAll(/(?:src|href)="(\/(?:_astro|assets)\/[^"?#]+)"/g)].map(match=>match[1]))];
  await Promise.all(assets.map(async path=>{const a=await request(path);if(a.status!==200)throw Error(`资源 ${path} HTTP ${a.status}`);await a.arrayBuffer();}));
  for(const path of ['/__xinwei_missing_page__','/docs/PRD.md','/wrangler.jsonc','/package.json']){const missing=await request(path);if(missing.status!==404)throw Error(`${path} 应为404，实际${missing.status}`);}
  const robots=await request('/robots.txt');if(robots.status!==200||!(await robots.text()).includes('Allow: /'))throw Error('robots抓取规则异常');
  const sitemap=await request('/sitemap.xml');if(sitemap.status!==200||!(await sitemap.text()).includes(origin))throw Error('sitemap异常');
  const image=await request('/og.png');if(image.status!==200||!image.headers.get('content-type')?.includes('image/png'))throw Error('分享图片异常');
  console.log(JSON.stringify({origin,revision,https:true,assetsChecked:assets.length,downloadsChecked:downloads.length,notFound:404,indexable:true,verifiedAt:new Date().toISOString()},null,2));
}
let success=false;
for(let attempt=1;attempt<=12;attempt++){
  try{await verify();success=true;break;}catch(error){console.error(`上线检查 ${attempt}/12：${error.message}`);if(attempt<12)await delay(5000);}
}
if(!success)process.exitCode=1;
