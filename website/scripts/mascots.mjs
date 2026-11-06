import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The outline is copied verbatim from the repository's existing mascot-work.svg.
// These are new website variants, not vector reconstructions of the concept PNG.
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('../src/assets/mascot-work.svg', root), 'utf8');
const body = source.match(/<path d="(M48 68[^"]+)"/)?.[1];
if (!body) throw new Error('Original mascot outline not found');
const eyes = '<path d="M55 36v2m23-2v2" stroke-width="3.2"/><path d="m62 46 3 2 3-2"/>';
const neutral = '<path d="M53 37h4m19 0h4m-17 10h5"/>';
const laptop = '<g id="laptop"><path d="m10 46 37 1 9 25H19L10 46Z" fill="#363A3C"/><path d="M16 73h75M56 71c3-7 10-9 16-4 4 4 1 8-5 8H53" fill="#F5F3E9"/><circle cx="32" cy="59" r="2" fill="#F5F3E9" stroke="none"/></g>';
const variants = {
  working: {face:eyes,prop:laptop,accent:'<path d="m24 19-4-7m11 4-1-8"/>'},
  hero: {face:eyes,prop:'<g id="cup"><path d="M20 49h28l-3 25H23Z" fill="#D8FA57"/><path d="M22 54c-15-3-15 16 1 12M28 56l6 7 7-8m-7 8v7m-5-4h10"/><path d="M52 68c-5-8-12-8-15-3-2 4 0 8 6 9h14" fill="#F5F3E9"/></g>',accent:'<path d="m101 13 3-8m4 13 7-6m-4 14 8-2"/>'},
  quiet: {face:neutral,prop:'<path id="arm" d="M43 67c1-8 12-10 19-3m17 4c2-5 12-5 17-2"/>',accent:''},
  welcome: {face:eyes,prop:'<path id="arm" d="M92 51c6-2 5-16 10-17 5-1 6 4 5 9 9-3 11 6 6 12l-13 13" fill="#F5F3E9"/>',accent:'<path d="m108 19 3-7m4 14 7-3"/>'},
  offduty: {face:eyes,prop:'<g id="arm" fill="#F5F3E9"><path d="M45 54 29 37c-6-7-12-1-8 5l20 28M94 52l15-17c6-6 12 0 8 6l-16 27"/></g>',accent:'<path d="m19 23-5-6m9 0-2-8m89 13 5-7"/>'},
  resting: {face:'<path d="M52 39q4 4 8 0m14 0q4 4 8 0m-18 9h4"/>',prop:'<path id="arm" d="M38 69c0-11 24-12 26 1m10 0c2-12 25-11 27-1" fill="#F5F3E9"/>',accent:''},
};
await mkdir(new URL('public/assets/mascot/', root), { recursive:true });
for (const [pose, v] of Object.entries(variants)) {
  const accent = v.accent ? `<g id="accent" stroke="#D8FA57" stroke-width="3.6">${v.accent}</g>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180" fill="none"><g transform="translate(0 14) scale(1.85)" stroke="#202321" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 77q48 3 107 0" stroke="#F5F3E9" stroke-width="2"/><g id="body"><path d="${body}" fill="#F5F3E9"/></g><g id="eyes">${v.face}</g>${v.prop}${accent}</g></svg>\n`;
  await writeFile(new URL(`public/assets/mascot/${pose}.svg`, root), svg);
}
await mkdir(new URL('public/assets/decoration/', root), { recursive:true });
for (const [name,svg] of Object.entries({
  underline:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 14" fill="none"><path d="M4 10Q80 0 175 8" stroke="#D8FA57" stroke-width="5" stroke-linecap="round"/></svg>',
  rays:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 52" fill="none"><path d="m8 20 7-15m10 23L39 12M38 40l17-6" stroke="#D8FA57" stroke-width="5" stroke-linecap="round"/></svg>',
  sticker:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48"><path d="M15 5 200 1q17 0 16 14l-2 18q0 10-16 10L13 48Q0 48 2 34L1 19Q0 7 15 5Z" fill="#D8FA57"/></svg>',
})) await writeFile(new URL(`public/assets/decoration/${name}.svg`,root),svg+'\n');
console.log('Created six website SVG variants from',fileURLToPath(new URL('../src/assets/mascot-work.svg',root)));
