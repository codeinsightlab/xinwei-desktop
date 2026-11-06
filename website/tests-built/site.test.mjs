import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const root=new URL('../dist/',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');

test('primary text, FAQ and honest pending state are static HTML',()=>{
  for(const text of ['上班已经够苦了','显示的钱会真的到账吗','为什么要点击开工','公开下载准备中'])assert.ok(html.includes(text));
  assert.equal((html.match(/data-download-status="pending"/g)??[]).length,2);
  assert.ok(!html.includes('href="#"'));assert.ok(!html.includes('download-link'));
});
test('interactive controls start disabled; no fake system window controls',()=>{
  assert.match(html,/<button[^>]*id="demo-play"[^>]*disabled/);
  for(const name of ['关闭窗口','最小化','最大化','置顶'])assert.ok(!html.includes(`aria-label="${name}"`));
});
test('assets referenced by markup exist inside dist; no docs or desktop data published',async()=>{
  for(const match of html.matchAll(/(?:src|href)="(\/(?:assets\/[^"?#]+|_astro\/[^"?#]+|favicon.svg))"/g))await readFile(new URL(match[1].slice(1),root));
  const top=await readdir(root);for(const name of ['docs','src','src-tauri','.env','package.json','wrangler.jsonc'])assert.ok(!top.includes(name));
});
test('six standalone character vectors contain no scripts, remote resources or bitmaps',async()=>{
  for(const name of ['working','resting','offduty','quiet','welcome','hero']){
    const svg=await readFile(new URL(`assets/mascot/${name}.svg`,root),'utf8');
    assert.ok(svg.includes('viewBox="0 0 240 180"'));assert.ok(!/<script|<image|href=|<text/i.test(svg));
  }
});
test('SEO points to canonical domain; custom 404 and noindex headers exist',async()=>{
  assert.ok(html.includes('https://xinwei.learnaiwithcode.com/og.png'));
  assert.ok((await readFile(new URL('sitemap.xml',root),'utf8')).includes('https://xinwei.learnaiwithcode.com/'));
  assert.ok((await readFile(new URL('404.html',root),'utf8')).includes('noindex'));
  assert.ok((await readFile(new URL('_headers',root),'utf8')).includes('X-Robots-Tag: noindex'));
  assert.ok((await readFile(new URL('og.png',root))).length>1000);
});
test('SEO structured data matches visible FAQ and never invents ratings, price or downloads',()=>{
  const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);const data=JSON.parse(scripts[0][1]);
  const faq=data['@graph'].find(x=>x['@type']==='FAQPage');assert.equal(faq.mainEntity.length,7);
  for(const question of faq.mainEntity)assert.ok(html.includes(question.name));
  const app=data['@graph'].find(x=>x['@type']==='SoftwareApplication');
  for(const unsupported of ['offers','aggregateRating','downloadUrl','softwareVersion'])assert.equal(app[unsupported],undefined);
  assert.ok(!html.includes('本地验收：注入单调时钟'));assert.ok(!html.includes('noindex, nofollow, index'));
});
test('production client excludes local acceptance toolbar',async()=>{
  for(const file of await readdir(new URL('_astro/',root))){
    if(!file.endsWith('.js'))continue;
    const script=await readFile(new URL(`_astro/${file}`,root),'utf8');
    for(const marker of ['仅本地验收','18:00 样例','18:47 样例','当日边界'])assert.ok(!script.includes(marker));
  }
});
