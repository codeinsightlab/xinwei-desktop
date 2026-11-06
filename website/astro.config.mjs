import { defineConfig } from 'astro/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const indexable = process.env.XINWEI_INDEXABLE === '1';
const qa = process.env.XINWEI_BROWSER_QA === '1';

export default defineConfig({
  site: 'https://xinwei.learnaiwithcode.com',
  output: 'static',
  outDir: qa ? './.qa-dist' : './dist',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { build: { sourcemap: false }, define: { 'import.meta.env.XINWEI_BROWSER_QA': JSON.stringify(qa ? '1' : '0') } },
  integrations: [{name:'xinwei-preview-privacy',hooks:{'astro:build:done':async({dir})=>{
    const headers=new URL('_headers',dir);
    const html=await readFile(new URL('index.html',dir),'utf8');
    const hashes=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
    let rules=await readFile(headers,'utf8');
    if(hashes.length)rules=rules.replace("script-src 'self'",`script-src 'self' ${hashes.join(' ')}`);
    await writeFile(headers,rules);
    if(!indexable){
      await writeFile(headers,(await readFile(headers,'utf8'))+'\n/*\n  X-Robots-Tag: noindex, nofollow\n');
      await writeFile(new URL('robots.txt',dir),'User-agent: *\nDisallow: /\n');
    }
  }}}],
});
